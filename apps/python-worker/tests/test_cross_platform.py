import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from worker.controller.input_driver import InputDriver, detect_controller_backend
from worker.controller.keymap import map_action_to_input
from worker.vision.window_detector import list_visible_windows


class TestCrossPlatformWorker(unittest.TestCase):
    def test_keymap_resolves_standard_multi_key_and_mouse(self) -> None:
        kind, token, _ = map_action_to_input("MOVE_DIRECTION", {"direction": "up"})
        self.assertEqual(kind, "key")
        self.assertEqual(token, "w")

        kind_multi, token_multi, _ = map_action_to_input("INTERACT", {"keys": ["w", "e"]})
        self.assertEqual(kind_multi, "multi_key")
        self.assertEqual(token_multi, "w+e")

        kind_mouse, token_mouse, _ = map_action_to_input("INTERACT", {"mouse": "left_click"})
        self.assertEqual(kind_mouse, "mouse")
        self.assertEqual(token_mouse, "left_click")

    def test_input_driver_dry_run_and_release_all(self) -> None:
        self.assertEqual(detect_controller_backend(dry_run=True), "dry-run")
        driver = InputDriver()
        driver.execute_key_hold("w", 120, dry_run=True)
        self.assertEqual(len(driver.pressed_keys), 0)

        driver.execute_multi_key_hold(["w", "e"], 120, dry_run=True)
        self.assertEqual(len(driver.pressed_keys), 0)

        driver.execute_mouse_action("left_click", x=10, y=20, dry_run=True)
        driver.pressed_keys.add("w")
        driver.release_all()
        self.assertEqual(len(driver.pressed_keys), 0)

    def test_window_detector_safe_on_current_platform(self) -> None:
        windows = list_visible_windows()
        self.assertIsInstance(windows, list)


if __name__ == "__main__":
    unittest.main()
