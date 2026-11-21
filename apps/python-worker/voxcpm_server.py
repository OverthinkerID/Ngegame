#!/usr/bin/env python3
"""
VoxCPM 2.0 Local Bridge Server for Overthinker-Ngegame
Endpoints:
  GET  /health   -> 200 {"ok": true, "engine": "voxcpm2-bridge", ...}
  POST /api/tts  -> {"audio_base64": "<wav-base64>", "reference_received": bool, ...}

Jika `VOXCPM_CMD` dikonfigurasi (mis. skrip CLI VoxCPM 2.0 lokal), server akan
memanggilnya dengan argumen:
  --text <text> --out <out.wav> [--ref <ref_audio>]
Jika belum ada model VoxCPM 2.0 terpasang, di macOS server otomatis memakai
`say` + `afconvert` untuk menghasilkan WAV valid agar jalur Studio Suara AI
tetap bisa diuji pada http://localhost:8000.
"""

import base64
import importlib.util
import json
import os
import platform
import shlex
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional


PORT = int(os.environ.get("VOXCPM_PORT", "8000"))
HOST = os.environ.get("VOXCPM_HOST", "127.0.0.1")
VOXCPM_CMD = os.environ.get("VOXCPM_CMD", "").strip()


def _has_voxcpm_package() -> bool:
    return importlib.util.find_spec("voxcpm") is not None


def _synthesize_wav(
    text: str,
    speed: float,
    ref_path: Optional[str],
    out_wav: str,
) -> str:
    if VOXCPM_CMD:
        cmd = shlex.split(VOXCPM_CMD) + ["--text", text, "--out", out_wav]
        if ref_path:
            cmd.extend(["--ref", ref_path])
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180, check=False)
        if proc.returncode != 0:
            err_detail = (proc.stderr or proc.stdout or f"exit code {proc.returncode}").strip()
            print(f"[voxcpm-bridge] VOXCPM_CMD failed: {err_detail}", flush=True)
            raise RuntimeError(f"VOXCPM_CMD gagal: {err_detail[:400]}")
        if not os.path.isfile(out_wav) or os.path.getsize(out_wav) == 0:
            raise RuntimeError("VOXCPM_CMD selesai tetapi file output.wav kosong/tidak dibuat")
        return "voxcpm-custom-cmd"

    if platform.system() == "Darwin":
        rate_wpm = max(100, min(300, int(175 * speed)))
        aiff_path = f"{out_wav}.aiff"
        subprocess.run(["say", "-r", str(rate_wpm), "-o", aiff_path, text], check=True, timeout=30)
        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@22050", aiff_path, out_wav],
            check=True,
            timeout=30,
        )
        try:
            os.remove(aiff_path)
        except OSError:
            pass
        return "voxcpm-bridge-macos"

    if platform.system() == "Windows":
        safe_text = text.replace("'", "''")
        ps_cmd = (
            "Add-Type -AssemblyName System.Speech; "
            "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$s.SetOutputToWaveFile('{out_wav}'); "
            f"$s.Speak('{safe_text}'); "
            "$s.Dispose();"
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True, timeout=30)
        return "voxcpm-bridge-windows"

    raise RuntimeError("Tidak ada backend sintesis suara lokal pada OS ini; atur VOXCPM_CMD.")


class VoxCpmHandler(BaseHTTPRequestHandler):
    def _send_json(self, code: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "engine": "voxcpm2-bridge",
                    "voxcpm_installed": _has_voxcpm_package(),
                    "custom_cmd_configured": bool(VOXCPM_CMD),
                },
            )
            return
        self._send_json(404, {"ok": False, "error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/api/tts":
            self._send_json(404, {"ok": False, "error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        body_raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            body = json.loads(body_raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"ok": False, "error": "Invalid JSON"})
            return

        text = str(body.get("text") or "").strip()
        if not text:
            self._send_json(400, {"ok": False, "error": "text is required"})
            return

        speed = float(body.get("speed") or 1.0)
        ref_b64 = body.get("reference_audio_base64")
        ref_name = str(body.get("reference_filename") or "reference.wav")

        with tempfile.TemporaryDirectory() as tmpdir:
            ref_path: Optional[str] = None
            if isinstance(ref_b64, str) and ref_b64.strip():
                ext = Path(ref_name).suffix or ".wav"
                ref_path = os.path.join(tmpdir, f"ref{ext}")
                with open(ref_path, "wb") as rf:
                    rf.write(base64.b64decode(ref_b64))

            out_wav = os.path.join(tmpdir, "output.wav")
            try:
                engine_used = _synthesize_wav(text, speed, ref_path, out_wav)
                with open(out_wav, "rb") as wf:
                    audio_b64 = base64.b64encode(wf.read()).decode("ascii")
                self._send_json(
                    200,
                    {
                        "ok": True,
                        "engine": engine_used,
                        "reference_received": bool(ref_path),
                        "audio_base64": audio_b64,
                    },
                )
            except Exception as exc:
                self._send_json(500, {"ok": False, "error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), VoxCpmHandler)
    print(f"[voxcpm-bridge] Listening on http://{HOST}:{PORT} (VOXCPM_CMD={'set' if VOXCPM_CMD else 'local-fallback'})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
