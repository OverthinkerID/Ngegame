import platform
import re
import subprocess
from typing import Any, Dict, List


def list_visible_windows() -> List[Dict[str, Any]]:
    system = platform.system()
    if system == "Darwin":
        return _list_macos_windows()
    if system == "Windows":
        return _list_windows_win32()
    return []


def _list_macos_lsappinfo() -> List[Dict[str, Any]]:
    try:
        front_asn = ""
        front_res = subprocess.run(
            ["lsappinfo", "front"],
            capture_output=True,
            text=True,
            timeout=1.0,
            check=False,
        )
        if front_res.returncode == 0:
            front_asn = front_res.stdout.strip()

        vis_res = subprocess.run(
            ["lsappinfo", "visibleProcessList"],
            capture_output=True,
            text=True,
            timeout=1.0,
            check=False,
        )
        if vis_res.returncode != 0 or not vis_res.stdout.strip():
            return []

        windows: List[Dict[str, Any]] = []
        for idx, match in enumerate(
            re.finditer(r'(ASN:[^\s"]+)-"([^"]+)"', vis_res.stdout)
        ):
            asn = match.group(1)
            raw_name = match.group(2).replace("_", " ").strip()
            if not raw_name:
                continue
            windows.append(
                {
                    "id": f"mac-ls-{idx}",
                    "title": raw_name,
                    "owner": raw_name,
                    "focused": bool(front_asn and asn == front_asn),
                }
            )
        windows.sort(key=lambda w: (0 if w.get("focused") else 1))
        return windows
    except Exception:
        return []


def _list_macos_windows() -> List[Dict[str, Any]]:
    script = (
        'tell application "System Events"\n'
        'set outList to {}\n'
        'set frontName to ""\n'
        'try\n'
        'set frontProc to first process whose frontmost is true\n'
        'set frontName to name of frontProc\n'
        'end try\n'
        'repeat with proc in (every process whose visible is true)\n'
        'set procName to name of proc\n'
        'set procId to unix id of proc\n'
        'set isFront to "0"\n'
        'if procName is frontName then set isFront to "1"\n'
        'try\n'
        'repeat with win in (every window of proc)\n'
        'set winTitle to name of win\n'
        'set end of outList to (isFront & "||" & procName & "||" & winTitle & "||" & (procId as string))\n'
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
            timeout=1.2,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            windows: List[Dict[str, Any]] = []
            raw_items = completed.stdout.strip().split(", ")
            for idx, item in enumerate(raw_items):
                parts = item.split("||")
                is_front = parts[0].strip() == "1" if len(parts) > 0 else False
                owner = parts[1].strip() if len(parts) > 1 else "Unknown"
                title = parts[2].strip() if len(parts) > 2 and parts[2].strip() else owner
                pid = (
                    int(parts[3].strip())
                    if len(parts) > 3 and parts[3].strip().isdigit()
                    else None
                )
                windows.append(
                    {
                        "id": f"mac-{idx}-{pid or 0}",
                        "title": title,
                        "owner": owner,
                        "focused": is_front,
                        **({"pid": pid} if pid is not None else {}),
                    }
                )
            if windows:
                windows.sort(key=lambda w: (0 if w.get("focused") else 1))
                return windows
    except Exception:
        pass

    return _list_macos_lsappinfo()


def _list_windows_win32() -> List[Dict[str, Any]]:
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        foreground_hwnd = user32.GetForegroundWindow()
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
                        "focused": hwnd == foreground_hwnd,
                        "pid": int(pid.value),
                    }
                )
            return True

        user32.EnumWindows(enum_proc(callback), 0)
        windows.sort(key=lambda w: (0 if w.get("focused") else 1))
        return windows
    except Exception:
        return []
