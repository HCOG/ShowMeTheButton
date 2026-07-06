import re
from typing import Any, Dict, List, Optional


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\u4e00-\u9fff]+", " ", value.lower())).strip()


def _tokens(value: str) -> set[str]:
    return {token for token in _norm(value).split() if token}


def load_component_registry(path: Optional[str]) -> List[Dict[str, Any]]:
    if not path:
        return []

    import json

    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if isinstance(data, dict):
        data = data.get("components", [])
    if not isinstance(data, list):
        raise ValueError("Component registry must be a list or an object with a 'components' list")
    return data


def match_component(
    instruction: str,
    title: str,
    expected_route: Optional[str],
    action_type: str,
    registry: List[Dict[str, Any]],
) -> Dict[str, Any]:
    text = f"{title} {instruction}"
    norm_text = _norm(text)
    scored: List[tuple[float, Dict[str, Any]]] = []

    for component in registry:
        aliases = [component.get("label", ""), *component.get("aliases", [])]
        exact_alias = any(_norm(alias) and _norm(alias) in norm_text for alias in aliases)
        route_match = bool(expected_route and component.get("route") == expected_route)
        type_match = _component_type_matches_action(component.get("type", ""), action_type)

        if exact_alias:
            score = 0.86
            if route_match:
                score += 0.08
            if type_match:
                score += 0.04
            scored.append((min(score, 0.98), component))
            continue

        component_words = _tokens(" ".join(aliases))
        text_words = _tokens(text)
        overlap = len(component_words & text_words) / max(len(component_words), 1)
        score = overlap * 0.55
        if route_match:
            score += 0.18
        if type_match:
            score += 0.10
        if score >= 0.38:
            scored.append((min(score, 0.78), component))

    scored.sort(key=lambda item: (-item[0], item[1].get("component_id", "")))
    if not scored:
        return {
            "status": "unmapped",
            "component_id": None,
            "label_hint": _label_hint(text),
            "route_hint": expected_route,
            "candidate_component_ids": [],
            "confidence": 0.0,
        }

    best_score, best = scored[0]
    candidates = [item[1].get("component_id") for item in scored[1:4] if item[1].get("component_id")]
    status = "mapped" if best_score >= 0.82 else "candidate"
    return {
        "status": status,
        "component_id": best.get("component_id") if status == "mapped" else None,
        "label_hint": best.get("label") or _label_hint(text),
        "route_hint": best.get("route") or expected_route,
        "candidate_component_ids": ([best.get("component_id")] if status == "candidate" else []) + candidates,
        "confidence": round(best_score, 2),
    }


def _component_type_matches_action(component_type: str, action_type: str) -> bool:
    component_type = component_type.lower()
    if action_type in {"click", "submit", "confirm"}:
        return component_type in {"button", "link", "menu_item"}
    if action_type == "fill":
        return component_type in {"input", "textarea", "field"}
    if action_type == "select":
        return component_type in {"select", "dropdown", "radio", "checkbox"}
    if action_type == "upload":
        return component_type in {"upload", "file_input", "button"}
    return False


def _label_hint(text: str) -> str:
    quoted = re.findall(r"['\"`“”‘’]([^'\"`“”‘’]{2,80})['\"`“”‘’]", text)
    if quoted:
        return quoted[0].strip()

    for keyword in ["click", "select", "choose", "open", "press", "submit", "点击", "选择", "提交"]:
        match = re.search(rf"{keyword}\s+([A-Za-z0-9 _\-/]+)", text, re.IGNORECASE)
        if match:
            return match.group(1).strip(" .,:;")
    return ""
