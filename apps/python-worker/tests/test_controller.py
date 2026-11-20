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
        self.assertEqual(mgr.get_status()["pressedKeys"], [])

    def test_20_consecutive_movements_without_stuck_keys(self) -> None:
        mgr = ControllerManager()
        directions = ["w", "a", "s", "d"]
        for idx in range(20):
            res = mgr.execute_action(
                {
                    "actionType": "MOVE_DIRECTION",
                    "parameters": {"direction": directions[idx % 4]},
                    "durationMs": 120,
                    "dryRun": True,
                }
            )
            self.assertTrue(res["ok"])
            self.assertEqual(mgr.get_status()["pressedKeys"], [])

    def test_multi_key_mouse_and_focus_loss_safeguard(self) -> None:
        mgr = ControllerManager()
        combo = mgr.execute_action(
            {
                "actionType": "MOVE_DIRECTION",
                "parameters": {"keys": ["w", "d"]},
                "durationMs": 150,
                "dryRun": True,
            }
        )
        self.assertTrue(combo["ok"])
        self.assertEqual(combo["mappedInput"], "Combo 'w+d'")

        mouse = mgr.execute_action(
            {
                "actionType": "INTERACT",
                "parameters": {"mouse": "right_click", "x": 400, "y": 300},
                "dryRun": True,
            }
        )
        self.assertTrue(mouse["ok"])
        self.assertEqual(mouse["mappedInput"], "Mouse 'right_click'")

        blocked_focus = mgr.execute_action(
            {
                "actionType": "MOVE_DIRECTION",
                "parameters": {"direction": "w"},
                "expectedGameTitle": "__NON_EXISTENT_GAME_WINDOW__",
                "dryRun": False,
            }
        )
        self.assertFalse(blocked_focus["ok"])
        self.assertEqual(blocked_focus["status"], "blocked")
        self.assertEqual(mgr.get_status()["pressedKeys"], [])

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
