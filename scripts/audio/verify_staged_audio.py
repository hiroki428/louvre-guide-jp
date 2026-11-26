"""Check that the chosen Japanese voice covers every top-ranked audio asset.

Run before copying staged MP3 files into public/audio. Add --copy after review
to replace only the verified top-ranked assets.
"""

import argparse
import json
import shutil
from pathlib import Path

import soundfile as sf


ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "data" / "audio-staging"
PUBLIC_AUDIO = ROOT / "public" / "audio"
MANIFEST = ROOT / "data" / "audio-narration-manifest.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--voice", default="jf_nezumi")
    parser.add_argument("--model", default="kokoro-v1.0.fp16.onnx")
    parser.add_argument("--copy", action="store_true", help="Replace verified public MP3 assets")
    args = parser.parse_args()

    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))["entries"]
    selected = [entry for entry in entries if entry["source"]["kind"] == "workbook"
                and entry["source"]["rank"] <= args.top]
    reports = {}
    for path in sorted(STAGING.glob("generation-report*.json")):
        for item in json.loads(path.read_text(encoding="utf-8")):
            reports[item["filename"]] = item

    problems = []
    durations = []
    for entry in selected:
        name = entry["filename"]
        source = STAGING / name
        destination = PUBLIC_AUDIO / name
        record = reports.get(name, {})
        if record.get("voice") != args.voice:
            problems.append(f"{name}: voice is {record.get('voice')!r}")
        if record.get("model") != args.model:
            problems.append(f"{name}: model is {record.get('model')!r}")
        if record.get("sourceRank") != entry["source"]["rank"]:
            problems.append(f"{name}: source rank differs")
        if not source.is_file() or not destination.is_file():
            problems.append(f"{name}: missing staged or published file")
            continue
        try:
            info = sf.info(source)
        except RuntimeError as exc:
            problems.append(f"{name}: invalid MP3 ({exc})")
            continue
        if info.samplerate != 24000 or info.channels != 1 or info.duration < 5:
            problems.append(f"{name}: unexpected audio format or duration")
        if abs(info.duration - record.get("durationSeconds", 0)) > 1:
            problems.append(f"{name}: duration differs from generation report")
        durations.append(info.duration)

    print(f"Checked {len(selected)} MP3 files for {len(set(entry['id'] for entry in selected))} artworks.")
    if problems:
        raise SystemExit("Verification failed:\n" + "\n".join(problems))
    print(f"Japanese voice {args.voice}; durations {min(durations):.1f}–{max(durations):.1f} seconds.")
    if args.copy:
        for entry in selected:
            shutil.copy2(STAGING / entry["filename"], PUBLIC_AUDIO / entry["filename"])
        print(f"Copied {len(selected)} verified MP3 files to public/audio.")


if __name__ == "__main__":
    main()
