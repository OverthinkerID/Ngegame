import ctypes
import platform
import re
import subprocess
from typing import Any, Dict, List, Optional


def list_visible_windows() -> List[Dict[str, Any]]:
    system = platform.system()
    if system == "Darwin":
        return _list_macos_windows()
    if system == "Windows":
        return _list_windows_win32()
    return []


def _extract_asn(text: str) -> str:
    match = re.search(r"ASN:0x[0-9a-fA-F]+-0x[0-9a-fA-F]+", text)
    if match:
        return match.group(0).lower()
    return text.strip().strip('"').lower()


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
        if front_res.returncode == 0 and front_res.stdout.strip():
            front_asn = _extract_asn(front_res.stdout)

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
            re.finditer(r'(ASN:[^\s"-]+(?:-[^\s"-]+)?)-"([^"]+)"', vis_res.stdout)
        ):
            asn = _extract_asn(match.group(1))
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
                        "hwnd": int(hwnd),
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


def focus_game_window(window_title: str) -> Dict[str, Any]:
    target = window_title.strip()
    if not target:
        return {"focused": False, "reason": "window_title kosong"}

    system = platform.system()
    if system == "Darwin":
        return _focus_macos_window(target)
    if system == "Windows":
        return _focus_windows_win32(target)
    return {"focused": False, "reason": f"Platform {system} belum didukung untuk fokus otomatis"}


def _focus_macos_window(target: str) -> Dict[str, Any]:
    windows = list_visible_windows()
    matched = next(
        (
            w
            for w in windows
            if target.lower() in str(w.get("title", "")).lower()
            or target.lower() in str(w.get("owner", "")).lower()
        ),
        None,
    )
    app_name = str(matched.get("owner") or target) if matched else target
    safe_name = app_name.replace('"', '\\"')

    script = (
        f'tell application "{safe_name}" to activate\n'
        'delay 0.15\n'
        'return "ok"'
    )
    try:
        res = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            text=True,
            timeout=2.0,
            check=False,
        )
        if res.returncode == 0:
            return {"focused": True, "target": app_name, "method": "osascript-activate"}
        # Fallback via open -a
        open_res = subprocess.run(
            ["open", "-a", app_name],
            capture_output=True,
            text=True,
            timeout=2.0,
            check=False,
        )
        if open_res.returncode == 0:
            return {"focused": True, "target": app_name, "method": "open-a"}
        return {
            "focused": False,
            "target": app_name,
            "reason": (res.stderr or open_res.stderr or "Gagal mengaktifkan aplikasi").strip(),
        }
    except Exception as exc:
        return {"focused": False, "target": app_name, "reason": str(exc)}


def _focus_windows_win32(target: str) -> Dict[str, Any]:
    try:
        windows = _list_windows_win32()
        matched = next(
            (w for w in windows if target.lower() in str(w.get("title", "")).lower()),
            None,
        )
        if not matched or "hwnd" not in matched:
            return {"focused": False, "target": target, "reason": f"Jendela '{target}' tidak ditemukan"}

        hwnd = int(matched["hwnd"])
        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        SW_RESTORE = 9
        if user32.IsIconic(hwnd):
            user32.ShowWindow(hwnd, SW_RESTORE)
        ok = bool(user32.SetForegroundWindow(hwnd))
        if not ok:
            # Simulasikan Alt singkat agar Windows mengizinkan SetForegroundWindow
            user32.keybd_event(0x12, 0, 0, 0)
            user32.keybd_event(0x12, 0, 0x0002, 0)
            ok = bool(user32.SetForegroundWindow(hwnd))
        return {
            "focused": ok,
            "target": matched["title"],
            "hwnd": hwnd,
            "method": "win32-SetForegroundWindow",
        }
    except Exception as exc:
        return {"focused": False, "target": target, "reason": str(exc)}


def check_macos_accessibility_trusted() -> Optional[bool]:
    if platform.system() != "Darwin":
        return None
    try:
        app_services = ctypes.CDLL(
            "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
        )
        app_services.AXIsProcessTrusted.restype = ctypes.c_bool
        return bool(app_services.AXIsProcessTrusted())
    except Exception:
        return None


def check_macos_screen_recording_permission() -> Optional[bool]:
    if platform.system() != "Darwin":
        return None
    try:
        core_graphics = ctypes.CDLL(
            "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics"
        )
        if hasattr(core_graphics, "CGPreflightScreenCaptureAccess"):
            core_graphics.CGPreflightScreenCaptureAccess.restype = ctypes.c_bool
            return bool(core_graphics.CGPreflightScreenCaptureAccess())
        return None
    except Exception:
        return None


def get_platform_diagnostics(expected_game: Optional[str] = None) -> Dict[str, Any]:
    system = platform.system()
    windows = list_visible_windows()
    focused_window = next((w for w in windows if w.get("focused")), None)
    game_window = None
    if expected_game:
        game_window = next(
            (
                w
                for w in windows
                if expected_game.lower() in str(w.get("title", "")).lower()
                or expected_game.lower() in str(w.get("owner", "")).lower()
            ),
            None,
        )

    diag: Dict[str, Any] = {
        "platform": system,
        "release": platform.release(),
        "machine": platform.machine(),
        "visibleWindowCount": len(windows),
        "focusedWindow": focused_window,
        "expectedGame": expected_game,
        "gameWindowFound": game_window is not None,
        "gameWindow": game_window,
    }

    if system == "Darwin":
        ax_trusted = check_macos_accessibility_trusted()
        screen_ok = check_macos_screen_recording_permission()
        diag["macos"] = {
            "accessibilityTrusted": ax_trusted,
            "screenRecordingGranted": screen_ok,
            "instructions": (
                []
                if ax_trusted and screen_ok is not False
                else [
                    "Buka System Settings -> Privacy & Security -> Accessibility, lalu aktifkan Terminal / Electron / Ngegame.",
                    "Buka System Settings -> Privacy & Security -> Screen & System Audio Recording, lalu aktifkan Terminal / Electron / Ngegame.",
                    "Jika menggunakan Input Monitoring, aktifkan juga di Privacy & Security -> Input Monitoring.",
                ]
            ),
        }
    elif system == "Windows":
        is_admin = False
        try:
            is_admin = bool(ctypes.windll.shell32.IsUserAnAdmin())  # type: ignore[attr-defined]
        except Exception:
            is_admin = False
        diag["windows"] = {
            "isElevatedAdmin": is_admin,
            "inputMethod": "SendInput (KEYEVENTF_SCANCODE)",
            "note": (
                "Jika game dijalankan sebagai Administrator, aplikasi/backend juga harus memiliki privilege setara agar UIPI tidak memblokir input."
            ),
        }

    return diag
