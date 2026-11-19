import os
import sys
import unittest

WORKER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKER_DIR not in sys.path:
    sys.path.insert(0, WORKER_DIR)

from worker.controller.manager import ControllerManager  # noqa: E402


class TestGameController(unittest.TestCase):
    def test_dry_run_allowed_action_and_duration_clamping(self) -> None:
        mgr = ControllerManager()
        res = mgr.execute_action(
            {
                "actionType": "MOVE_DIRECTION",
                "parameters": {"direction": "up"},
                "durationMs": 99999,
                "dryRun": True,
            }
        )
        self.assertTrue(res["ok"])
        self.assertEqual(res["status"], "simulated")
        self.assertEqual(res["durationMs"], 2000)
        self.assertEqual(res["mappedInput"], "Key 'w'")

    def test_rejects_disallowed_action(self) -> None:
        mgr = ControllerManager()
        res = mgr.execute_action(
            {
                "actionType": "FORMAT_DISK",
                "dryRun": True,
            }
        )
        self.assertFalse(res["ok"])
        self.assertEqual(res["status"], "rejected")

    def test_emergency_stop_blocks_and_reset_restores(self) -> None:
        mgr = ControllerManager()
        stop_state = mgr.emergency_stop()
        self.assertTrue(stop_state["emergencyStopped"])
        self.assertTrue(stop_state["paused"])

        blocked = mgr.execute_action({"actionType": "INTERACT", "dryRun": True})
        self.assertFalse(blocked["ok"])
        self.assertEqual(blocked["status"], "blocked")

        reset_state = mgr.reset_emergency()
        self.assertFalse(reset_state["emergencyStopped"])
        allowed = mgr.execute_action({"actionType": "INTERACT", "dryRun": True})
        self.assertTrue(allowed["ok"])


if __name__ == "__main__":
    unittest.main()
