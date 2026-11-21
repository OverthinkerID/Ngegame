import os
import platform
import subprocess
import tempfile
from typing import Optional


def _find_macos_window_id(window_title: str) -> Optional[int]:
    """Find CGWindowID for a given window or owner name on macOS via Quartz or CoreGraphics ctypes."""
    target = window_title.strip().lower()
    if not target or target == "primary display":
        return None
    # Strip "Owner: Title" format if passed from UI dropdown
    tokens = [t.strip() for t in target.split(":") if t.strip()]
    try:
        import Quartz  # type: ignore[import-not-found]

        win_list = Quartz.CGWindowListCopyWindowInfo(
            Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
            Quartz.kCGNullWindowID,
        )
        for win in win_list or []:
            owner = str(win.get("kCGWindowOwnerName") or "").lower()
            name = str(win.get("kCGWindowName") or "").lower()
            layer = int(win.get("kCGWindowLayer") or 0)
            if layer != 0:
                continue
            if any(tok in owner or tok in name for tok in tokens):
                wid = win.get("kCGWindowNumber")
                if wid is not None:
                    return int(wid)
    except Exception:
        pass

    # Fallback: built-in macOS CoreGraphics + CoreFoundation via ctypes (tanpa pyobjc)
    try:
        import ctypes

        cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
        cf = ctypes.CDLL("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
        cf.CFArrayGetCount.argtypes = [ctypes.c_void_p]
        cf.CFArrayGetCount.restype = ctypes.c_long
        cf.CFArrayGetValueAtIndex.argtypes = [ctypes.c_void_p, ctypes.c_long]
        cf.CFArrayGetValueAtIndex.restype = ctypes.c_void_p
        cf.CFDictionaryGetValue.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        cf.CFDictionaryGetValue.restype = ctypes.c_void_p
        cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
        cf.CFStringCreateWithCString.restype = ctypes.c_void_p
        cf.CFStringGetCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_long, ctypes.c_uint32]
        cf.CFStringGetCString.restype = ctypes.c_bool
        cf.CFNumberGetValue.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p]
        cf.CFNumberGetValue.restype = ctypes.c_bool
        cf.CFRelease.argtypes = [ctypes.c_void_p]
        cg.CGWindowListCopyWindowInfo.argtypes = [ctypes.c_uint32, ctypes.c_uint32]
        cg.CGWindowListCopyWindowInfo.restype = ctypes.c_void_p

        def cfstr(s: str) -> ctypes.c_void_p:
            return cf.CFStringCreateWithCString(None, s.encode("utf-8"), 0x08000100)

        def to_pystr(p: ctypes.c_void_p) -> str:
            if not p:
                return ""
            buf = ctypes.create_string_buffer(512)
            return buf.value.decode("utf-8", "ignore") if cf.CFStringGetCString(p, buf, 512, 0x08000100) else ""

        k_owner = cfstr("kCGWindowOwnerName")
        k_name = cfstr("kCGWindowName")
        k_num = cfstr("kCGWindowNumber")
        k_layer = cfstr("kCGWindowLayer")
        arr = cg.CGWindowListCopyWindowInfo(1 | 16, 0)
        try:
            cnt = cf.CFArrayGetCount(arr) if arr else 0
            for i in range(cnt):
                d = cf.CFArrayGetValueAtIndex(arr, i)
                lay_p = cf.CFDictionaryGetValue(d, k_layer)
                lay = ctypes.c_int(0)
                if lay_p:
                    cf.CFNumberGetValue(lay_p, 3, ctypes.byref(lay))
                if lay.value != 0:
                    continue
                owner = to_pystr(cf.CFDictionaryGetValue(d, k_owner)).lower()
                name = to_pystr(cf.CFDictionaryGetValue(d, k_name)).lower()
                if any(tok in owner or tok in name for tok in tokens):
                    num_p = cf.CFDictionaryGetValue(d, k_num)
                    num = ctypes.c_int(0)
                    if num_p and cf.CFNumberGetValue(num_p, 3, ctypes.byref(num)):
                        return int(num.value)
        finally:
            if arr:
                cf.CFRelease(arr)
            for k in (k_owner, k_name, k_num, k_layer):
                if k:
                    cf.CFRelease(k)
    except Exception:
        return None
    return None


def capture_screen_png(
    source_path: Optional[str] = None,
    window_title: Optional[str] = None,
) -> bytes:
    """Capture screen or specific window as PNG bytes."""
    if source_path:
        if not os.path.isfile(source_path):
            raise FileNotFoundError(f"Screenshot source not found: {source_path}")
        with open(source_path, "rb") as f:
            return f.read()

    system = platform.system()
    if system == "Darwin":
        wid = _find_macos_window_id(window_title or "")
        if wid is not None:
            return _capture_macos_screencapture(window_id=wid)

    # Prefer mss when available for full-screen capture
    try:
        import mss  # type: ignore[import-not-found]
        import mss.tools  # type: ignore[import-not-found]

        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            shot = sct.grab(monitor)
            return bytes(mss.tools.to_png(shot.rgb, shot.size))
    except ImportError:
        pass

    if system == "Darwin":
        return _capture_macos_screencapture()
    if system == "Windows":
        return _capture_windows_powershell()

    raise RuntimeError(
        f"No screen capture backend available on platform '{system}'. Install 'mss' or provide sourcePath."
    )


def _capture_macos_screencapture(window_id: Optional[int] = None) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        cmd = ["screencapture", "-x", "-t", "png"]
        if window_id is not None:
            cmd.extend(["-l", str(window_id)])
        cmd.append(tmp_path)
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"macOS screencapture failed (code={completed.returncode}): {completed.stderr.strip()}"
            )
        with open(tmp_path, "rb") as f:
            data = f.read()
        if not data:
            raise RuntimeError("macOS screencapture produced an empty file")
        return data
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _capture_windows_powershell() -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    ps_script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "Add-Type -AssemblyName System.Drawing; "
        "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
        "$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; "
        "$gfx = [System.Drawing.Graphics]::FromImage($bmp); "
        "$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); "
        f"$bmp.Save('{tmp_path}', [System.Drawing.Imaging.ImageFormat]::Png); "
        "$gfx.Dispose(); $bmp.Dispose();"
    )
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"Windows screen capture failed: {completed.stderr.strip()}"
            )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
