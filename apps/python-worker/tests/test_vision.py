import os
import struct
import tempfile
import unittest
import zlib
import sys

WORKER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKER_DIR not in sys.path:
    sys.path.insert(0, WORKER_DIR)

from worker.handlers.vision import handle_capture_frame, handle_vision_capabilities  # noqa: E402


def _make_solid_png(width: int, height: int, rgb: tuple[int, int, int]) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw_row = b"\x00" + bytes(rgb) * width
    raw_data = raw_row * height
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw_data))
        + chunk(b"IEND", b"")
    )


class TestVisionEngine(unittest.TestCase):
    def test_capabilities_structure(self) -> None:
        caps = handle_vision_capabilities({})
        self.assertIn("platform", caps)
        self.assertIn("captureBackend", caps)
        self.assertIn("opencvAvailable", caps)
        self.assertIn("ocrAvailable", caps)

    def test_capture_and_analyze_synthetic_png(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(_make_solid_png(64, 36, (40, 180, 220)))
            tmp_path = tmp.name

        try:
            result = handle_capture_frame(
                {
                    "windowTitle": "Test Game Window",
                    "sourcePath": tmp_path,
                    "samplingIntervalMs": 1000,
                }
            )
            self.assertEqual(result["width"], 64)
            self.assertEqual(result["height"], 36)
            self.assertEqual(result["windowTitle"], "Test Game Window")
            self.assertTrue(str(result["imageBase64"]).startswith("data:image/png;base64,"))
            self.assertIn("sceneLabel", result)
            self.assertIsInstance(result["hud"], list)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)


if __name__ == "__main__":
    unittest.main()
