import ctypes
import importlib.util
import platform
import time
from typing import Dict, Optional, Set


MAC_KEYCODES: Dict[str, int] = {
    "a": 0x00,
    "s": 0x01,
    "d": 0x02,
    "f": 0x03,
    "h": 0x04,
    "g": 0x05,
    "z": 0x06,
    "x": 0x07,
    "c": 0x08,
    "v": 0x09,
    "b": 0x0B,
    "q": 0x0C,
    "w": 0x0D,
    "e": 0x0E,
    "r": 0x0F,
    "1": 0x12,
    "2": 0x13,
    "3": 0x14,
    "4": 0x15,
    "5": 0x17,
    "enter": 0x24,
    "space": 0x31,
    "escape": 0x35,
    "left": 0x7B,
    "right": 0x7C,
    "down": 0x7D,
    "up": 0x7E,
}

WIN_VKCODES: Dict[str, int] = {
    "enter": 0x0D,
    "escape": 0x1B,
    "space": 0x20,
    "left": 0x25,
    "up": 0x26,
    "right": 0x27,
    "down": 0x28,
    "1": 0x31,
    "2": 0x32,
    "3": 0x33,
    "4": 0x34,
    "5": 0x35,
    "a": 0x41,
    "c": 0x43,
    "d": 0x44,
    "e": 0x45,
    "f": 0x46,
    "q": 0x51,
    "r": 0x52,
    "s": 0x53,
    "w": 0x57,
}


def detect_controller_backend(dry_run: bool = True) -> str:
    if dry_run:
        return "dry-run"
    if importlib.util.find_spec("pynput") is not None:
        return "pynput"
    system = platform.system()
    if system == "Darwin":
        return "macos-quartz-cgevent"
    if system == "Windows":
        return "windows-win32-keybd"
    return "dry-run"


class InputDriver:
    def __init__(self) -> None:
        self.pressed_keys: Set[str] = set()
        self._pynput_kb: Optional[object] = None

    def _macos_key_event(self, key: str, key_down: bool) -> bool:
        keycode = MAC_KEYCODES.get(key.lower())
        if keycode is None:
            return False
        try:
            app_services = ctypes.CDLL(
                "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
            )
            app_services.CGEventCreateKeyboardEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_bool]
            app_services.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
            app_services.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
            app_services.CFRelease.argtypes = [ctypes.c_void_p]

            event = app_services.CGEventCreateKeyboardEvent(None, keycode, key_down)
            if not event:
                return False
            app_services.CGEventPost(0, event)  # kCGHIDEventTap = 0
            app_services.CFRelease(event)
            return True
        except Exception:
            return False

    def _win32_key_event(self, key: str, key_down: bool) -> bool:
        vk = WIN_VKCODES.get(key.lower())
        if vk is None:
            return False
        try:
            user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            scan = user32.MapVirtualKeyW(vk, 0)
            flags = 0 if key_down else 0x0002  # KEYEVENTF_KEYUP
            user32.keybd_event(vk, scan, flags, 0)
            return True
        except Exception:
            return False

    def execute_key_hold(self, key: str, duration_ms: int, dry_run: bool) -> None:
        self.pressed_keys.add(key)
        try:
            if dry_run:
                return

            if importlib.util.find_spec("pynput") is not None:
                from pynput.keyboard import Controller, Key  # type: ignore[import-not-found]

                kb = Controller()
                self._pynput_kb = kb
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
                if self._macos_key_event(key, True):
                    time.sleep(duration_ms / 1000.0)
                    self._macos_key_event(key, False)
            elif system == "Windows":
                if self._win32_key_event(key, True):
                    time.sleep(duration_ms / 1000.0)
                    self._win32_key_event(key, False)
        finally:
            self.pressed_keys.discard(key)

    def execute_multi_key_hold(self, keys: list[str], duration_ms: int, dry_run: bool) -> None:
        for key in keys:
            self.pressed_keys.add(key)
        try:
            if dry_run:
                return
            system = platform.system()
            for key in keys:
                if system == "Darwin":
                    self._macos_key_event(key, True)
                elif system == "Windows":
                    self._win32_key_event(key, True)
            time.sleep(duration_ms / 1000.0)
        finally:
            self.release_all()

    def execute_mouse_action(self, action: str, x: Optional[int], y: Optional[int], dry_run: bool) -> None:
        if dry_run:
            return
        system = platform.system()
        if system == "Windows":
            try:
                user32 = ctypes.windll.user32  # type: ignore[attr-defined]
                if x is not None and y is not None:
                    user32.SetCursorPos(int(x), int(y))
                if action == "left_click":
                    user32.mouse_event(0x0002, 0, 0, 0, 0)
                    time.sleep(0.05)
                    user32.mouse_event(0x0004, 0, 0, 0, 0)
                elif action == "right_click":
                    user32.mouse_event(0x0008, 0, 0, 0, 0)
                    time.sleep(0.05)
                    user32.mouse_event(0x0010, 0, 0, 0, 0)
            except Exception:
                return
        elif system == "Darwin" and importlib.util.find_spec("pynput") is not None:
            from pynput.mouse import Button, Controller  # type: ignore[import-not-found]

            mouse = Controller()
            if x is not None and y is not None:
                mouse.position = (int(x), int(y))
            if action == "left_click":
                mouse.click(Button.left, 1)
            elif action == "right_click":
                mouse.click(Button.right, 1)

    def release_all(self) -> None:
        keys = list(self.pressed_keys)
        system = platform.system()
        for key in keys:
            if system == "Darwin":
                self._macos_key_event(key, False)
            elif system == "Windows":
                self._win32_key_event(key, False)
        self.pressed_keys.clear()
