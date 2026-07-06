# Demo Video Fixtures

This directory keeps lightweight sidecars for demo-video extraction tests.

The first implementation records the video path in source metadata and extracts workflow steps from deterministic sidecars:

- `*.transcript.md` for spoken narration, prerequisites, conditions, and business intent.
- `*.events.json` for UI actions captured by the SDK, browser automation, or recorder instrumentation.

Large binary demo videos are intentionally not committed. A real recording can be passed with the same sidecars:

```bash
workflow-extractor/bin/demo2workflow ./recordings/create-project-demo.mp4 \
  --transcript examples/demo-video/create-project-demo.transcript.md \
  --event-trace examples/demo-video/create-project-demo.events.json \
  --component-registry examples/component-registry.json \
  --out examples/output/wf_create_project_from_demo_video.draft.json
```
