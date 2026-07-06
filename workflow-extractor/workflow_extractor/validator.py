from typing import Any, Dict, List


ALLOWED_ACTION_TYPES = {
    "navigate",
    "click",
    "fill",
    "select",
    "upload",
    "review",
    "submit",
    "confirm",
    "wait",
    "verify",
    "ask_user",
    "handoff",
    "unknown",
}

REQUIRED_STEP_KEYS = {
    "step_id",
    "title",
    "user_goal",
    "action_type",
    "instruction",
    "expected_page_or_route",
    "component_ref",
    "input_fields",
    "validation_rule",
    "completion_signal",
    "fallback",
    "risk_level",
    "requires_confirmation",
    "confidence",
    "source_quote_or_source_span",
}


def validate_workflow_draft(draft: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[str] = []
    if draft.get("schema_version") != "workflow-draft-v1":
        errors.append("schema_version must be workflow-draft-v1")

    workflow = draft.get("workflow")
    quality = draft.get("quality")
    if not isinstance(workflow, dict):
        errors.append("workflow must be an object")
        workflow = {}
    if not isinstance(quality, dict):
        errors.append("quality must be an object")

    for key in [
        "workflow_id",
        "workflow_name",
        "description",
        "business_goal",
        "domain",
        "target_user_roles",
        "intent_aliases",
        "source",
        "prerequisites",
        "steps",
        "branches",
        "global_risks",
        "unresolved_questions",
    ]:
        if key not in workflow:
            errors.append(f"workflow.{key} is required")

    steps = workflow.get("steps", [])
    if not isinstance(steps, list) or not steps:
        errors.append("workflow.steps must be a non-empty list")
        steps = []

    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            errors.append(f"workflow.steps[{index}] must be an object")
            continue
        missing = sorted(REQUIRED_STEP_KEYS - set(step))
        for key in missing:
            errors.append(f"workflow.steps[{index}].{key} is required")
        if step.get("action_type") not in ALLOWED_ACTION_TYPES:
            errors.append(f"workflow.steps[{index}].action_type is invalid")
        if step.get("risk_level") == "high" and step.get("requires_confirmation") is not True:
            errors.append(f"workflow.steps[{index}] high risk steps must require confirmation")
        component_ref = step.get("component_ref", {})
        if component_ref.get("status") not in {"mapped", "candidate", "unmapped"}:
            errors.append(f"workflow.steps[{index}].component_ref.status is invalid")
        if not step.get("validation_rule"):
            errors.append(f"workflow.steps[{index}].validation_rule is required")
        if not step.get("fallback"):
            errors.append(f"workflow.steps[{index}].fallback is required")

    return {"schema_valid": not errors, "errors": errors}
