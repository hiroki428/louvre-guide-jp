"""Stage top-ranked Japanese guides with the Apache-2.0 Kokoro voice model.

Requires kokoro-onnx, misaki[ja] or compatible phonemizer, soundfile,
imageio-ffmpeg, and the Kokoro v1.0 ONNX model and voices file.
The published public/audio directory is never modified by this script.
"""

import argparse
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro
from misaki import ja


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "data" / "audio-narration-manifest.json"
STAGING = ROOT / "data" / "audio-staging"
MODEL_DIR = Path(os.environ.get("KOKORO_MODEL_DIR", Path(tempfile.gettempdir()) / "louvre-kokoro-model"))


def chunks(text, limit=85):
    sentences = re.split(r"(?<=[。！？])\s*", text.strip())
    current = ""
    for sentence in sentences:
        if len(current) + len(sentence) > limit and current:
            yield current
            current = ""
        current += sentence
    if current:
        yield current


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--id", help="Generate one artwork's available lengths")
    group.add_argument("--top", type=int, metavar="N", help="Generate the top N workbook artworks")
    parser.add_argument("--rank-min", type=int, default=1, help="Lowest workbook rank to include")
    parser.add_argument("--rank-max", type=int, help="Highest workbook rank to include")
    parser.add_argument("--report-name", default="generation-report.json", help="Staging report filename")
    parser.add_argument("--length", type=int, choices=(60, 120), help="Generate one length")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--voice", default="jf_alpha", help="Kokoro Japanese voice ID")
    parser.add_argument("--model", default="kokoro-v1.0.fp16.onnx", help="ONNX model filename")
    parser.add_argument("--replace-staged", action="store_true")
    args = parser.parse_args()
    if args.top is not None and args.top < 1:
        parser.error("--top must be positive")
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))["entries"]
    selected = [entry for entry in entries if entry["id"] == args.id or
                (args.top is not None and entry["source"]["kind"] == "workbook"
                 and args.rank_min <= entry["source"]["rank"] <= min(args.top, args.rank_max or args.top))]
    if args.length is not None:
        selected = [entry for entry in selected if entry["secondsLabel"] == args.length]
    if not selected:
        parser.error("No matching narration")
    report_path = STAGING / args.report_name
    if report_path.parent != STAGING:
        parser.error("--report-name must be a filename")
    existing_report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else []
    report = {item["filename"]: item for item in existing_report}
    pending = [entry for entry in selected if args.replace_staged
               or not (STAGING / entry["filename"]).exists()
               or report.get(entry["filename"], {}).get("voice") != args.voice
               or report.get(entry["filename"], {}).get("model") != args.model
               or report.get(entry["filename"], {}).get("speed") != args.speed]
    print(f"Selected {len(selected)} files; generating {len(pending)}.", flush=True)
    if not pending:
        return

    model_path = MODEL_DIR / args.model
    voices_path = MODEL_DIR / "voices-v1.0.bin"
    if not model_path.exists() or not voices_path.exists():
        parser.error(f"Kokoro model files missing in {MODEL_DIR}")
    options = ort.SessionOptions()
    options.log_severity_level = 3
    session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
    model = Kokoro.from_session(session, str(voices_path))
    if args.voice not in model.get_voices():
        parser.error(f"Unknown voice: {args.voice}")
    japanese_g2p = ja.JAG2P()
    STAGING.mkdir(parents=True, exist_ok=True)
    for index, entry in enumerate(pending, 1):
        rank = entry["source"].get("rank")
        if rank is None or not entry.get("text"):
            raise ValueError(f"No local narration draft for {entry['filename']}")
        script = entry["text"]
        started = time.monotonic()
        segments = []
        sample_rate = None
        for part in chunks(script):
            phonemes, _ = japanese_g2p(part)
            samples, sample_rate = model.create(phonemes, voice=args.voice, speed=args.speed, is_phonemes=True)
            segments.append(samples)
            segments.append(np.zeros(int(sample_rate * 0.28), dtype=np.float32))
        audio = np.concatenate(segments[:-1])
        duration = len(audio) / sample_rate
        wav_path = STAGING / f"{entry['id']}-{entry['secondsLabel']}.wav.tmp"
        mp3_path = STAGING / entry["filename"]
        temp_mp3 = STAGING / f"{entry['filename']}.tmp"
        sf.write(wav_path, audio, sample_rate, format="WAV", subtype="PCM_16")
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error",
                        "-y", "-i", str(wav_path), "-codec:a", "libmp3lame",
                        "-b:a", "96k", "-f", "mp3", str(temp_mp3)], check=True)
        temp_mp3.replace(mp3_path)
        wav_path.unlink()
        report[entry["filename"]] = {"filename": entry["filename"], "sourceRank": rank,
                                     "sourceColumn": entry["source"].get("column"),
                                     "durationSeconds": round(duration, 1), "speed": args.speed,
                                     "voice": args.voice, "model": args.model}
        temp_report = STAGING / (args.report_name + ".tmp")
        temp_report.write_text(json.dumps(list(report.values()), ensure_ascii=False, indent=2), encoding="utf-8")
        temp_report.replace(report_path)
        print(f"[{index}/{len(pending)}] {mp3_path.name}: {duration:.1f}s in {time.monotonic()-started:.1f}s", flush=True)


if __name__ == "__main__":
    main()
