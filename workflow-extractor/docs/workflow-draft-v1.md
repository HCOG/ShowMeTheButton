# Workflow Draft v1 Contract

`workflow-draft-v1` is the review format produced by the ShowMeTheButton workflow extractor. It is intentionally not an executable workflow. A draft can be generated from SOP text, demo-video sidecars, or future extraction channels, but it must be reviewed before publication or runtime execution.

The machine-readable schema lives at:

`workflow_extractor/schemas/workflow-draft-v1.schema.json`

## Design Goals

- Preserve procedural structure from source material.
- Make uncertainty explicit with confidence scores and unresolved questions.
- Map UI components only through a supplied component registry.
- Generate validation and recovery rules for every step.
- Require human confirmation for risky or externally visible actions.
- Keep generated workflows draft-only until a reviewer promotes them.

## Top-Level Shape

Every draft must use this shape:

```json
{
  "schema_version": "workflow-draft-v1",
  "workflow": {},
  "quality": {},
  "validation_report": {}
}
```

`schema_version` must be exactly `workflow-draft-v1`.

`workflow` contains the extracted business workflow.

`quality` summarizes extraction confidence and review risk.

`validation_report` records whether the draft passes schema/contract validation.

## Workflow Object

Required fields:

| Field | Type | Description |
| --- | --- | --- |
| `workflow_id` | string | Stable draft ID, usually `wf_` plus a slug. |
| `workflow_name` | string | Human-readable workflow name. |
| `description` | string | Short summary from the source. |
| `business_goal` | string | Business outcome the user wants to complete. |
| `domain` | string | Business domain such as `project_management`, `procurement`, `hr`, or `unknown`. |
| `target_user_roles` | string[] | Roles that may run or review the workflow. Empty means unresolved. |
| `intent_aliases` | string[] | Natural-language aliases users may say or search for. |
| `source` | object | Source document/video metadata. |
| `prerequisites` | string[] | Conditions that must be true before starting. |
| `steps` | object[] | Ordered workflow steps. Must contain at least one step. |
| `branches` | object[] | Conditional transitions or unresolved branch candidates. |
| `global_risks` | object[] | Workflow-level risks. |
| `unresolved_questions` | string[] | Required human review questions. |

## Source Object

Required fields:

```json
{
  "document_path": "examples/sop/create-project-approval.md",
  "document_title": "Create Project and Submit for Approval",
  "extracted_at": "2026-01-01T00:00:00+00:00",
  "extractor_version": "sop-to-workflow-v1"
}
```

Additional channel-specific fields are allowed. For example demo-video extraction may include:

```json
{
  "source_type": "demo_video",
  "transcript_available": true,
  "event_trace_available": true
}
```

## Step Object

Every step must contain:

| Field | Type | Description |
| --- | --- | --- |
| `step_id` | string | Stable ordered ID such as `step_01`. |
| `title` | string | Short step title. |
| `user_goal` | string | User-facing purpose of the step. |
| `action_type` | enum | Normalized action category. |
| `instruction` | string | Draft instruction derived from the source. |
| `expected_page_or_route` | string or null | Expected route/page if known. |
| `component_ref` | object | Registry mapping or unresolved component hint. |
| `input_fields` | object[] | Fields or values involved in this step. |
| `validation_rule` | object | How to verify the step succeeded. |
| `completion_signal` | string | Human-readable success signal. |
| `fallback` | object | Recovery behavior if the step fails. |
| `risk_level` | enum | `low`, `medium`, or `high`. |
| `requires_confirmation` | boolean | Whether human confirmation is required before execution. |
| `confidence` | number | Extraction confidence from `0.0` to `1.0`. |
| `source_quote_or_source_span` | string | Source quote, event span, or trace evidence. |

## Action Types

Allowed `action_type` values:

| Value | Meaning |
| --- | --- |
| `navigate` | Move to a page or route. |
| `click` | Activate a button, link, menu item, or similar control. |
| `fill` | Enter text or business data. |
| `select` | Choose from a dropdown, radio group, checkbox, or option list. |
| `upload` | Attach or upload a file. |
| `review` | Ask the user to inspect information. |
| `submit` | Submit, send, publish, request approval, or finalize. |
| `confirm` | Confirm an action or approval. |
| `wait` | Wait for async UI/system progress. |
| `verify` | Check that a state or condition is true. |
| `ask_user` | Ask the human reviewer/user for missing information. |
| `handoff` | Transfer the task to another role or system. |
| `unknown` | Extractor could not classify the action. |

Use `unknown` sparingly. Unknown actions should usually add an unresolved question.

## Component Reference

`component_ref` must never invent component IDs. A `component_id` may only appear if it came from the supplied component registry.

Required shape:

```json
{
  "status": "mapped",
  "component_id": "project.create_button",
  "label_hint": "New Project",
  "route_hint": "/projects",
  "candidate_component_ids": [],
  "confidence": 0.86
}
```

Allowed `status` values:

| Status | Meaning |
| --- | --- |
| `mapped` | High-confidence mapping to a known registry component. `component_id` must be set. |
| `candidate` | Possible mapping exists, but reviewer must confirm. `component_id` should be null and candidates listed. |
| `unmapped` | No reliable registry match. `component_id` must be null. |

Mapping rules:

- Prefer exact alias matches.
- Then use lower-confidence text, route, and component type signals.
- Never fabricate a registry ID.
- If no reliable match exists, use `status: "unmapped"`.
- Unmapped interactive steps should add an unresolved question.

## Input Fields

`input_fields` describes fields mentioned or demonstrated by the source:

```json
{
  "label": "Project Name",
  "required": true,
  "confidence": 0.66
}
```

Do not place sensitive literal values in draft output unless the source is already safe to store.

## Validation Rule

Every step should have a validation rule. If the source does not specify verification, infer a conservative draft rule and mark it as inferred.

Required shape:

```json
{
  "type": "route_changed",
  "target": "/projects/new",
  "expected": "/projects/new",
  "inferred": true,
  "confidence": 0.72
}
```

Allowed validation types:

| Type | Meaning |
| --- | --- |
| `route_changed` | Browser/app route becomes expected value. |
| `component_visible` | A component becomes visible or remains visible. |
| `field_valid` | Field value is accepted by UI validation. |
| `business_status` | A business status changes, such as `Pending Approval`. |
| `toast_visible` | A toast or banner appears. |
| `api_state` | Backend/API state confirms completion. |
| `manual_check` | Reviewer/user must verify. |
| `unknown` | No useful verification could be inferred. |

`quality.steps_missing_verification` must list steps whose validation type is `unknown`.

## Fallback Rule

Every step must have a fallback rule.

Required shape:

```json
{
  "on_failure": "component_not_found",
  "recovery_action": "ask_user",
  "message": "Component mapping is unresolved; ask the user to identify the UI control before execution.",
  "confidence": 0.82
}
```

Allowed failure types:

- `required_field_missing`
- `wrong_page`
- `component_not_found`
- `permission_denied`
- `validation_failed`
- `unknown`

Allowed recovery actions:

- `highlight_field`
- `navigate_back`
- `ask_user`
- `show_manual_instruction`
- `handoff`

## Branch Object

Branches capture conditional or role-specific paths. Branches may remain unresolved in a draft.

```json
{
  "condition": "If the project budget is over 10000",
  "from_step_id": "step_04",
  "to_step_id": null,
  "branch_label": "branch_from_04",
  "confidence": 0.64,
  "unresolved_if_ambiguous": true
}
```

Rules:

- `from_step_id` should reference an existing step.
- `to_step_id` may be null if the extractor cannot determine the destination.
- Ambiguous branches must set `unresolved_if_ambiguous: true`.
- Ambiguous branches should add a question to `workflow.unresolved_questions`.

## Risk Classification

Risk levels:

| Level | Examples |
| --- | --- |
| `low` | Navigation, opening forms, reviewing information. |
| `medium` | Filling business data, selecting options, uploading files. |
| `high` | Submit, approve, reject, delete, publish, send, commit, finalize, or irreversible/external actions. |

Rules:

- High-risk steps must set `requires_confirmation: true`.
- Destructive or externally visible actions must be high risk.
- When risk is uncertain, classify upward rather than downward.
- `quality.high_risk_steps` must list all high-risk step IDs.

## Quality Object

Required fields:

```json
{
  "overall_confidence": 0.69,
  "mapped_component_ratio": 0.67,
  "steps_missing_verification": [],
  "high_risk_steps": ["step_06"],
  "unmapped_components": [
    {
      "step_id": "step_04",
      "label_hint": "Attachment"
    }
  ],
  "needs_human_review": true
}
```

`needs_human_review` must remain `true` for extractor output. A separate review/promotion process may create an executable workflow later.

## Validation Report

Required shape:

```json
{
  "schema_valid": true,
  "errors": []
}
```

If validation fails:

- `schema_valid` must be `false`.
- `errors` must contain actionable messages.
- CLI commands should exit non-zero.

## Draft Lifecycle

1. Extract a draft from SOP text, demo video sidecars, or another source.
2. Validate against `workflow-draft-v1`.
3. Human reviewer resolves questions, confirms component mappings, and checks risk.
4. A separate promotion step converts the draft into an executable workflow.
5. Runtime agents may execute only promoted workflows, not raw drafts.

## Minimal Example

```json
{
  "schema_version": "workflow-draft-v1",
  "workflow": {
    "workflow_id": "wf_create_project",
    "workflow_name": "Create Project",
    "description": "Create a new project record.",
    "business_goal": "Create a new project record.",
    "domain": "project_management",
    "target_user_roles": ["requester"],
    "intent_aliases": ["Create Project", "new project"],
    "source": {
      "document_path": "examples/sop/create-project.md",
      "document_title": "Create Project",
      "extracted_at": "2026-01-01T00:00:00+00:00",
      "extractor_version": "sop-to-workflow-v1"
    },
    "prerequisites": ["User is signed in."],
    "steps": [
      {
        "step_id": "step_01",
        "title": "Open Projects",
        "user_goal": "Open the Projects page",
        "action_type": "navigate",
        "instruction": "Go to /projects.",
        "expected_page_or_route": "/projects",
        "component_ref": {
          "status": "mapped",
          "component_id": "project.nav",
          "label_hint": "Projects",
          "route_hint": "/projects",
          "candidate_component_ids": [],
          "confidence": 0.94
        },
        "input_fields": [],
        "validation_rule": {
          "type": "route_changed",
          "target": "/projects",
          "expected": "/projects",
          "inferred": true,
          "confidence": 0.72
        },
        "completion_signal": "Expected page or route is active.",
        "fallback": {
          "on_failure": "wrong_page",
          "recovery_action": "show_manual_instruction",
          "message": "Ask the user to navigate to Projects manually.",
          "confidence": 0.62
        },
        "risk_level": "low",
        "requires_confirmation": false,
        "confidence": 0.88,
        "source_quote_or_source_span": "Go to /projects."
      }
    ],
    "branches": [],
    "global_risks": [],
    "unresolved_questions": []
  },
  "quality": {
    "overall_confidence": 0.88,
    "mapped_component_ratio": 1.0,
    "steps_missing_verification": [],
    "high_risk_steps": [],
    "unmapped_components": [],
    "needs_human_review": true
  },
  "validation_report": {
    "schema_valid": true,
    "errors": []
  }
}
```

## Compatibility Notes

- Additive fields are allowed unless they conflict with this contract.
- Removing required fields requires a new schema version.
- Changing enum values requires a new schema version or a migration.
- Existing extractors should keep deterministic behavior for fixtures.
