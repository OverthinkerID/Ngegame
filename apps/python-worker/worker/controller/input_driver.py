import importlib.util
import platform
import subprocess
import time
from typing import Set


def detect_controller_backend(dry_run: bool = True) -> str:
    if dry_run:
        return "dry-run"
    if importlib.util.find_spec("pynput") is not None:
        return "pynput"
    system = platform.system()
    if system == "Darwin":
        return "macos-osascript"
    if system == "Windows":
        return "windows-sendinput"
    return "dry-run"


class InputDriver:
    def __init__(self) -> None:
        self.pressed_keys: Set[str] = set()

    def execute_key_hold(self, key: str, duration_ms: int, dry_run: bool) -> None:
        self.pressed_keys.add(key)
        try:
            if dry_run:
                return

            if importlib.util.find_spec("pynput") is not None:
                from pynput.keyboard import Controller, Key  # type: ignore[import-not-found]

                kb = Controller()
                special = {
                    "space": Key.space,
                    "enter": Key.enter,
                    "escape": Key.esc,
                    "up": Key.up,
                    "down": Key.down,
                    "left": Key.left,
                    "right": Key.right,
                }
                target = special.get(key, key)
                kb.press(target)
                time.sleep(duration_ms / 1000.0)
                kb.release(target)
                return

            system = platform.system()
            if system == "Darwin":
                subprocess.run(
                    ["osascript", "-e", f'tell application "System Events" to keystroke "{key}"'],
                    capture_output=True,
                    timeout=3,
                    check=False,
                )
            elif system == "Windows":
                # Minimal safe PowerShell SendKeys fallback when pynput is absent
                subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-Command",
                        f"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{key}')",
                    ],
                    capture_output=True,
                    timeout=3,
                    check=False,
                )
        finally:
            self.pressed_keys.discard(key)

    def release_all(self) -> None:
        self.pressed_keys.clear()
