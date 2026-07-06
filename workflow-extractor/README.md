# ShowMeTheButton Workflow Extractor

Standalone extraction package for converting SOP documents and demo-video sidecars into reviewable `workflow-draft-v1` JSON.

## Layout

- `workflow_extractor/` - Python package with extractors, component matching, and validation.
- `scripts/` - direct local CLI entrypoints.
- `bin/` - shell wrappers for repository use.
- `workflow_extractor/schemas/` - workflow draft JSON schema bundled with the package.
- `docs/` - human-readable workflow draft contract.
- `skills/` - agent instructions for SOP and demo-video extraction.
- `tests/` - unit tests for both extraction channels.

## Workflow Draft Contract

The output format is documented in [docs/workflow-draft-v1.md](docs/workflow-draft-v1.md).

## Local Commands

```bash
workflow-extractor/bin/sop2workflow examples/sop/create-project-approval.md \
  --component-registry examples/component-registry.json \
  --out examples/output/wf_create_project_approval.draft.json

workflow-extractor/bin/demo2workflow examples/demo-video/create-project-demo.mp4 \
  --transcript examples/demo-video/create-project-demo.transcript.md \
  --event-trace examples/demo-video/create-project-demo.events.json \
  --component-registry examples/component-registry.json \
  --out examples/output/wf_create_project_from_demo_video.draft.json
```

## Tests

```bash
python -m unittest discover -s workflow-extractor/tests -v
```
