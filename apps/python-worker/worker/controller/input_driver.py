import ctypes
import importlib.util
import platform
import time
from typing import Dict, Optional, Set

from worker.vision.window_detector import check_macos_accessibility_trusted


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

WIN_EXTENDED_KEYS = {"left", "up", "right", "down"}


def detect_controller_backend(dry_run: bool = True) -> str:
    if dry_run:
        return "dry-run"
    system = platform.system()
    if system == "Darwin":
        return "macos-quartz-cgevent"
    if system == "Windows":
        return "windows-sendinput-scancode"
    if importlib.util.find_spec("pynput") is not None:
        return "pynput"
    return "dry-run"


class InputDriver:
    def __init__(self) -> None:
        self.pressed_keys: Set[str] = set()
        self._pynput_kb: Optional[object] = None
        self.last_error: Optional[str] = None

    def _ensure_macos_permission(self) -> None:
        trusted = check_macos_accessibility_trusted()
        if trusted is False:
            msg = (
                "Izin Accessibility macOS belum diberikan (AXIsProcessTrusted=False). "
                "Buka System Settings -> Privacy & Security -> Accessibility dan aktifkan Terminal/Electron."
            )
            self.last_error = msg
            raise PermissionError(msg)

    def _macos_key_event(self, key: str, key_down: bool) -> bool:
        keycode = MAC_KEYCODES.get(key.lower())
        if keycode is None:
            return False
        try:
            app_services = ctypes.CDLL(
                "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
            )
            app_services.CGEventCreateKeyboardEvent.argtypes = [
                ctypes.c_void_p,
                ctypes.c_uint16,
                ctypes.c_bool,
            ]
            app_services.CGEventCreateKeyboardEvent.restype = ctypes.c_void_p
            app_services.CGEventSetFlags.argtypes = [ctypes.c_void_p, ctypes.c_uint64]
            app_services.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]
            app_services.CFRelease.argtypes = [ctypes.c_void_p]

            event = app_services.CGEventCreateKeyboardEvent(None, keycode, key_down)
            if not event:
                return False
            app_services.CGEventSetFlags(event, 0)
            app_services.CGEventPost(0, event)  # kCGHIDEventTap = 0
            app_services.CFRelease(event)
            return True
        except Exception as exc:
            self.last_error = str(exc)
            return False

    def _win32_send_input_key(self, key: str, key_down: bool) -> bool:
        vk = WIN_VKCODES.get(key.lower())
        if vk is None:
            return False
        try:
            user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            scan = user32.MapVirtualKeyW(vk, 0)

            class KEYBDINPUT(ctypes.Structure):
                _fields_ = [
                    ("wVk", ctypes.c_ushort),
                    ("wScan", ctypes.c_ushort),
                    ("dwFlags", ctypes.c_ulong),
                    ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.c_size_t),
                ]

            class MOUSEINPUT(ctypes.Structure):
                _fields_ = [
                    ("dx", ctypes.c_long),
                    ("dy", ctypes.c_long),
                    ("mouseData", ctypes.c_ulong),
                    ("dwFlags", ctypes.c_ulong),
                    ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.c_size_t),
                ]

            class HARDWAREINPUT(ctypes.Structure):
                _fields_ = [
                    ("uMsg", ctypes.c_ulong),
                    ("wParamL", ctypes.c_ushort),
                    ("wParamH", ctypes.c_ushort),
                ]

            class INPUT_UNION(ctypes.Union):
                _fields_ = [
                    ("ki", KEYBDINPUT),
                    ("mi", MOUSEINPUT),
                    ("hi", HARDWAREINPUT),
                ]

            class INPUT(ctypes.Structure):
                _fields_ = [
                    ("type", ctypes.c_ulong),
                    ("union", INPUT_UNION),
                ]

            KEYEVENTF_EXTENDEDKEY = 0x0001
            KEYEVENTF_KEYUP = 0x0002
            KEYEVENTF_SCANCODE = 0x0008

            flags = KEYEVENTF_SCANCODE
            if key.lower() in WIN_EXTENDED_KEYS:
                flags |= KEYEVENTF_EXTENDEDKEY
            if not key_down:
                flags |= KEYEVENTF_KEYUP

            inp = INPUT()
            inp.type = 1  # INPUT_KEYBOARD
            inp.union.ki = KEYBDINPUT(
                wVk=0 if scan else vk,
                wScan=scan,
                dwFlags=flags if scan else (0 if key_down else KEYEVENTF_KEYUP),
                time=0,
                dwExtraInfo=0,
            )

            sent = user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            if sent == 1:
                return True

            # Fallback ke keybd_event
            legacy_flags = 0 if key_down else KEYEVENTF_KEYUP
            user32.keybd_event(vk, scan, legacy_flags, 0)
            return True
        except Exception as exc:
            self.last_error = str(exc)
            return False

    def execute_key_hold(self, key: str, duration_ms: int, dry_run: bool) -> None:
        self.pressed_keys.add(key)
        self.last_error = None
        try:
            if dry_run:
                return

            system = platform.system()
            if system == "Darwin":
                self._ensure_macos_permission()
                if not self._macos_key_event(key, True):
                    raise RuntimeError(self.last_error or f"Gagal mengirim key down '{key}' via Quartz CGEvent")
                time.sleep(duration_ms / 1000.0)
                self._macos_key_event(key, False)
                return

            if system == "Windows":
                if not self._win32_send_input_key(key, True):
                    raise RuntimeError(self.last_error or f"Gagal mengirim key down '{key}' via Win32 SendInput")
                time.sleep(duration_ms / 1000.0)
                self._win32_send_input_key(key, False)
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
        finally:
            self.pressed_keys.discard(key)

    def execute_multi_key_hold(self, keys: list[str], duration_ms: int, dry_run: bool) -> None:
        for key in keys:
            self.pressed_keys.add(key)
        self.last_error = None
        try:
            if dry_run:
                return
            system = platform.system()
            if system == "Darwin":
                self._ensure_macos_permission()
            for key in keys:
                if system == "Darwin":
                    if not self._macos_key_event(key, True):
                        raise RuntimeError(self.last_error or f"Gagal mengirim combo key down '{key}'")
                elif system == "Windows":
                    if not self._win32_send_input_key(key, True):
                        raise RuntimeError(self.last_error or f"Gagal mengirim combo key down '{key}'")
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
            except Exception as exc:
                self.last_error = str(exc)
                return
        elif system == "Darwin":
            self._ensure_macos_permission()
            if importlib.util.find_spec("pynput") is not None:
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
                self._win32_send_input_key(key, False)
        self.pressed_keys.clear()
