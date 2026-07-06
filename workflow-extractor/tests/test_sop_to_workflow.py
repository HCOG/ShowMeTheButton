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

from workflow_extractor import extract_workflow_draft
from workflow_extractor.component_matcher import load_component_registry


REGISTRY_PATH = os.path.join(REPO_ROOT, "examples", "component-registry.json")
PROJECT_SOP_PATH = os.path.join(REPO_ROOT, "examples", "sop", "create-project-approval.md")


class SopToWorkflowTests(unittest.TestCase):
    def setUp(self):
        with open(PROJECT_SOP_PATH, "r", encoding="utf-8") as fh:
            self.sop = fh.read()
        self.registry = load_component_registry(REGISTRY_PATH)
        self.draft = extract_workflow_draft(self.sop, PROJECT_SOP_PATH, self.registry)

    def test_parses_numbered_sop_into_steps(self):
        self.assertEqual(len(self.draft["workflow"]["steps"]), 6)
        self.assertEqual(self.draft["workflow"]["steps"][0]["action_type"], "navigate")

    def test_extracts_prerequisites(self):
        prerequisites = self.draft["workflow"]["prerequisites"]
        self.assertIn("User is signed in.", prerequisites)
        self.assertIn("Required budget code is available.", prerequisites)

    def test_detects_high_risk_submit_and_requires_confirmation(self):
        submit_steps = [step for step in self.draft["workflow"]["steps"] if step["action_type"] == "submit"]
        self.assertEqual(len(submit_steps), 1)
        self.assertEqual(submit_steps[0]["risk_level"], "high")
        self.assertTrue(submit_steps[0]["requires_confirmation"])
        self.assertIn(submit_steps[0]["step_id"], self.draft["quality"]["high_risk_steps"])

    def test_maps_known_ui_components_from_registry(self):
        component_ids = [step["component_ref"]["component_id"] for step in self.draft["workflow"]["steps"]]
        self.assertIn("project.create_button", component_ids)
        self.assertIn("project.submit_approval_button", component_ids)

    def test_does_not_invent_unknown_component_ids(self):
        unknown_sop = """# Unknown Tool

## Procedure
1. Click "Magic Approval Wand".
2. Submit the request.
"""
        draft = extract_workflow_draft(unknown_sop, "unknown.md", self.registry)
        known_ids = {component["component_id"] for component in self.registry}
        for step in draft["workflow"]["steps"]:
            component_id = step["component_ref"]["component_id"]
            self.assertTrue(component_id is None or component_id in known_ids)
        self.assertEqual(draft["workflow"]["steps"][0]["component_ref"]["status"], "unmapped")

    def test_produces_unresolved_questions_for_ambiguity(self):
        questions = self.draft["workflow"]["unresolved_questions"]
        self.assertTrue(any("condition" in question.lower() for question in questions))
        self.assertTrue(any("attachment" in question.lower() for question in questions))

    def test_validates_output_schema(self):
        self.assertTrue(self.draft["validation_report"]["schema_valid"])
        self.assertEqual(self.draft["validation_report"]["errors"], [])

    def test_produces_deterministic_output_for_fixture(self):
        script = os.path.join(EXTRACTOR_ROOT, "scripts", "sop_to_workflow.py")
        with tempfile.TemporaryDirectory() as tmpdir:
            out_a = os.path.join(tmpdir, "a.json")
            out_b = os.path.join(tmpdir, "b.json")
            cmd = [
                sys.executable,
                script,
                "--input",
                PROJECT_SOP_PATH,
                "--component-registry",
                REGISTRY_PATH,
                "--out",
                out_a,
                "--deterministic-timestamp",
            ]
            subprocess.run(cmd, cwd=REPO_ROOT, check=True, capture_output=True, text=True)
            cmd[cmd.index(out_a)] = out_b
            subprocess.run(cmd, cwd=REPO_ROOT, check=True, capture_output=True, text=True)
            with open(out_a, "r", encoding="utf-8") as fh:
                a = json.load(fh)
            with open(out_b, "r", encoding="utf-8") as fh:
                b = json.load(fh)
            self.assertEqual(a, b)


if __name__ == "__main__":
    unittest.main()
