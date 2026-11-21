#!/usr/bin/env python3
"""
Adapter CLI Voice Cloning untuk Overthinker-Ngegame (VoxCPM 2.0 & F5-TTS).
Dipanggil oleh voxcpm_server.py melalui:
  VOXCPM_CMD="/path/ke/venv/bin/python apps/python-worker/infer_voice_clone.py" npm run voice:server

Mendukung:
  --text <teks>
  --out <output.wav>
  --ref <reference_audio.wav/mp3>
  --ref-text <transkrip_opsional>
  --backend auto|voxcpm|f5-tts
"""

import argparse
import importlib.util
import os
import subprocess
import sys


def detect_backend(requested: str) -> str:
    if requested != "auto":
        return requested
    if importlib.util.find_spec("voxcpm") is not None:
        return "voxcpm"
    if importlib.util.find_spec("f5_tts") is not None:
        return "f5-tts"
    return "none"


def run_f5_tts(text: str, out_wav: str, ref_audio: str, ref_text: str) -> None:
    cmd = [
        sys.executable,
        "-m",
        "f5_tts.infer.infer_cli",
        "--ref_audio",
        ref_audio,
        "--gen_text",
        text,
        "--output_file",
        os.path.basename(out_wav),
        "--output_dir",
        os.path.dirname(os.path.abspath(out_wav)),
    ]
    if ref_text:
        cmd.extend(["--ref_text", ref_text])
    subprocess.run(cmd, check=True, timeout=120)


def run_voxcpm(text: str, out_wav: str, ref_audio: str, ref_text: str) -> None:
    import soundfile as sf  # type: ignore[import-not-found]
    from voxcpm import VoxCPM  # type: ignore[import-not-found]

    model_id = os.environ.get("VOXCPM_MODEL_ID", "openbmb/VoxCPM-0.5B")
    model = VoxCPM.from_pretrained(model_id)
    has_ref = bool(ref_audio and os.path.isfile(ref_audio))
    effective_prompt_text = (ref_text or "").strip() or "Halo semuanya, ini adalah contoh suara referensi."
    wav = model.generate(
        text=text,
        prompt_wav_path=ref_audio if has_ref else None,
        prompt_text=effective_prompt_text if has_ref else None,
    )
    sf.write(out_wav, wav, 16000)


def main() -> int:
    parser = argparse.ArgumentParser(description="Adapter CLI VoxCPM / F5-TTS")
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--ref", default="")
    parser.add_argument("--ref-text", default="")
    parser.add_argument("--backend", default="auto", choices=["auto", "voxcpm", "f5-tts"])
    args = parser.parse_args()

    backend = detect_backend(args.backend)
    if backend == "none":
        print(
            "Error: Tidak ditemukan paket 'voxcpm' maupun 'f5_tts' di Python environment ini.",
            file=sys.stderr,
        )
        return 2

    if backend == "f5-tts":
        if not args.ref:
            print("Error: F5-TTS membutuhkan --ref <audio_referensi>", file=sys.stderr)
            return 3
        run_f5_tts(args.text, args.out, args.ref, args.ref_text)
        return 0

    run_voxcpm(args.text, args.out, args.ref, args.ref_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
