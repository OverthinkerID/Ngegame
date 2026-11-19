import importlib.util
import platform
from typing import Any, Dict


def _has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def get_vision_capabilities() -> Dict[str, Any]:
    system = platform.system()
    has_mss = _has_module("mss")
    has_cv2 = _has_module("cv2")
    has_pytesseract = _has_module("pytesseract")
    has_pil = _has_module("PIL")

    if has_mss:
        capture_backend = "mss"
    elif system == "Darwin":
        capture_backend = "macos-screencapture"
    elif system == "Windows":
        capture_backend = "windows-gdi"
    else:
        capture_backend = "file-only"

    return {
        "platform": system,
        "captureBackend": capture_backend,
        "opencvAvailable": has_cv2,
        "ocrAvailable": has_pytesseract,
        "pillowAvailable": has_pil,
    }
