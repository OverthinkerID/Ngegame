import os
import platform
import subprocess
import tempfile
from typing import Optional


def _find_macos_window_id(window_title: str) -> Optional[int]:
    """Find CGWindowID for a given window or owner name on macOS via Quartz or compiled Swift CoreGraphics helper."""
    target = window_title.strip().lower()
    if not target or target == "primary display":
        return None
    # Strip "Owner: Title" or "Owner — Title" format if passed from UI dropdown
    tokens = [t.strip() for t in target.replace("—", ":").split(":") if t.strip()]
    if not tokens:
        return None

    try:
        import Quartz  # type: ignore[import-not-found]

        win_list = Quartz.CGWindowListCopyWindowInfo(
            Quartz.kCGWindowListExcludeDesktopElements,
            Quartz.kCGNullWindowID,
        )
        best_id: Optional[int] = None
        best_area = 0.0
        for win in win_list or []:
            if int(win.get("kCGWindowLayer") or -1) != 0:
                continue
            owner = str(win.get("kCGWindowOwnerName") or "").lower()
            name = str(win.get("kCGWindowName") or "").lower()
            if not any(tok in owner or tok in name for tok in tokens):
                continue
            bounds = win.get("kCGWindowBounds") or {}
            area = float(bounds.get("Width") or 0) * float(bounds.get("Height") or 0)
            if area < 10000:
                continue
            wid = win.get("kCGWindowNumber")
            if wid is not None and area > best_area:
                best_area = area
                best_id = int(wid)
        if best_id is not None:
            return best_id
    except Exception:
        pass

    # Fallback: compile native Swift CoreGraphics helper once into temp dir
    try:
        swift_src = os.path.join(os.path.dirname(__file__), "macos_window_id.swift")
        bin_path = os.path.join(tempfile.gettempdir(), "ngegame_macos_winid_v2")
        if os.path.isfile(swift_src) and not os.path.isfile(bin_path):
            subprocess.run(
                ["swiftc", "-O", swift_src, "-o", bin_path],
                capture_output=True,
                timeout=15,
                check=False,
            )
        if os.path.isfile(bin_path):
            res = subprocess.run(
                [bin_path, window_title],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            out = res.stdout.strip()
            if out.isdigit():
                return int(out)
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
