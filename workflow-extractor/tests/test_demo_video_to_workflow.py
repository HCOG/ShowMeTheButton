import json
import os
import subprocess
import sys
import tempfile
import unittest

EXTRACTOR_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(EXTRACTOR_ROOT)
if EXTRACTOR_ROOT not in sys.path:
    sys.path.insert(0, EXTRACTOR_ROOT)

from workflow_extractor import extract_workflow_draft_from_demo_video
from workflow_extractor.component_matcher import load_component_registry
from workflow_extractor.demo_video_extractor import load_event_trace


REGISTRY_PATH = os.path.join(REPO_ROOT, "examples", "component-registry.json")
TRANSCRIPT_PATH = os.path.join(REPO_ROOT, "examples", "demo-video", "create-project-demo.transcript.md")
EVENTS_PATH = os.path.join(REPO_ROOT, "examples", "demo-video", "create-project-demo.events.json")
VIDEO_PATH = os.path.join(REPO_ROOT, "examples", "demo-video", "create-project-demo.mp4")


class DemoVideoToWorkflowTests(unittest.TestCase):
    def setUp(self):
        with open(TRANSCRIPT_PATH, "r", encoding="utf-8") as fh:
            self.transcript = fh.read()
        self.registry = load_component_registry(REGISTRY_PATH)
        self.events = load_event_trace(EVENTS_PATH)
        self.draft = extract_workflow_draft_from_demo_video(
            VIDEO_PATH,
            component_registry=self.registry,
            transcript_text=self.transcript,
            event_trace=self.events,
        )

    def test_extracts_event_trace_into_steps(self):
        self.assertEqual(len(self.draft["workflow"]["steps"]), 4)
        self.assertEqual(self.draft["workflow"]["steps"][0]["action_type"], "navigate")
        self.assertEqual(self.draft["workflow"]["steps"][-1]["action_type"], "submit")

    def test_uses_video_observations_as_verification(self):
        submit_step = self.draft["workflow"]["steps"][-1]
        self.assertEqual(submit_step["validation_rule"]["type"], "toast_visible")
        self.assertFalse(submit_step["validation_rule"]["inferred"])

    def test_maps_components_and_requires_confirmation_for_submit(self):
        submit_step = self.draft["workflow"]["steps"][-1]
        self.assertEqual(submit_step["component_ref"]["component_id"], "project.submit_approval_button")
        self.assertEqual(submit_step["risk_level"], "high")
        self.assertTrue(submit_step["requires_confirmation"])

    def test_extracts_transcript_prerequisites_and_branches(self):
        self.assertIn("The requester is signed in.", self.draft["workflow"]["prerequisites"])
        self.assertGreaterEqual(len(self.draft["workflow"]["branches"]), 1)
        self.assertTrue(any("budget" in branch["condition"].lower() for branch in self.draft["workflow"]["branches"]))

    def test_raw_video_without_sidecars_remains_reviewable_and_ambiguous(self):
        draft = extract_workflow_draft_from_demo_video("/tmp/missing-demo.mp4", component_registry=self.registry)
        self.assertTrue(draft["validation_report"]["schema_valid"])
        self.assertTrue(draft["quality"]["needs_human_review"])
        self.assertEqual(draft["workflow"]["steps"][0]["action_type"], "ask_user")
        questions = " ".join(draft["workflow"]["unresolved_questions"]).lower()
        self.assertIn("no transcript", questions)
        self.assertIn("no ui event trace", questions)

    def test_cli_produces_valid_deterministic_output(self):
        script = os.path.join(EXTRACTOR_ROOT, "scripts", "demo_video_to_workflow.py")
        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "video.json")
            subprocess.run(
                [
                    sys.executable,
                    script,
                    VIDEO_PATH,
                    "--transcript",
                    TRANSCRIPT_PATH,
                    "--event-trace",
                    EVENTS_PATH,
                    "--component-registry",
                    REGISTRY_PATH,
                    "--out",
                    out_path,
                    "--deterministic-timestamp",
                ],
                cwd=REPO_ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            with open(out_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            self.assertTrue(data["validation_report"]["schema_valid"])
            self.assertEqual(data["workflow"]["source"]["extractor_version"], "demo-video-to-workflow-v1")
            self.assertEqual(data["workflow"]["source"]["extracted_at"], "2026-01-01T00:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
