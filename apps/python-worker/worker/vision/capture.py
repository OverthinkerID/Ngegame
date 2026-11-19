import os
import platform
import subprocess
import tempfile
from typing import Optional


def capture_screen_png(source_path: Optional[str] = None) -> bytes:
    """Capture screen as PNG bytes (supports source_path, mss, macOS screencapture, Windows GDI)."""
    if source_path:
        if not os.path.isfile(source_path):
            raise FileNotFoundError(f"Screenshot source not found: {source_path}")
        with open(source_path, "rb") as f:
            return f.read()

    # Prefer mss when available (fast cross-platform)
    try:
        import mss  # type: ignore[import-not-found]
        import mss.tools  # type: ignore[import-not-found]

        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            shot = sct.grab(monitor)
            return bytes(mss.tools.to_png(shot.rgb, shot.size))
    except ImportError:
        pass

    system = platform.system()
    if system == "Darwin":
        return _capture_macos_screencapture()
    if system == "Windows":
        return _capture_windows_powershell()

    raise RuntimeError(
        f"No screen capture backend available on platform '{system}'. Install 'mss' or provide sourcePath."
    )


def _capture_macos_screencapture() -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        completed = subprocess.run(
            ["screencapture", "-x", "-t", "png", tmp_path],
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
