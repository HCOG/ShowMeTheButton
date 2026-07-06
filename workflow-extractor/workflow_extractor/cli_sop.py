import argparse
import json
import os
import sys

from . import extract_workflow_draft
from .component_matcher import load_component_registry


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract a reviewable workflow DSL draft from a Markdown/plain-text SOP.")
    parser.add_argument("input_positional", nargs="?", help="SOP input path. Equivalent to --input.")
    parser.add_argument("--input", "-i", dest="input_path", help="SOP input path.")
    parser.add_argument("--component-registry", "--registry", dest="registry_path", help="Optional component registry JSON.")
    parser.add_argument("--out", "--output", "-o", dest="output_path", required=True, help="Output draft JSON path.")
    parser.add_argument("--deterministic-timestamp", action="store_true", help="Replace extracted_at with a stable timestamp for fixtures/tests.")
    args = parser.parse_args()

    input_path = args.input_path or args.input_positional
    if not input_path:
        parser.error("an input path is required")

    with open(input_path, "r", encoding="utf-8") as fh:
        sop_text = fh.read()

    registry = load_component_registry(args.registry_path)
    draft = extract_workflow_draft(sop_text, source_path=input_path, component_registry=registry)
    if args.deterministic_timestamp:
        draft["workflow"]["source"]["extracted_at"] = "2026-01-01T00:00:00+00:00"

    os.makedirs(os.path.dirname(os.path.abspath(args.output_path)), exist_ok=True)
    with open(args.output_path, "w", encoding="utf-8") as fh:
        json.dump(draft, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    if not draft["validation_report"]["schema_valid"]:
        print("Workflow draft failed validation:", file=sys.stderr)
        for error in draft["validation_report"]["errors"]:
            print(f"- {error}", file=sys.stderr)
        return 2

    print(f"Wrote workflow draft: {args.output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
