# Demo-Video-to-Workflow Draft Extractor

Use this skill when converting a product demo recording, walkthrough video, screen recording, or replay trace into a ShowMeTheButton workflow DSL draft.

## Channel Design

Treat video extraction as a multi-signal channel, not as a generic video summary.

Preferred inputs:

1. Demo video path, retained as source evidence.
2. Transcript or narration text for intent, roles, prerequisites, conditions, and caveats.
3. UI event trace from SDK/browser instrumentation for deterministic step extraction.
4. Component registry for safe component mapping.

The current implementation consumes transcript and event sidecars deterministically. OCR, frame analysis, and multimodal LLM extraction can be added later as optional signal producers, but the draft generator must still work from structured events.

## Safety Rules

- Never auto-publish or auto-execute a workflow extracted from a video.
- Keep `quality.needs_human_review` true.
- Never invent `component_id` values.
- High-risk video actions such as submit, approve, reject, delete, publish, send, or commit must require confirmation.
- If only a raw video is provided without transcript or event trace, emit unresolved questions instead of pretending the recording was fully understood.

## Recommended Command

```bash
./workflow-extractor/bin/demo2workflow ./recordings/create-project-demo.mp4 \
  --transcript examples/demo-video/create-project-demo.transcript.md \
  --event-trace examples/demo-video/create-project-demo.events.json \
  --component-registry examples/component-registry.json \
  --out examples/output/wf_create_project_from_demo_video.draft.json
```

## Extraction Checklist

1. Use event trace actions as the primary step sequence.
2. Use transcript text to infer workflow name, business goal, roles, prerequisites, branches, and unresolved ambiguity.
3. Match components only through the registry.
4. Use later observations such as route changes, toast messages, or business status events as verification rules.
5. Generate fallback rules per step.
6. Keep video-specific source metadata, including sidecar availability.
7. Validate against `workflow-draft-v1`.
