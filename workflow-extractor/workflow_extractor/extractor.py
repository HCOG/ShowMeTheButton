import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .component_matcher import match_component
from .validator import validate_workflow_draft

EXTRACTOR_VERSION = "sop-to-workflow-v1"

SECTION_ALIASES = {
    "purpose": "purpose",
    "scope": "scope",
    "prerequisites": "prerequisites",
    "pre-requisites": "prerequisites",
    "before you begin": "prerequisites",
    "procedure": "procedure",
    "steps": "procedure",
    "exceptions": "exceptions",
    "notes": "notes",
    "approval": "approval",
    "troubleshooting": "troubleshooting",
}

ACTION_PATTERNS = [
    ("submit", r"\b(submit|send for approval|request approval|提交|送审)\b"),
    ("upload", r"\b(upload|attach|attachment|上传|附件)\b"),
    ("fill", r"\b(fill|enter|type|input|provide|填写|输入)\b"),
    ("select", r"\b(select|choose|pick|set|选择)\b"),
    ("navigate", r"\b(go to|navigate|open the page|打开|进入|前往)\b"),
    ("click", r"\b(click|press|tap|open|点击|单击)\b"),
    ("review", r"\b(review|check|confirm the details|核对|检查)\b"),
    ("confirm", r"\b(confirm|approve|确认|批准)\b"),
    ("wait", r"\b(wait|等待)\b"),
    ("verify", r"\b(verify|ensure|make sure|确认.*显示|验证)\b"),
]


def extract_workflow_draft(
    sop_text: str,
    source_path: str,
    component_registry: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    registry = component_registry or []
    normalized = normalize_sop_text(sop_text)
    sections = detect_sections(normalized)
    title = extract_title(normalized, source_path)
    workflow_id = workflow_id_from_title(title)
    procedure_text = "\n".join(sections.get("procedure") or []) or normalized
    raw_steps = extract_numbered_steps(procedure_text)
    if not raw_steps:
        raw_steps = extract_bullet_steps(procedure_text)

    steps: List[Dict[str, Any]] = []
    branches: List[Dict[str, Any]] = []
    unresolved_questions: List[str] = []

    for index, raw in enumerate(raw_steps, start=1):
        step_id = f"step_{index:02d}"
        action_type = classify_action(raw)
        route = expected_route(raw)
        component_ref = match_component(raw, step_title(raw), route, action_type, registry)
        risk_level = classify_risk(raw, action_type, component_ref)
        validation_rule = build_validation_rule(raw, action_type, component_ref, route)
        fallback = build_fallback(raw, component_ref, risk_level)
        confidence = step_confidence(raw, component_ref, validation_rule)

        if component_ref["status"] == "unmapped" and action_type in {"click", "submit", "confirm", "fill", "select", "upload"}:
            hint = component_ref.get("label_hint") or step_title(raw)
            unresolved_questions.append(f"Which UI component corresponds to '{hint}'?")

        step = {
            "step_id": step_id,
            "title": step_title(raw),
            "user_goal": user_goal(raw),
            "action_type": action_type,
            "instruction": raw,
            "expected_page_or_route": route,
            "component_ref": component_ref,
            "input_fields": extract_input_fields(raw),
            "validation_rule": validation_rule,
            "completion_signal": completion_signal(raw, action_type),
            "fallback": fallback,
            "risk_level": risk_level,
            "requires_confirmation": risk_level == "high",
            "confidence": confidence,
            "source_quote_or_source_span": raw[:280],
        }
        steps.append(step)

        branch = extract_branch(raw, step_id, index)
        if branch:
            branches.append(branch)
            if branch["unresolved_if_ambiguous"]:
                unresolved_questions.append(f"What is the exact target step for condition '{branch['condition']}'?")

    prerequisites = extract_list_items(sections.get("prerequisites") or [])
    roles = extract_roles(normalized)
    if not roles:
        unresolved_questions.append("Which roles can perform this workflow?")
    if any(step["action_type"] == "submit" for step in steps):
        unresolved_questions.append("What status or UI signal confirms successful approval submission?")
    if re.search(r"\b(attachment|attach|upload)\b", normalized, re.IGNORECASE) or "附件" in normalized:
        unresolved_questions.append("Is the attachment mandatory or optional?")

    unresolved_questions = sorted(set(unresolved_questions))
    mapped_count = sum(1 for step in steps if step["component_ref"]["status"] == "mapped")
    high_risk_steps = [step["step_id"] for step in steps if step["risk_level"] == "high"]
    unmapped_components = [
        {"step_id": step["step_id"], "label_hint": step["component_ref"].get("label_hint", "")}
        for step in steps
        if step["component_ref"]["status"] == "unmapped"
    ]

    workflow = {
        "workflow_id": workflow_id,
        "workflow_name": title,
        "description": first_sentence(sections.get("purpose") or []),
        "business_goal": first_sentence(sections.get("purpose") or []) or title,
        "domain": infer_domain(normalized),
        "target_user_roles": roles,
        "intent_aliases": intent_aliases(title, normalized),
        "source": {
            "document_path": source_path,
            "document_title": title,
            "extracted_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "extractor_version": EXTRACTOR_VERSION,
        },
        "prerequisites": prerequisites,
        "steps": steps,
        "branches": branches,
        "global_risks": global_risks(steps),
        "unresolved_questions": unresolved_questions,
    }

    draft = {
        "schema_version": "workflow-draft-v1",
        "workflow": workflow,
        "quality": {
            "overall_confidence": overall_confidence(steps, unresolved_questions),
            "mapped_component_ratio": round(mapped_count / max(len(steps), 1), 2),
            "steps_missing_verification": [step["step_id"] for step in steps if step["validation_rule"]["type"] == "unknown"],
            "high_risk_steps": high_risk_steps,
            "unmapped_components": unmapped_components,
            "needs_human_review": True,
        },
        "validation_report": {"schema_valid": False, "errors": []},
    }
    draft["validation_report"] = validate_workflow_draft(draft)
    return draft


def normalize_sop_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if re.fullmatch(r"page \d+ of \d+", stripped, re.IGNORECASE):
            continue
        if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", stripped):
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip()


def detect_sections(text: str) -> Dict[str, List[str]]:
    sections: Dict[str, List[str]] = {}
    current = "body"
    sections[current] = []
    for line in text.split("\n"):
        heading = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*$", line) or re.match(r"^([A-Za-z][A-Za-z \-/]+):\s*$", line.strip())
        if heading:
            label = re.sub(r"[:#]+", "", heading.group(1)).strip().lower()
            current = SECTION_ALIASES.get(label, label)
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return sections


def extract_title(text: str, source_path: str) -> str:
    for line in text.split("\n"):
        match = re.match(r"^\s*#\s+(.+?)\s*$", line)
        if match:
            return match.group(1).strip()
    return os.path.splitext(os.path.basename(source_path))[0].replace("-", " ").replace("_", " ").title()


def workflow_id_from_title(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    if not slug:
        slug = hashlib.sha1(title.encode("utf-8")).hexdigest()[:8]
    return f"wf_{slug}"


def extract_numbered_steps(text: str) -> List[str]:
    steps: List[str] = []
    current: List[str] = []
    for line in text.split("\n"):
        if re.match(r"^\s*\d+[\.)]\s+", line):
            if current:
                steps.append(" ".join(part.strip() for part in current if part.strip()))
            current = [re.sub(r"^\s*\d+[\.)]\s+", "", line).strip()]
        elif current and line.strip():
            current.append(line.strip())
    if current:
        steps.append(" ".join(part.strip() for part in current if part.strip()))
    return steps


def extract_bullet_steps(text: str) -> List[str]:
    return [re.sub(r"^\s*[-*]\s+", "", line).strip() for line in text.split("\n") if re.match(r"^\s*[-*]\s+", line)]


def classify_action(text: str) -> str:
    lowered = text.lower()
    for action, pattern in ACTION_PATTERNS:
        if re.search(pattern, lowered, re.IGNORECASE):
            return action
    return "unknown"


def expected_route(text: str) -> Optional[str]:
    route = re.search(r"(/[A-Za-z0-9_\-/{}:]+)", text)
    return route.group(1) if route else None


def classify_risk(text: str, action_type: str, component_ref: Dict[str, Any]) -> str:
    lowered = text.lower()
    if re.search(r"\b(delete|remove|publish|submit|approve|reject|send|commit|irreversible|finalize|cancel)\b|删除|发布|提交|批准|拒绝", lowered):
        return "high"
    if action_type in {"submit", "confirm"}:
        return "high"
    if action_type in {"fill", "upload", "select"}:
        return "medium"
    if component_ref.get("confidence", 0) < 0.35 and action_type not in {"navigate", "review", "verify", "wait"}:
        return "medium"
    return "low"


def build_validation_rule(text: str, action_type: str, component_ref: Dict[str, Any], route: Optional[str]) -> Dict[str, Any]:
    lowered = text.lower()
    if route and action_type == "navigate":
        return {"type": "route_changed", "target": route, "expected": route, "inferred": True, "confidence": 0.72}
    if "toast" in lowered or "success" in lowered or "成功" in lowered:
        return {"type": "toast_visible", "target": "success_toast", "expected": "success", "inferred": False, "confidence": 0.76}
    status = re.search(r"status (?:is|becomes|changes to)\s+['\"]?([^'\".]+)", text, re.IGNORECASE)
    if status:
        return {"type": "business_status", "target": "status", "expected": status.group(1).strip(), "inferred": False, "confidence": 0.82}
    if action_type == "fill":
        return {"type": "field_valid", "target": component_ref.get("component_id") or component_ref.get("label_hint") or "field", "expected": "value accepted", "inferred": True, "confidence": 0.68}
    if action_type in {"click", "select", "upload"}:
        return {"type": "component_visible", "target": component_ref.get("component_id") or component_ref.get("label_hint") or "next UI state", "expected": "expected control/state appears", "inferred": True, "confidence": 0.62}
    if action_type in {"submit", "confirm"}:
        return {"type": "manual_check", "target": component_ref.get("component_id") or "submission result", "expected": "submission accepted and no validation errors", "inferred": True, "confidence": 0.58}
    if action_type in {"review", "verify", "wait", "ask_user"}:
        return {"type": "manual_check", "target": "current page", "expected": "condition in instruction is true", "inferred": True, "confidence": 0.65}
    return {"type": "unknown", "target": "", "expected": "", "inferred": True, "confidence": 0.3}


def build_fallback(text: str, component_ref: Dict[str, Any], risk_level: str) -> Dict[str, Any]:
    lowered = text.lower()
    if component_ref.get("status") == "unmapped":
        return {
            "on_failure": "component_not_found",
            "recovery_action": "ask_user",
            "message": "Component mapping is unresolved; ask the user to identify the UI control before execution.",
            "confidence": 0.82,
        }
    if "required" in lowered or "mandatory" in lowered:
        return {
            "on_failure": "required_field_missing",
            "recovery_action": "highlight_field",
            "message": "Highlight missing required fields and ask the user to complete them.",
            "confidence": 0.76,
        }
    if risk_level == "high":
        return {
            "on_failure": "validation_failed",
            "recovery_action": "show_manual_instruction",
            "message": "Stop before retrying the high-risk action and request human confirmation.",
            "confidence": 0.8,
        }
    return {
        "on_failure": "unknown",
        "recovery_action": "show_manual_instruction",
        "message": "Show the SOP instruction and ask the user how to proceed if the expected UI state is not reached.",
        "confidence": 0.62,
    }


def extract_branch(text: str, step_id: str, index: int) -> Optional[Dict[str, Any]]:
    match = re.search(r"\b(if|when|unless|otherwise|for managers|for regular users|after successful submission)\b([^.;]*)", text, re.IGNORECASE)
    if not match:
        return None
    condition = f"{match.group(1)}{match.group(2)}".strip()
    return {
        "condition": condition,
        "from_step_id": step_id,
        "to_step_id": None,
        "branch_label": f"branch_from_{index:02d}",
        "confidence": 0.64,
        "unresolved_if_ambiguous": True,
    }


def extract_input_fields(text: str) -> List[Dict[str, Any]]:
    fields = []
    quoted = re.findall(r"['\"`“”‘’]([^'\"`“”‘’]{2,60})['\"`“”‘’]", text)
    for value in quoted:
        if not value.startswith("/"):
            fields.append({"label": value, "required": bool(re.search(r"required|mandatory|must", text, re.IGNORECASE)), "confidence": 0.66})
    return fields


def extract_list_items(lines: List[str]) -> List[str]:
    items = []
    for line in lines:
        stripped = re.sub(r"^\s*[-*]\s+", "", line).strip()
        if stripped:
            items.append(stripped)
    return items


def extract_roles(text: str) -> List[str]:
    roles = set()
    for match in re.findall(r"\b(?:role|roles|for)\s*[:=]?\s*(manager|regular user|employee|requester|approver|admin|administrator|finance|hr)\b", text, re.IGNORECASE):
        roles.add(match.lower())
    for label in ["manager", "employee", "requester", "approver", "admin", "finance", "hr"]:
        if re.search(rf"\b{label}s?\b", text, re.IGNORECASE):
            roles.add(label)
    return sorted(roles)


def intent_aliases(title: str, text: str) -> List[str]:
    aliases = {title, title.lower()}
    for pattern in [r"intent aliases?:\s*(.+)", r"also known as:\s*(.+)"]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            aliases.update(part.strip() for part in re.split(r"[,;/]", match.group(1)) if part.strip())
    words = re.sub(r"[^A-Za-z0-9 ]+", " ", title).lower().split()
    if words:
        aliases.add(" ".join(words))
    return sorted(aliases)


def infer_domain(text: str) -> str:
    lowered = text.lower()
    if "purchase" in lowered or "vendor" in lowered or "finance" in lowered:
        return "procurement"
    if "leave" in lowered or "hr" in lowered or "employee" in lowered:
        return "hr"
    if "project" in lowered or "approval" in lowered:
        return "project_management"
    return "unknown"


def global_risks(steps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    risks = []
    if any(step["risk_level"] == "high" for step in steps):
        risks.append({"risk_level": "high", "reason": "Workflow contains externally visible or approval/submission actions.", "requires_human_review": True})
    return risks


def step_title(text: str) -> str:
    title = re.split(r"[.;]", text, maxsplit=1)[0].strip()
    return title[:90] if title else "Untitled step"


def user_goal(text: str) -> str:
    return step_title(text)


def completion_signal(text: str, action_type: str) -> str:
    if action_type in {"submit", "confirm"}:
        return "No validation errors and a success/status confirmation is visible."
    if action_type == "navigate":
        return "Expected page or route is active."
    if action_type == "fill":
        return "Entered values remain in the target fields and pass validation."
    return "Expected UI state is reached."


def first_sentence(lines: List[str]) -> str:
    text = " ".join(line.strip() for line in lines if line.strip())
    if not text:
        return ""
    return re.split(r"(?<=[.!?])\s+", text, maxsplit=1)[0]


def step_confidence(text: str, component_ref: Dict[str, Any], validation_rule: Dict[str, Any]) -> float:
    score = 0.58
    if component_ref["status"] == "mapped":
        score += 0.22
    elif component_ref["status"] == "candidate":
        score += 0.1
    if validation_rule["type"] != "unknown":
        score += 0.08
    if re.search(r"\b(if|when|unless|otherwise)\b", text, re.IGNORECASE):
        score -= 0.08
    return round(max(0.2, min(score, 0.95)), 2)


def overall_confidence(steps: List[Dict[str, Any]], questions: List[str]) -> float:
    if not steps:
        return 0.0
    average = sum(step["confidence"] for step in steps) / len(steps)
    penalty = min(len(questions) * 0.02, 0.18)
    return round(max(0.1, average - penalty), 2)
