import platform
import subprocess
from typing import Any, Dict, List


def list_visible_windows() -> List[Dict[str, Any]]:
    system = platform.system()
    if system == "Darwin":
        return _list_macos_windows()
    if system == "Windows":
        return _list_windows_win32()
    return []


def _list_macos_windows() -> List[Dict[str, Any]]:
    script = (
        'tell application "System Events"\n'
        'set outList to {}\n'
        'repeat with proc in (every process whose visible is true)\n'
        'set procName to name of proc\n'
        'set procId to unix id of proc\n'
        'try\n'
        'repeat with win in (every window of proc)\n'
        'set winTitle to name of win\n'
        'set end of outList to (procName & "||" & winTitle & "||" & (procId as string))\n'
        'end repeat\n'
        'end try\n'
        'end repeat\n'
        'return outList\n'
        'end tell'
    )
    try:
        completed = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        if completed.returncode != 0 or not completed.stdout.strip():
            return []
        windows: List[Dict[str, Any]] = []
        raw_items = completed.stdout.strip().split(", ")
        for idx, item in enumerate(raw_items):
            parts = item.split("||")
            owner = parts[0].strip() if len(parts) > 0 else "Unknown"
            title = parts[1].strip() if len(parts) > 1 and parts[1].strip() else owner
            pid = int(parts[2].strip()) if len(parts) > 2 and parts[2].strip().isdigit() else None
            windows.append(
                {
                    "id": f"mac-{idx}-{pid or 0}",
                    "title": title,
                    "owner": owner,
                    **({"pid": pid} if pid is not None else {}),
                }
            )
        return windows
    except Exception:
        return []


def _list_windows_win32() -> List[Dict[str, Any]]:
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        windows: List[Dict[str, Any]] = []
        enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def callback(hwnd: int, _lparam: int) -> bool:
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return True
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            title = buff.value.strip()
            if title:
                pid = wintypes.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                windows.append(
                    {
                        "id": f"win-{hwnd}",
                        "title": title,
                        "owner": title,
                        "pid": int(pid.value),
                    }
                )
            return True

        user32.EnumWindows(enum_proc(callback), 0)
        return windows
    except Exception:
        return []
