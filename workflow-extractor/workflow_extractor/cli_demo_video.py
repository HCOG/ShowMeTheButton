import argparse
import json
import os
import sys

from . import extract_workflow_draft_from_demo_video
from .component_matcher import load_component_registry
from .demo_video_extractor import load_event_trace


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract a reviewable workflow DSL draft from a demo video plus transcript/event sidecars."
    )
    parser.add_argument("video_positional", nargs="?", help="Demo video path. Equivalent to --video.")
    parser.add_argument("--video", "-v", dest="video_path", help="Demo video path.")
    parser.add_argument("--transcript", "-t", dest="transcript_path", help="Optional transcript Markdown/text path.")
    parser.add_argument("--event-trace", "-e", dest="event_trace_path", help="Optional UI event trace JSON path.")
    parser.add_argument("--component-registry", "--registry", dest="registry_path", help="Optional component registry JSON.")
    parser.add_argument("--workflow-name", dest="workflow_name", help="Override workflow name.")
    parser.add_argument("--out", "--output", "-o", dest="output_path", required=True, help="Output draft JSON path.")
    parser.add_argument("--deterministic-timestamp", action="store_true", help="Replace extracted_at with a stable timestamp for fixtures/tests.")
    args = parser.parse_args()

    video_path = args.video_path or args.video_positional
    if not video_path:
        parser.error("a demo video path is required")

    transcript_text = ""
    if args.transcript_path:
        with open(args.transcript_path, "r", encoding="utf-8") as fh:
            transcript_text = fh.read()

    registry = load_component_registry(args.registry_path)
    event_trace = load_event_trace(args.event_trace_path)
    draft = extract_workflow_draft_from_demo_video(
        video_path=video_path,
        component_registry=registry,
        transcript_text=transcript_text,
        event_trace=event_trace,
        workflow_name=args.workflow_name,
    )
    if args.deterministic_timestamp:
        draft["workflow"]["source"]["extracted_at"] = "2026-01-01T00:00:00+00:00"

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)), exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as fh:
        json.dump(draft, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    if not draft["validation_report"]["schema_valid"]:
        print("Demo video workflow draft failed validation:", file=sys.stderr)
        for error in draft["validation_report"]["errors"]:
            print(f"- {error}", file=sys.stderr)
        return 2

    print(f"Wrote demo video workflow draft: {args.output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
