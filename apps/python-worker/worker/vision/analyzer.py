import base64
import hashlib
import struct
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from worker.vision.capabilities import get_vision_capabilities


class VisionAnalyzer:
    def __init__(self) -> None:
        self._last_frame_digest: Optional[str] = None
        self._last_sample_bytes: Optional[bytes] = None
        self._last_scene: Optional[str] = None

    @staticmethod
    def _parse_png_dimensions(png_bytes: bytes) -> Tuple[int, int]:
        # Standard PNG IHDR chunk starts at byte 16 (width: 4 bytes, height: 4 bytes)
        if len(png_bytes) >= 24 and png_bytes[:8] == b"\x89PNG\r\n\x1a\n":
            width, height = struct.unpack(">II", png_bytes[16:24])
            return int(width), int(height)
        return 0, 0

    def _compute_motion_and_brightness(
        self, png_bytes: bytes
    ) -> Tuple[float, float, List[Dict[str, Any]], str]:
        # Try OpenCV + NumPy if installed
        try:
            import cv2  # type: ignore[import-not-found]
            import numpy as np  # type: ignore[import-not-found]

            arr = np.frombuffer(png_bytes, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is not None:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                brightness = float(np.mean(gray)) / 255.0

                # Downsample for fast motion & contour detection
                small = cv2.resize(gray, (160, 90))
                sample = small.tobytes()
                motion_score = 0.0
                if self._last_sample_bytes and len(self._last_sample_bytes) == len(sample):
                    prev_arr = np.frombuffer(self._last_sample_bytes, dtype=np.uint8).astype(np.int16)
                    curr_arr = np.frombuffer(sample, dtype=np.uint8).astype(np.int16)
                    motion_score = float(np.mean(np.abs(curr_arr - prev_arr))) / 255.0
                self._last_sample_bytes = sample

                # Simple contour-based object detection on edges
                edges = cv2.Canny(small, 80, 180)
                contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                objects: List[Dict[str, Any]] = []
                h_scale = img.shape[0] / 90.0
                w_scale = img.shape[1] / 160.0
                for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
                    x, y, w, h = cv2.boundingRect(cnt)
                    if w * h < 20:
                        continue
                    objects.append(
                        {
                            "label": "visual_region",
                            "confidence": 0.72,
                            "bbox": [
                                int(x * w_scale),
                                int(y * h_scale),
                                int(w * w_scale),
                                int(h * h_scale),
                            ],
                        }
                    )

                ocr_text = ""
                try:
                    import pytesseract  # type: ignore[import-not-found]
                    from PIL import Image  # type: ignore[import-not-found]
                    import io

                    pil_img = Image.open(io.BytesIO(png_bytes))
                    ocr_text = pytesseract.image_to_string(pil_img).strip()[:500]
                except Exception:
                    ocr_text = ""

                return round(motion_score, 4), round(brightness, 4), objects, ocr_text
        except ImportError:
            pass

        # Stdlib fallback when OpenCV is not installed
        sample_step = max(1, len(png_bytes) // 512)
        sample = png_bytes[::sample_step][:512]
        brightness = sum(sample) / (len(sample) * 255.0) if sample else 0.0

        motion_score = 0.0
        if self._last_sample_bytes and len(self._last_sample_bytes) == len(sample):
            diff = sum(abs(a - b) for a, b in zip(sample, self._last_sample_bytes))
            motion_score = diff / (len(sample) * 255.0)
        elif self._last_frame_digest is not None:
            digest = hashlib.sha256(png_bytes).hexdigest()
            motion_score = 0.25 if digest != self._last_frame_digest else 0.0

        self._last_sample_bytes = sample
        self._last_frame_digest = hashlib.sha256(png_bytes).hexdigest()
        return round(motion_score, 4), round(brightness, 4), [], ""

    @staticmethod
    def _classify_scene(brightness: float, motion_score: float) -> str:
        if brightness < 0.18:
            return "dark_menu_or_loading"
        if motion_score >= 0.08:
            return "active_gameplay"
        if brightness > 0.75:
            return "bright_ui_or_dialog"
        return "static_hud_or_idle"

    def analyze_png(
        self,
        png_bytes: bytes,
        window_title: str = "Primary Display",
        sampling_interval_ms: int = 1000,
    ) -> Dict[str, Any]:
        started = time.perf_counter()
        width, height = self._parse_png_dimensions(png_bytes)
        capabilities = get_vision_capabilities()

        motion_score, brightness, objects, ocr_text = self._compute_motion_and_brightness(
            png_bytes
        )
        scene_label = self._classify_scene(brightness, motion_score)
        now_iso = datetime.now(timezone.utc).isoformat()

        events: List[Dict[str, Any]] = []
        if self._last_scene is not None and self._last_scene != scene_label:
            events.append(
                {
                    "type": "SCENE_TRANSITION",
                    "description": f"Perubahan scene dari {self._last_scene} ke {scene_label}",
                    "severity": "info",
                    "timestamp": now_iso,
                }
            )
        if motion_score >= 0.15:
            events.append(
                {
                    "type": "HIGH_MOTION",
                    "description": f"Aktivitas visual tinggi terdeteksi (motion={motion_score})",
                    "severity": "highlight",
                    "timestamp": now_iso,
                }
            )
        self._last_scene = scene_label

        hud_regions = [
            {
                "region": "top_left",
                "label": "Primary Status Region",
                "value": ocr_text[:40] if ocr_text else "OCR standby",
                "confidence": 0.85 if ocr_text else 0.4,
            },
            {
                "region": "bottom_center",
                "label": "Action Bar Region",
                "value": scene_label,
                "confidence": 0.78,
            },
        ]

        processing_ms = int((time.perf_counter() - started) * 1000)
        image_b64 = base64.b64encode(png_bytes).decode("ascii")

        return {
            "windowTitle": window_title,
            "platform": capabilities["platform"],
            "width": width,
            "height": height,
            "imageBase64": f"data:image/png;base64,{image_b64}",
            "sceneLabel": scene_label,
            "motionScore": motion_score,
            "brightness": brightness,
            "processingMs": processing_ms,
            "samplingIntervalMs": sampling_interval_ms,
            "ocrText": ocr_text,
            "hud": hud_regions,
            "objects": objects,
            "events": events,
            "capabilities": capabilities,
            "createdAt": now_iso,
        }
