import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .component_matcher import match_component
from .extractor import (
    EXTRACTOR_VERSION,
    completion_signal,
    extract_roles,
    global_risks,
    infer_domain,
    workflow_id_from_title,
)
from .validator import validate_workflow_draft

VIDEO_EXTRACTOR_VERSION = "demo-video-to-workflow-v1"

ACTION_EVENTS = {"navigate", "click", "fill", "select", "upload", "review", "submit", "confirm", "wait", "verify"}


def load_event_trace(path: Optional[str]) -> List[Dict[str, Any]]:
    if not path:
        return []
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        data = data.get("events", [])
    if not isinstance(data, list):
        raise ValueError("Demo video event trace must be a list or an object with an 'events' list")
    return data


def extract_workflow_draft_from_demo_video(
    video_path: str,
    component_registry: Optional[List[Dict[str, Any]]] = None,
    transcript_text: str = "",
    event_trace: Optional[List[Dict[str, Any]]] = None,
    workflow_name: Optional[str] = None,
) -> Dict[str, Any]:
    registry = component_registry or []
    events = sorted(event_trace or [], key=lambda event: float(event.get("ts", 0)))
    title = workflow_name or infer_title(video_path, transcript_text)
    steps = build_steps_from_events(events, registry)
    branches = extract_video_branches(transcript_text, steps)
    unresolved_questions = unresolved_questions_for_video(video_path, transcript_text, events, steps, branches)
    roles = extract_roles(transcript_text)

    mapped_count = sum(1 for step in steps if step["component_ref"]["status"] == "mapped")
    workflow = {
        "workflow_id": workflow_id_from_title(title),
        "workflow_name": title,
        "description": first_transcript_sentence(transcript_text),
        "business_goal": first_transcript_sentence(transcript_text) or title,
        "domain": infer_domain(f"{title}\n{transcript_text}"),
        "target_user_roles": roles,
        "intent_aliases": sorted({title, title.lower(), re.sub(r"[^a-z0-9 ]+", " ", title.lower()).strip()}),
        "source": {
            "document_path": video_path,
            "document_title": title,
            "extracted_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "extractor_version": VIDEO_EXTRACTOR_VERSION,
            "source_type": "demo_video",
            "transcript_available": bool(transcript_text.strip()),
            "event_trace_available": bool(events),
            "base_text_extractor_version": EXTRACTOR_VERSION,
        },
        "prerequisites": extract_video_prerequisites(transcript_text),
        "steps": steps,
        "branches": branches,
        "global_risks": global_risks(steps),
        "unresolved_questions": unresolved_questions,
    }
    draft = {
        "schema_version": "workflow-draft-v1",
        "workflow": workflow,
        "quality": {
            "overall_confidence": overall_video_confidence(steps, transcript_text, events, unresolved_questions),
            "mapped_component_ratio": round(mapped_count / max(len(steps), 1), 2),
            "steps_missing_verification": [step["step_id"] for step in steps if step["validation_rule"]["type"] == "unknown"],
            "high_risk_steps": [step["step_id"] for step in steps if step["risk_level"] == "high"],
            "unmapped_components": [
                {"step_id": step["step_id"], "label_hint": step["component_ref"].get("label_hint", "")}
                for step in steps
                if step["component_ref"]["status"] == "unmapped"
            ],
            "needs_human_review": True,
        },
        "validation_report": {"schema_valid": False, "errors": []},
    }
    draft["validation_report"] = validate_workflow_draft(draft)
    return draft


def build_steps_from_events(events: List[Dict[str, Any]], registry: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    action_events = [event for event in events if normalize_event_type(event) in ACTION_EVENTS]
    if not action_events:
        action_events = [{"ts": 0, "event": "ask_user", "label": "Describe demonstrated workflow"}]

    steps = []
    for index, event in enumerate(action_events, start=1):
        action_type = normalize_event_type(event)
        if action_type not in ACTION_EVENTS:
            action_type = "ask_user"
        instruction = instruction_from_event(event, action_type)
        route = event.get("route") or event.get("page_route")
        component_ref = match_component(
            instruction,
            str(event.get("label") or event.get("target") or ""),
            route,
            action_type,
            registry,
        )
        risk_level = risk_from_event(event, action_type, component_ref)
        validation_rule = validation_from_event(event, action_type, component_ref, route, events)
        steps.append(
            {
                "step_id": f"step_{index:02d}",
                "title": title_from_event(event, action_type),
                "user_goal": user_goal_from_event(event, action_type),
                "action_type": action_type,
                "instruction": instruction,
                "expected_page_or_route": route,
                "component_ref": component_ref,
                "input_fields": input_fields_from_event(event),
                "validation_rule": validation_rule,
                "completion_signal": completion_signal(instruction, action_type),
                "fallback": fallback_from_event(component_ref, risk_level),
                "risk_level": risk_level,
                "requires_confirmation": risk_level == "high",
                "confidence": step_confidence_from_video(event, component_ref, validation_rule),
                "source_quote_or_source_span": source_span_from_event(event),
            }
        )
    return steps


def normalize_event_type(event: Dict[str, Any]) -> str:
    event_type = str(event.get("event") or event.get("type") or "").lower()
    if event_type in {"input", "type"}:
        return "fill"
    if event_type in {"route", "page"}:
        return "navigate"
    if event_type == "tap":
        return "click"
    if event_type == "submit_click":
        return "submit"
    return event_type or "unknown"


def instruction_from_event(event: Dict[str, Any], action_type: str) -> str:
    label = event.get("label") or event.get("target") or event.get("text") or ""
    route = event.get("route") or event.get("page_route")
    if action_type == "navigate":
        return f"Navigate to {route or label or 'the demonstrated page'}."
    if action_type == "fill":
        value_hint = " with the demonstrated value" if event.get("value") else ""
        return f"Fill {label or 'the demonstrated field'}{value_hint}."
    if action_type == "select":
        return f"Select {event.get('value') or label or 'the demonstrated option'}."
    if action_type == "upload":
        return f"Upload {label or 'the demonstrated file'}."
    if action_type in {"submit", "confirm"}:
        return f"{action_type.title()} using {label or 'the demonstrated control'}."
    if action_type == "ask_user":
        return "Ask a reviewer to describe the demonstrated workflow because no structured video events were provided."
    return f"{action_type.title()} {label or 'the demonstrated control'}."


def title_from_event(event: Dict[str, Any], action_type: str) -> str:
    label = event.get("label") or event.get("target") or event.get("route") or "demonstrated UI"
    return f"{action_type.title()} {label}".strip()


def user_goal_from_event(event: Dict[str, Any], action_type: str) -> str:
    return title_from_event(event, action_type)


def input_fields_from_event(event: Dict[str, Any]) -> List[Dict[str, Any]]:
    if normalize_event_type(event) != "fill":
        return []
    return [
        {
            "label": event.get("label") or event.get("target") or "demonstrated field",
            "required": bool(event.get("required")),
            "confidence": 0.78 if event.get("label") else 0.52,
        }
    ]


def validation_from_event(
    event: Dict[str, Any],
    action_type: str,
    component_ref: Dict[str, Any],
    route: Optional[str],
    all_events: List[Dict[str, Any]],
) -> Dict[str, Any]:
    next_observation = next_observation_after(event, all_events)
    if next_observation:
        event_type = normalize_event_type(next_observation)
        if event_type == "navigate" and (next_observation.get("route") or next_observation.get("page_route")):
            expected = next_observation.get("route") or next_observation.get("page_route")
            return {"type": "route_changed", "target": expected, "expected": expected, "inferred": False, "confidence": 0.82}
        if str(next_observation.get("event", "")).lower() == "toast":
            return {"type": "toast_visible", "target": "toast", "expected": next_observation.get("text", "success"), "inferred": False, "confidence": 0.86}
        if str(next_observation.get("event", "")).lower() == "status":
            return {"type": "business_status", "target": next_observation.get("label", "status"), "expected": next_observation.get("value", ""), "inferred": False, "confidence": 0.84}
    if action_type == "navigate" and route:
        return {"type": "route_changed", "target": route, "expected": route, "inferred": True, "confidence": 0.72}
    if action_type == "fill":
        return {"type": "field_valid", "target": component_ref.get("component_id") or component_ref.get("label_hint") or "field", "expected": "value accepted", "inferred": True, "confidence": 0.68}
    if action_type in {"submit", "confirm"}:
        return {"type": "manual_check", "target": component_ref.get("component_id") or "submission result", "expected": "submission accepted", "inferred": True, "confidence": 0.58}
    if action_type in {"click", "select", "upload", "review", "verify", "wait", "ask_user"}:
        return {"type": "manual_check", "target": component_ref.get("component_id") or "current page", "expected": "demonstrated state is reached", "inferred": True, "confidence": 0.62}
    return {"type": "unknown", "target": "", "expected": "", "inferred": True, "confidence": 0.3}


def next_observation_after(event: Dict[str, Any], events: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    ts = float(event.get("ts", 0))
    for candidate in sorted(events, key=lambda item: float(item.get("ts", 0))):
        if float(candidate.get("ts", 0)) <= ts:
            continue
        if str(candidate.get("event", "")).lower() in {"toast", "status", "route", "page", "navigate"}:
            return candidate
    return None


def risk_from_event(event: Dict[str, Any], action_type: str, component_ref: Dict[str, Any]) -> str:
    text = " ".join(str(event.get(key, "")) for key in ["label", "target", "text", "risk_hint"])
    if re.search(r"\b(delete|remove|publish|submit|approve|reject|send|commit|finalize)\b", text, re.IGNORECASE):
        return "high"
    if action_type in {"submit", "confirm"}:
        return "high"
    if action_type in {"fill", "select", "upload"}:
        return "medium"
    if component_ref.get("confidence", 0) < 0.35 and action_type not in {"navigate", "review", "verify", "wait", "ask_user"}:
        return "medium"
    return "low"


def fallback_from_event(component_ref: Dict[str, Any], risk_level: str) -> Dict[str, Any]:
    if component_ref.get("status") == "unmapped":
        return {
            "on_failure": "component_not_found",
            "recovery_action": "ask_user",
            "message": "Video-derived component mapping is unresolved; ask a reviewer to identify the UI control.",
            "confidence": 0.82,
        }
    if risk_level == "high":
        return {
            "on_failure": "validation_failed",
            "recovery_action": "show_manual_instruction",
            "message": "Stop before repeating the high-risk video action and request human confirmation.",
            "confidence": 0.8,
        }
    return {
        "on_failure": "unknown",
        "recovery_action": "show_manual_instruction",
        "message": "Show the demonstrated action and ask the user how to proceed if the UI state diverges.",
        "confidence": 0.62,
    }


def extract_video_branches(transcript_text: str, steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    branches = []
    for index, match in enumerate(re.finditer(r"\b(if|when|unless|otherwise|for managers|for regular users|after successful submission)\b([^.\n]*)", transcript_text, re.IGNORECASE), start=1):
        from_step_id = steps[min(index - 1, len(steps) - 1)]["step_id"] if steps else None
        branches.append(
            {
                "condition": f"{match.group(1)}{match.group(2)}".strip(),
                "from_step_id": from_step_id,
                "to_step_id": None,
                "branch_label": f"video_branch_{index:02d}",
                "confidence": 0.58,
                "unresolved_if_ambiguous": True,
            }
        )
    return branches


def unresolved_questions_for_video(
    video_path: str,
    transcript_text: str,
    events: List[Dict[str, Any]],
    steps: List[Dict[str, Any]],
    branches: List[Dict[str, Any]],
) -> List[str]:
    questions = []
    if not os.path.exists(video_path):
        questions.append("The video file path was recorded as source metadata, but the file was not found locally.")
    if not transcript_text.strip():
        questions.append("No transcript was provided; what business intent and spoken caveats should be attached to this workflow?")
    if not events:
        questions.append("No UI event trace was provided; which demonstrated UI actions should become workflow steps?")
    for step in steps:
        if step["component_ref"]["status"] == "unmapped":
            questions.append(f"Which UI component corresponds to video step '{step['title']}'?")
    for branch in branches:
        questions.append(f"What is the exact target step for video condition '{branch['condition']}'?")
    return sorted(set(questions))


def extract_video_prerequisites(transcript_text: str) -> List[str]:
    prerequisites = []
    in_block = False
    for line in transcript_text.splitlines():
        stripped = line.strip()
        if re.match(r"^(prerequisites?|before recording|before you begin):", stripped, re.IGNORECASE):
            in_block = True
            tail = stripped.split(":", 1)[1].strip()
            if tail:
                prerequisites.append(tail)
            continue
        if in_block and re.match(r"^[-*]\s+", stripped):
            prerequisites.append(re.sub(r"^[-*]\s+", "", stripped))
        elif in_block and stripped and not re.match(r"^[-*]\s+", stripped):
            in_block = False
    return prerequisites


def source_span_from_event(event: Dict[str, Any]) -> str:
    bits = [f"ts={event.get('ts', 0)}", f"event={event.get('event') or event.get('type')}"]
    for key in ["label", "target", "route", "text"]:
        if event.get(key):
            bits.append(f"{key}={event[key]}")
    return "; ".join(bits)


def infer_title(video_path: str, transcript_text: str) -> str:
    for line in transcript_text.splitlines():
        match = re.match(r"^\s*#\s+(.+?)\s*$", line)
        if match:
            return match.group(1).strip()
        match = re.match(r"^\s*(?:title|workflow)\s*:\s*(.+?)\s*$", line, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return os.path.splitext(os.path.basename(video_path))[0].replace("-", " ").replace("_", " ").title()


def first_transcript_sentence(transcript_text: str) -> str:
    cleaned = re.sub(r"^\s*#.*$", "", transcript_text, flags=re.MULTILINE).strip()
    if not cleaned:
        return ""
    return re.split(r"(?<=[.!?])\s+", cleaned, maxsplit=1)[0].strip()


def step_confidence_from_video(event: Dict[str, Any], component_ref: Dict[str, Any], validation_rule: Dict[str, Any]) -> float:
    score = 0.48
    if event.get("ts") is not None:
        score += 0.08
    if event.get("label") or event.get("target"):
        score += 0.08
    if component_ref["status"] == "mapped":
        score += 0.22
    elif component_ref["status"] == "candidate":
        score += 0.1
    if validation_rule["type"] != "unknown":
        score += 0.08
    return round(max(0.2, min(score, 0.95)), 2)


def overall_video_confidence(
    steps: List[Dict[str, Any]],
    transcript_text: str,
    events: List[Dict[str, Any]],
    unresolved_questions: List[str],
) -> float:
    if not steps:
        return 0.0
    average = sum(step["confidence"] for step in steps) / len(steps)
    if transcript_text.strip():
        average += 0.03
    if events:
        average += 0.05
    average -= min(len(unresolved_questions) * 0.02, 0.2)
    return round(max(0.1, min(average, 0.95)), 2)
