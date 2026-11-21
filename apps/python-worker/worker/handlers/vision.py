from typing import Any, Dict

from worker.vision.analyzer import VisionAnalyzer
from worker.vision.capabilities import get_vision_capabilities
from worker.vision.capture import capture_screen_png
from worker.vision.window_detector import list_visible_windows

_analyzer = VisionAnalyzer()


def handle_vision_capabilities(_payload: Dict[str, Any]) -> Dict[str, Any]:
    return get_vision_capabilities()


def handle_list_windows(_payload: Dict[str, Any]) -> Dict[str, Any]:
    windows = list_visible_windows()
    return {"windows": windows}


def handle_capture_frame(payload: Dict[str, Any]) -> Dict[str, Any]:
    window_title = str(payload.get("windowTitle") or "Primary Display")
    source_path = payload.get("sourcePath")
    sampling_interval_ms = int(payload.get("samplingIntervalMs") or 1000)

    png_bytes = capture_screen_png(
        source_path=str(source_path) if isinstance(source_path, str) and source_path else None,
        window_title=window_title,
    )
    return _analyzer.analyze_png(
        png_bytes=png_bytes,
        window_title=window_title,
        sampling_interval_ms=sampling_interval_ms,
    )
