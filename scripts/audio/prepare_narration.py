"""Match workbook narration drafts to the app's audio asset names.

Run: python scripts/audio/prepare_narration.py
This only writes a reviewable JSON manifest; it never changes published audio.
"""

import argparse
import json
import unicodedata
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[2]
WORKBOOK = ROOT / "data" / "louvre_audio_top200.xlsx"
WORKS = ROOT / "src" / "works.json"
MANIFEST = ROOT / "data" / "audio-narration-manifest.json"
SCRIPT_COLUMNS = {40: 15, 60: 16, 120: 17}  # zero-based: 30 sec, 1 min, 2 min


def normalized_title(value):
    return "".join(unicodedata.normalize("NFKC", str(value or "")).split())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=20, help="Highest workbook rank to include")
    args = parser.parse_args()
    if args.top < 1:
        parser.error("--top must be positive")
    sheet = load_workbook(WORKBOOK, read_only=True, data_only=True).worksheets[0]
    source_rows = [row for row in sheet.iter_rows(min_row=6, values_only=True) if isinstance(row[0], int)]
    by_title = {}
    for row in source_rows:
        key = normalized_title(row[2])
        if key in by_title:
            raise ValueError(f"Duplicate workbook title: {row[2]}")
        by_title[key] = row

    works = json.loads(WORKS.read_text(encoding="utf-8"))
    entries = []
    used_ranks = set()
    for work in works:
        row = by_title.get(normalized_title(work["title"]))
        if not row or row[0] > args.top:
            continue
        used_ranks.add(row[0])
        for seconds in work.get("audioLengths", [60]):
            if seconds not in SCRIPT_COLUMNS:
                raise ValueError(f"Unsupported audio length: {work['id']} {seconds}")
            script = row[SCRIPT_COLUMNS[seconds]]
            source = {"kind": "workbook", "rank": row[0], "column": {40: "30秒原稿", 60: "1分原稿", 120: "2分原稿"}[seconds]}
            if not isinstance(script, str) or not script.strip():
                raise ValueError(f"Empty script: {work['id']} {seconds}")
            entries.append({"id": work["id"], "title": work["title"], "secondsLabel": seconds,
                            "filename": f"{work['id']}-{seconds}.mp3", "source": source,
                            "text": script.strip()})

    unmatched = [{"rank": row[0], "title": row[2]} for row in source_rows
                 if row[0] <= args.top and row[0] not in used_ranks]
    result = {"workbook": WORKBOOK.name, "entries": entries, "unmatchedWorkbookRows": unmatched}
    MANIFEST.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(entries)} narrations for {len(works)} works; unmatched workbook rows: {unmatched}")


if __name__ == "__main__":
    main()
