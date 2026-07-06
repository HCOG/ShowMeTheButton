# SOP-to-Workflow Draft Extractor

Use this skill when converting SOPs, help docs, runbooks, or procedural business instructions into ShowMeTheButton workflow DSL drafts.

## Safety Rules

- Always treat generated workflows as drafts requiring human review.
- Never auto-publish or auto-execute extracted workflows.
- Preserve uncertainty with confidence scores and unresolved questions.
- Never invent `component_id` values. Use only IDs present in the supplied component registry.
- High-risk actions such as submit, approve, reject, delete, publish, send, or commit must require confirmation.

## Recommended Command

```bash
python workflow-extractor/scripts/sop_to_workflow.py \
  --input examples/sop/create-project-approval.md \
  --component-registry examples/component-registry.json \
  --out examples/output/wf_create_project_approval.draft.json
```

## Extraction Checklist

1. Normalize SOP text while preserving numbered steps, warnings, notes, prerequisites, roles, approval conditions, and troubleshooting guidance.
2. Extract workflow metadata: ID, name, goal, roles, aliases, domain, source, timestamp, and extractor version.
3. Convert each procedural step into a structured draft step with action type, component mapping, validation, fallback, risk, confirmation, confidence, and source span.
4. Detect conditional language and emit branches with unresolved targets when ambiguous.
5. Match UI components from the registry using exact aliases first, then lower-confidence candidates.
6. Emit verification and fallback rules for every step.
7. Add unresolved questions instead of hiding ambiguity.
8. Validate the result and keep `quality.needs_human_review` true.

## Current Implementation

The first version is deterministic Python code in `workflow-extractor/workflow_extractor`. LLM extraction can be added later, but local parsing must remain as a fallback.
