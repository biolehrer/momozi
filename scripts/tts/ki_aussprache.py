"""
KI-Aussprache mit Kokoro v1.1-zh (Apache 2.0) erzeugen – nur für Wörter ohne echte Aufnahme.

Aussprache: wird direkt aus unserem geprüften Pinyin in Kokoros Lautschrift übersetzt. Kokoros eigene
Textverarbeitung bleibt außen vor – sie rät Lesungen und setzt nach festen Regeln neutrale Töne
(父子 fùzǐ würde zu fùzi, 酒吧 jiǔbā zu jiǔba). Ergänzt wird nur der 3.-Ton-Sandhi (你好 → ní hǎo),
so wie man es spricht; 一/不 stehen schon so in unseren Daten, wie sie gesprochen werden.

Wortanfang: Ein einzeln erzeugtes Wort beginnt bei Kokoro mit einem stimmhaften Vorlaut, der z. B.
„sh“ wie „r“ klingen lässt. Deshalb wird das Wort mit einem kurzen Anlauf erzeugt und genau an der
Grenze zum Wort geschnitten. Die Grenze liefert Kokoro selbst (Dauer je Laut, 25 ms je Schritt). Bei stimmlosem
Anlaut wird genau am Beginn des Reibelauts geschnitten, bei b/p/d/t/g/k im Verschluss vor der Lösung (sonst klingt der
Anlauf noch nach), Wörter ohne Anlaut (Vokal, w, y, er) werden weich eingeblendet.

Die Lautstärke wird an die echten Aufnahmen angeglichen.

Wird von scripts/build-audio.mjs aufgerufen. Direkt:
  .venv-tts/bin/python scripts/tts/ki_aussprache.py --out public/audio --voice zf_001 [--format mp3|wav] < woerter.json
woerter.json: [{"s": "了", "n": "le5", "id": "4e86_le5.ki"}, ...]  (Datei = <id>.<format>)

Einrichtung (einmalig):
  uv venv .venv-tts --python 3.12
  VIRTUAL_ENV=.venv-tts uv pip install "kokoro>=0.9" "misaki[zh]>=0.9" soundfile lameenc
"""

import argparse
import json
import os
import sys
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')

# Liegt das Modell schon im Zwischenspeicher, ohne Netzabfrage laden (sonst hängt der Start bei Netzproblemen)
_HF_HUB = Path(os.environ.get('HF_HOME', Path.home() / '.cache' / 'huggingface')) / 'hub'
if (_HF_HUB / 'models--hexgrad--Kokoro-82M-v1.1-zh').exists():
    os.environ.setdefault('HF_HUB_OFFLINE', '1')

import lameenc  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from kokoro import KModel, KPipeline  # noqa: E402
from misaki.zh_frontend import ZH_MAP  # noqa: E402
from pypinyin.contrib.tone_convert import to_finals_tone3, to_initials  # noqa: E402

REPO_ID = 'hexgrad/Kokoro-82M-v1.1-zh'
SAMPLE_RATE = 24000
SAMPLES_PER_STEP = 600  # Kokoro: ein Dauer-Schritt = 600 Abtastwerte bei 24 kHz
OFFSET_STEPS = 3  # der Ton liegt 3 Schritte früher als die Summe der Dauern (wie in KPipeline.join_timestamps)
TARGET_RMS = 0.11  # nach MP3 und Rand-Stille etwa so laut wie die echten Aufnahmen
PEAK_LIMIT = 0.95
# Anlauf vor dem Wort (wird abgeschnitten). Gemessen an 76 Problemwörtern (Spracherkennung, Vorlaut):
# Komma 64–66 % erkannt, „…“ 55 %, ohne Anlauf 50 %; das alte Verfahren (ganzer Satz „Wort。“) 0 %.
LEAD = ','
TAIL = '.'  # Satzende, damit das Wort natürlich ausklingt
PRE_MS = 10  # so viel vor der Wortgrenze bleibt stehen
POST_MS = 140  # Ausklang nach dem letzten Laut


def syllable_phones(syl: str) -> list:
    """'zhong1' -> ['zh', 'ong', '1'], 'shi4' -> ['sh', 'iii', '4'], 'ng4' -> ['n', '4']"""
    s = syl.lower().replace('ü', 'v').replace('u:', 'v')
    tone = s[-1] if s[-1].isdigit() else '5'
    tone = '5' if tone == '0' else tone
    base = s[:-1] if s[-1].isdigit() else s
    if base in ('ng', 'n', 'm', 'hm', 'hng'):  # silbischer Nasal (嗯): Kokoro kennt dafür nur n
        return ['n', tone]
    ini = to_initials(base + tone, strict=True)
    fin = to_finals_tone3(base + tone, strict=True, neutral_tone_with_five=True)[:-1]
    if fin == 'i' and ini in ('z', 'c', 's'):
        fin = 'ii'
    elif fin == 'i' and ini in ('zh', 'ch', 'sh', 'r'):
        fin = 'iii'
    return ([ini] if ini else []) + [fin, tone]


def pinyin_to_phonemes(numeric: str) -> str:
    """Zahlen-Pinyin eines Wortes -> Kokoro-Lautschrift, mit 3.-Ton-Sandhi und Erhua."""
    syls = numeric.split()
    tones = [s[-1] if s[-1].isdigit() else '5' for s in syls]
    real = [i for i, s in enumerate(syls) if s.lower().rstrip('012345') != 'r']
    # 3.-Ton-Sandhi: 3 vor 3 wird 2 (你好 ní hǎo, 展览馆 zhǎnlǎnguǎn -> zhán lán guǎn)
    for a, b in zip(real, real[1:]):
        if tones[a] == '3' and tones[b] == '3':
            tones[a] = '2'
    out = []
    for i, syl in enumerate(syls):
        if i not in real:  # Erhua-„r“: an die vorige Silbe vor den Ton
            # Kokoros eigene Textverarbeitung (misaki) schreibt „e“ + r als „er“ (这儿 → ㄓㄦ). Im Vergleich mit je
            # 24 Varianten erkannte die Spracherkennung 这儿 mit ㄓㄜR aber deutlich öfter (9 statt 1), deshalb hier
            # immer R vor dem Ton.
            if out:
                out[-1] = out[-1][:-1] + ['R', out[-1][-1]]
            continue
        p = syllable_phones(syl)
        p[-1] = tones[i]
        out.append(p)
    phones = [p for syl in out for p in syl]
    missing = [p for p in phones if p not in ZH_MAP]
    if missing:
        raise ValueError(f'unbekannte Laute {missing} in {numeric}')
    return ''.join(ZH_MAP[p] for p in phones)


VOICELESS = set('ㄈㄙㄕㄒㄘㄔㄑㄗㄓㄐㄏ')  # f s sh x c ch q z zh j h
INITIALS = set('ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙ')
# Wörter mit Vokal-, w-, y- oder er-Anfang weich einblenden: Ein harter Einsatz am Schnitt klingt wie „g“ oder „h“
# davor (晚点 → 观点). Gemessen an 97 solchen Wörtern: 80 % statt 76 % erkannt, seltener eine Extrasilbe vorne.
SOFT_ONSET_MS = 25


def frication_onset(audio: np.ndarray, guess: int) -> int:
    """Beginn des Reibelauts nahe der berechneten Grenze (±40 ms): erstes 5-ms-Stück mit anhaltend vielen
    Nulldurchgängen. Davor liegt noch Stimme vom Anlauf, die z. B. „sh“ wie „r“ klingen ließe."""
    step = SAMPLE_RATE // 200
    lo = max(0, guess - 8 * step)
    hi = min(len(audio) - 4 * step, guess + 8 * step)
    zcr = lambda i: float(np.mean(np.abs(np.diff(np.sign(audio[i: i + step]))))) / 2
    for i in range(lo, hi, step):
        if zcr(i) >= 0.12 and all(zcr(i + k * step) >= 0.1 for k in (1, 2, 3)):
            return i
    return guess


STOPS = set('ㄅㄆㄉㄊㄍㄎ')  # b p d t g k


def closure_onset(audio: np.ndarray, guess: int) -> int:
    """Verschluss vor b/p/d/t/g/k ab der berechneten Grenze: Dort klingt oft noch 20–75 ms lang stimmhaft der Anlauf
    nach (wie ein leises „m“ vor b – bei 135 von 143 KI-Wörtern mit b/d/g gemessen). Geschnitten wird im leisesten
    5-ms-Stück vor der Lösung, aber nur, wenn davor stimmhaftes, abklingendes Signal liegt (die Lösung bleibt also)."""
    step = SAMPLE_RATE // 200
    lo = max(0, guess)
    frames = [audio[i: i + step] for i in range(lo, min(len(audio) - step, lo + 24 * step), step)]
    db = [20 * np.log10(float(np.sqrt(np.mean(x ** 2))) + 1e-9) for x in frames]
    zcr = [float(np.mean(np.abs(np.diff(np.sign(x))))) / 2 for x in frames]
    k0 = next((k for k, d in enumerate(db) if d > -45), None)
    if k0 is None:
        return guess
    m = k0
    for k in range(k0 + 1, len(db)):
        if db[k] < db[m]:
            m = k
        elif db[k] > db[m] + 15:  # Lösung bzw. Vokal: das leiseste Stück davor ist der Verschluss
            break
    voiced = m > k0 and max(zcr[k0:m]) < 0.12
    return lo + m * step if voiced and db[k0] - db[m] >= 12 else guess


def synthesize(model, pack, ps: str, speed: float):
    """Wort mit Anlauf erzeugen und an den von Kokoro gelieferten Lautgrenzen schneiden."""
    full = LEAD + ps + TAIL
    out = model(full, pack[len(full) - 1], speed, return_output=True)
    audio = out.audio.numpy()
    dur = out.pred_dur.numpy()
    if len(dur) != len(full) + 2:  # Start- und End-Token
        raise ValueError(f'Lautschrift nicht vollständig im Vokabular: {full}')
    # Kokoro erzeugt vor dem ersten Laut einen stimmhaften Vorlaut; geschnitten wird genau am Wortanfang
    start = SAMPLES_PER_STEP * (int(dur[: 1 + len(LEAD)].sum()) - OFFSET_STEPS)
    end = SAMPLES_PER_STEP * (int(dur[: 1 + len(LEAD) + len(ps)].sum()) - OFFSET_STEPS)
    if ps[0] in VOICELESS:
        a = max(0, frication_onset(audio, start) - SAMPLE_RATE // 500)  # 2 ms Luft
    else:
        a = max(0, start - int(SAMPLE_RATE * PRE_MS / 1000))
        if ps[0] in STOPS:
            a = closure_onset(audio, a)
    b = min(len(audio), end + int(SAMPLE_RATE * POST_MS / 1000))
    seg = audio[a:b].copy()
    if ps[0] not in INITIALS:  # kein Anlaut: weich einsetzen wie gesprochen
        n = min(len(seg), int(SAMPLE_RATE * SOFT_ONSET_MS / 1000))
        seg[:n] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))
    return seg


def tidy(audio: np.ndarray) -> np.ndarray:
    """Lautstärke angleichen, Ende sanft ausblenden, kurze stille Ränder ergänzen."""
    rms = float(np.sqrt(np.mean(audio ** 2))) or 1.0
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio * min(TARGET_RMS / rms, PEAK_LIMIT / peak)
    fade = min(len(audio), int(SAMPLE_RATE * 0.04))
    audio[-fade:] *= np.linspace(1, 0, fade)
    fade_in = min(len(audio), int(SAMPLE_RATE * 0.004))  # kein Knacken am Schnitt
    audio[:fade_in] *= np.linspace(0, 1, fade_in)
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
    ap.add_argument('--lead', default=LEAD, help='Anlauf vor dem Wort (zum Ausprobieren)')
    args = ap.parse_args()
    globals()['LEAD'] = args.lead
    words = json.load(sys.stdin)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model = KModel(repo_id=REPO_ID).eval()
    pack = KPipeline(lang_code='z', repo_id=REPO_ID, model=model).load_voice(args.voice)

    for w in words:
        try:
            ps = pinyin_to_phonemes(w['n'])
            audio = tidy(synthesize(model, pack, ps, args.speed))
        except Exception as e:  # einzelnes Wort überspringen, Rest weiter erzeugen
            print(f"  ! {w['s']} [{w['n']}]: {e}", file=sys.stderr)
            continue
        target = out / f"{w['id']}.{args.format}"
        if args.format == 'mp3':
            target.write_bytes(to_mp3(audio))
        else:
            sf.write(target, audio, SAMPLE_RATE)
        print(f"  KI: {w['s']} [{w['n']}] -> {ps}", file=sys.stderr)


if __name__ == '__main__':
    main()
