#!/usr/bin/env python3
"""Generate multilingual Neural TTS MP3 audio guides for Louvre Audio Map.

Usage:
  uv run --with edge-tts python scripts/generate-multilang-audio.py --langs en,fr,zh,ko,es
  uv run --with edge-tts python scripts/generate-multilang-audio.py --langs en --ids mona
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
WORKS_PATH = ROOT / "src" / "works.json"
LOCALES_DIR = ROOT / "src" / "locales"
AUDIO_DIR = ROOT / "public" / "audio"

VOICE_CONFIG = {
    "en": {
        "voice": "en-US-JennyNeural",
        "rate": "-4%",
        "intro": "{title}, by {author}, {year}.",
        "long_guides": [
            "First, step back and take in the work as a whole. Notice where your eyes are naturally drawn, then let your gaze travel toward the finer details nearby.",
            "From a little distance, the overall balance of form and color becomes clear. As you move closer, pay attention to the subtle textures, brushwork, or carving that bring the surface to life.",
            "Now look back at the focal point with its historical context in mind. Think about what the artist wanted you to feel first—and what only reveals itself when you linger.",
            "Take a moment to compare it with neighboring works in the gallery. Even within the same era, artists approached light, movement, and stillness in remarkably different ways.",
            "Finally, recall your very first impression and notice how it has shifted. That quiet change in how you see is part of meeting the artwork in person here at the Louvre.",
        ],
    },
    "fr": {
        "voice": "fr-FR-DeniseNeural",
        "rate": "-4%",
        "intro": "{title}, par {author}, {year}.",
        "long_guides": [
            "Commencez par prendre un peu de recul pour embrasser l’œuvre dans son ensemble. Observez où votre regard se pose naturellement, puis laissez-le glisser vers les détails tout proches.",
            "À distance, l’équilibre des formes et des couleurs apparaît clairement. En vous rapprochant, remarquez les textures, la touche ou le modelé qui donnent vie à la matière.",
            "Revenez maintenant au cœur de la composition avec son histoire en tête. Demandez-vous ce que l’artiste a voulu mettre en lumière au premier regard, et ce qui ne se révèle qu’en prenant le temps.",
            "Prenez un instant pour comparer cette œuvre avec celles qui l’entourent dans la salle. Même à une époque proche, la lumière, le mouvement et le silence s’expriment de mille façons.",
            "Enfin, repensez à votre toute première impression et observez ce qui a changé. Ce dialogue discret avec l’œuvre fait toute la richesse d’une rencontre au Louvre.",
        ],
    },
    "zh": {
        "voice": "zh-CN-XiaoxiaoNeural",
        "rate": "-4%",
        "intro": "{title}，{author}，{year}。",
        "long_guides": [
            "请先退后一步欣赏作品的整体构图，留意视线最先被吸引的位置，再慢慢移向周围的细节。",
            "保持一定距离时，形体与色彩的整体呼应会格外清晰；走近细看，则能感受到笔触、肌理或雕刻所传达的生命力。",
            "带着刚才了解的历史背景，再次凝视画面的核心。不妨体会一下，艺术家最想强调的情感是什么，又藏着哪些细看才会发现的巧思。",
            "也可以环顾展厅中邻近的作品加以对照。即便处于同一时代，不同创作者对光线、动势与静谧的处理依然各具风貌。",
            "最后，回想一下您最初看到它时的第一印象，看看此刻的感受发生了怎样的变化。这种静静生长的共鸣，正是亲临卢浮宫赏画的魅力所在。",
        ],
    },
    "ko": {
        "voice": "ko-KR-SunHiNeural",
        "rate": "-4%",
        "intro": "{title}, {author}, {year}.",
        "long_guides": [
            "먼저 한 걸음 물러서서 작품 전체를 바라보며 시선이 자연스럽게 머무는 곳을 찾아보세요. 그다음 주변의 섬세한 디테일로 천천히 시선을 옮겨 보시기 바랍니다.",
            "조금 떨어져 보면 형태와 색채의 전체적인 균형이 또렷하게 드러납니다. 가까이 다가가면 표면의 질감과 붓질, 혹은 조각의 생동감이 한층 깊이 느껴집니다.",
            "이제 작품의 배경을 떠올리며 다시 중심부를 바라보세요. 작가가 첫눈에 전하고자 했던 감정과 오래 머물러야 보이는 장치들을 천천히 음미해 보시기 바랍니다.",
            "같은 전시실에 놓인 주변 작품들과도 비교해 보세요. 비슷한 시대의 작품이라도 빛과 움직임, 고요함을 다루는 방식은 놀라울 만큼 다릅니다.",
            "마지막으로 작품을 처음 마주했을 때의 첫인상을 떠올려 보세요. 가까이에서 오래 바라보며 달라진 감각 자체가 루브르에서 이 작품을 만나는 특별한 경험입니다.",
        ],
    },
    "es": {
        "voice": "es-ES-ElviraNeural",
        "rate": "-4%",
        "intro": "{title}, de {author}, {year}.",
        "long_guides": [
            "Primero, da un paso atrás para contemplar la obra en su conjunto. Fíjate en el punto hacia donde se dirige tu mirada de forma natural y deja que luego recorra los detalles cercanos.",
            "A cierta distancia, el equilibrio general de formas y colores se vuelve evidente. Al acercarte, observa las texturas, la pincelada o el tallado que dan vida a la superficie.",
            "Ahora vuelve al centro de la composición teniendo presente su contexto histórico. Piensa qué quiso transmitir el artista al primer vistazo y qué solo se revela cuando te detienes con calma.",
            "Tómate un momento para compararla con las obras vecinas de la sala. Incluso dentro de una misma época, la luz, el movimiento y la quietud se expresan de maneras muy distintas.",
            "Por último, recuerda tu primera impresión y observa cómo ha cambiado. Esa transformación silenciosa de la mirada forma parte del encuentro real con la obra aquí en el Louvre.",
        ],
    },
}


def is_valid_mp3(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 1500:
        return False
    with path.open("rb") as f:
        header = f.read(3)
    if len(header) < 3:
        return False
    is_id3 = header == b"ID3"
    is_mpeg_sync = header[0] == 0xFF and (header[1] & 0xE0) == 0xE0
    return is_id3 or is_mpeg_sync


def build_script(lang: str, entry: dict, length: int) -> str:
    cfg = VOICE_CONFIG[lang]
    intro = cfg["intro"].format(
        title=entry["title"].strip(),
        author=entry["author"].strip(),
        year=entry["year"].strip(),
    )
    base = f"{intro} {entry['background'].strip()} {entry['look'].strip()}"
    if length <= 60:
        return base
    extra = " ".join(cfg["long_guides"])
    return f"{base} {extra}"


def transcode_to_cbr32(raw_path: Path, out_path: Path) -> None:
    tmp_out = out_path.with_suffix(".tmp.mp3")
    cmd = [
        "ffmpeg",
        "-y",
        "-loglevel",
        "error",
        "-i",
        str(raw_path),
        "-ac",
        "1",
        "-ar",
        "24000",
        "-b:a",
        "32k",
        "-codec:a",
        "libmp3lame",
        "-write_xing",
        "0",
        str(tmp_out),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        if tmp_out.exists():
            tmp_out.unlink()
        raise RuntimeError(f"ffmpeg failed for {out_path.name}: {res.stderr.strip()}")
    if not is_valid_mp3(tmp_out):
        tmp_out.unlink(missing_ok=True)
        raise RuntimeError(f"Invalid transcoded MP3: {out_path.name}")
    os.replace(tmp_out, out_path)


async def generate_one(
    sem: asyncio.Semaphore,
    lang: str,
    work_id: str,
    length: int,
    text: str,
    out_path: Path,
    retries: int = 5,
) -> tuple[str, int]:
    cfg = VOICE_CONFIG[lang]
    async with sem:
        last_err: Exception | None = None
        for attempt in range(1, retries + 1):
            raw_fd, raw_name = tempfile.mkstemp(prefix=f"{lang}-{work_id}-{length}-", suffix=".mp3")
            os.close(raw_fd)
            raw_path = Path(raw_name)
            try:
                communicate = edge_tts.Communicate(text, voice=cfg["voice"], rate=cfg["rate"])
                await communicate.save(str(raw_path))
                if not is_valid_mp3(raw_path):
                    raise RuntimeError("edge-tts produced empty/invalid mp3")
                await asyncio.to_thread(transcode_to_cbr32, raw_path, out_path)
                return f"{lang}/{work_id}-{length}.mp3", out_path.stat().st_size
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                if attempt < retries:
                    await asyncio.sleep(min(2.0 * attempt, 10.0))
            finally:
                raw_path.unlink(missing_ok=True)
        raise RuntimeError(f"Failed {lang}/{work_id}-{length}.mp3 after {retries} attempts: {last_err}")


async def run_generation(
    langs: list[str],
    filter_ids: set[str] | None,
    limit: int | None,
    concurrency: int,
    force: bool,
) -> None:
    works = json.loads(WORKS_PATH.read_text(encoding="utf-8"))
    tasks_spec: list[tuple[str, str, int, str, Path]] = []

    for lang in langs:
        if lang not in VOICE_CONFIG:
            raise ValueError(f"Unsupported language: {lang}")
        locale_path = LOCALES_DIR / f"works.{lang}.json"
        locale_data = json.loads(locale_path.read_text(encoding="utf-8"))
        out_dir = AUDIO_DIR / lang
        out_dir.mkdir(parents=True, exist_ok=True)

        count_for_lang = 0
        for work in works:
            wid = work["id"]
            if filter_ids and wid not in filter_ids:
                continue
            lengths = work.get("audioLengths") or [60]
            entry = locale_data[wid]
            for length in lengths:
                out_path = out_dir / f"{wid}-{length}.mp3"
                if not force and is_valid_mp3(out_path):
                    continue
                script = build_script(lang, entry, int(length))
                tasks_spec.append((lang, wid, int(length), script, out_path))
                count_for_lang += 1
                if limit and count_for_lang >= limit:
                    break
            if limit and count_for_lang >= limit:
                break

    total = len(tasks_spec)
    if total == 0:
        print("All requested tracks already exist and are valid.")
        return

    print(f"Generating {total} audio tracks across {langs} (concurrency={concurrency})...", flush=True)
    started = time.monotonic()
    sem = asyncio.Semaphore(concurrency)
    done = 0
    total_bytes = 0
    failures: list[str] = []

    async def runner(spec: tuple[str, str, int, str, Path]) -> None:
        nonlocal done, total_bytes
        lang, wid, length, script, out_path = spec
        try:
            label, size = await generate_one(sem, lang, wid, length, script, out_path)
            done += 1
            total_bytes += size
            if done == total or done % 25 == 0 or total <= 20:
                elapsed = time.monotonic() - started
                rate = done / elapsed if elapsed > 0 else 0
                eta = (total - done) / rate if rate > 0 else 0
                print(
                    f"[{done}/{total}] {label} ({size // 1024} KB) | "
                    f"{total_bytes / (1024 * 1024):.1f} MB | {elapsed:.0f}s elapsed, ~{eta:.0f}s left",
                    flush=True,
                )
        except Exception as exc:  # noqa: BLE001
            failures.append(str(exc))
            print(f"ERROR: {exc}", file=sys.stderr, flush=True)

    await asyncio.gather(*(runner(spec) for spec in tasks_spec))
    elapsed = time.monotonic() - started
    print(
        f"Finished {done}/{total} tracks ({total_bytes / (1024 * 1024):.2f} MB) in {elapsed:.1f}s. "
        f"Failures: {len(failures)}",
        flush=True,
    )
    if failures:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate multilingual Louvre audio guides")
    parser.add_argument("--langs", default="en,fr,zh,ko,es", help="Comma-separated language codes")
    parser.add_argument("--ids", default="", help="Optional comma-separated work IDs to generate")
    parser.add_argument("--limit", type=int, default=0, help="Optional max tracks per language")
    parser.add_argument("--concurrency", type=int, default=6, help="Concurrent TTS requests")
    parser.add_argument("--force", action="store_true", help="Regenerate even if output exists")
    args = parser.parse_args()

    langs = [x.strip() for x in args.langs.split(",") if x.strip()]
    filter_ids = {x.strip() for x in args.ids.split(",") if x.strip()} or None
    limit = args.limit if args.limit > 0 else None
    asyncio.run(run_generation(langs, filter_ids, limit, args.concurrency, args.force))


if __name__ == "__main__":
    main()
