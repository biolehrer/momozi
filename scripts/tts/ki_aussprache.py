"""
KI-Aussprache mit Kokoro v1.1-zh (Apache 2.0) erzeugen – nur für Wörter ohne echte Aufnahme.

Die Lesung jedes Wortes wird aus unserem geprüften Pinyin fest vorgegeben
(pypinyin-Phrasenwörterbuch), damit z. B. 了 als „le“ und nicht als „liǎo“ gesprochen wird.
Tonsandhi (一/不, 3.+3. Ton) und Erhua berechnet Kokoros Frontend selbst.
Die Lautstärke wird an die echten Aufnahmen angeglichen, Stille am Rand gekürzt.

Wird von scripts/build-audio.mjs aufgerufen. Direkt:
  .venv-tts/bin/python scripts/tts/ki_aussprache.py --out public/audio --voice zf_001 [--format mp3|wav] < woerter.json
woerter.json: [{"s": "了", "n": "le5", "id": "4e86_le5.ki"}, ...]  (Datei = <id>.<format>)

Einrichtung (einmalig):
  uv venv .venv-tts --python 3.12
  VIRTUAL_ENV=.venv-tts uv pip install "kokoro>=0.9" "misaki[zh]>=0.9" soundfile lameenc
"""

import argparse
import json
import sys
from pathlib import Path

import jieba
import lameenc
import numpy as np
import soundfile as sf
from kokoro import KModel, KPipeline
from pypinyin import load_phrases_dict

REPO_ID = 'hexgrad/Kokoro-82M-v1.1-zh'
SAMPLE_RATE = 24000
TARGET_RMS = 0.11  # nach MP3 und Rand-Stille etwa so laut wie die echten Aufnahmen
PEAK_LIMIT = 0.95

MARKS = {'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì', 'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ'}


def numeric_to_marked(syl: str) -> str:
    """'hao3' -> 'hǎo', 'le5' -> 'le', 'r5' (Erhua) -> 'er'"""
    syl = syl.lower().replace('u:', 'ü').replace('v', 'ü')
    if syl in ('r', 'r5', 'r0'):
        return 'er'
    tone = int(syl[-1]) if syl[-1].isdigit() else 5
    base = syl[:-1] if syl[-1].isdigit() else syl
    if tone in (0, 5):
        return base
    if 'a' in base:
        i = base.index('a')
    elif 'e' in base:
        i = base.index('e')
    elif 'ou' in base:
        i = base.index('o')
    else:
        i = max(base.rfind(v) for v in 'iouü')
    if i < 0:
        return base
    return base[:i] + MARKS[base[i]][tone - 1] + base[i + 1:]


def tidy(audio: np.ndarray) -> np.ndarray:
    """Stille am Rand kürzen, Lautstärke angleichen, kurze Ränder ergänzen."""
    threshold = 0.02 * np.max(np.abs(audio))
    idx = np.where(np.abs(audio) > threshold)[0]
    if len(idx):
        margin = int(SAMPLE_RATE * 0.03)
        audio = audio[max(0, idx[0] - margin): idx[-1] + margin]
    rms = float(np.sqrt(np.mean(audio ** 2))) or 1.0
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio * min(TARGET_RMS / rms, PEAK_LIMIT / peak)
    pad = np.zeros(int(SAMPLE_RATE * 0.1), dtype=np.float32)
    return np.concatenate([pad, audio.astype(np.float32), pad])


def to_mp3(audio: np.ndarray) -> bytes:
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(SAMPLE_RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes()
    return enc.encode(pcm) + enc.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--voice', default='zf_001')
    ap.add_argument('--format', choices=['mp3', 'wav'], default='mp3')
    ap.add_argument('--speed', type=float, default=0.9)
    args = ap.parse_args()
    words = json.load(sys.stdin)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model = KModel(repo_id=REPO_ID).eval()
    pipeline = KPipeline(lang_code='z', repo_id=REPO_ID, model=model)

    # Lesungen fest vorgeben, Wörter als Ganzes segmentieren lassen.
    # Erst NACH dem Pipeline-Start: Kokoros Frontend lädt dabei ein eigenes großes
    # Phrasenwörterbuch, das sonst unsere Lesungen überschreibt (z. B. 大都 → dàdū, 倒车 → dàochē).
    for w in words:
        load_phrases_dict({w['s']: [[numeric_to_marked(s)] for s in w['n'].split()]})
        jieba.add_word(w['s'], freq=10_000_000)

    for w in words:
        chunks, phonemes = [], []
        for result in pipeline(w['s'] + '。', voice=args.voice, speed=args.speed):
            phonemes.append(result.phonemes)
            if result.audio is not None:
                chunks.append(result.audio.numpy())
        if not chunks:
            print(f"  ! {w['s']}: kein Audio", file=sys.stderr)
            continue
        audio = tidy(np.concatenate(chunks))
        target = out / f"{w['id']}.{args.format}"
        if args.format == 'mp3':
            target.write_bytes(to_mp3(audio))
        else:
            sf.write(target, audio, SAMPLE_RATE)
        print(f"  KI: {w['s']} [{w['n']}] -> {' '.join(phonemes)}", file=sys.stderr)


if __name__ == '__main__':
    main()
