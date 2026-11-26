"""Create short Japanese voice samples from the same narration line."""

import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import imageio_ffmpeg
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import ja


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = Path(os.environ.get("KOKORO_MODEL_DIR", Path(tempfile.gettempdir()) / "louvre-kokoro-model"))
STAGING = ROOT / "data" / "audio-staging"
VOICES = ("jf_alpha", "jf_gongitsune", "jf_nezumi", "jm_kumo")


def main():
    manifest = json.loads((ROOT / "data" / "audio-narration-manifest.json").read_text(encoding="utf-8"))
    narration = next(entry["text"] for entry in manifest["entries"]
                     if entry["id"] == "mona" and entry["secondsLabel"] == 60)
    sentence = narration.split("。")[0] + "。"
    phonemes, _ = ja.JAG2P()(sentence)
    session = ort.InferenceSession(str(MODEL_DIR / "kokoro-v1.0.int8.onnx"), providers=["CPUExecutionProvider"])
    model = Kokoro.from_session(session, str(MODEL_DIR / "voices-v1.0.bin"))
    STAGING.mkdir(parents=True, exist_ok=True)
    for voice in VOICES:
        if (STAGING / f"voice-preview-{voice}.mp3").exists():
            continue
        started = time.monotonic()
        samples, sample_rate = model.create(phonemes, voice=voice, is_phonemes=True)
        wav_path = STAGING / f"voice-preview-{voice}.wav.tmp"
        mp3_path = STAGING / f"voice-preview-{voice}.mp3"
        sf.write(wav_path, samples, sample_rate, format="WAV", subtype="PCM_16")
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
                        "-y", "-i", str(wav_path), "-codec:a", "libmp3lame", "-b:a", "96k",
                        str(mp3_path)], check=True)
        wav_path.unlink()
        print(f"{voice}: {len(samples)/sample_rate:.1f}s in {time.monotonic()-started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
