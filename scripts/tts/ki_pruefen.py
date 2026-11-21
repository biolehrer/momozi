"""
KI-Aussprache automatisch prüfen (nach dem Erzeugen mit ki_aussprache.py):
  1. stimmhafter Vorlaut vor Wörtern mit stimmlosem Anlaut (sh, s, x, f …) – sollte es nicht geben
  2. Spracherkennung (Whisper large-v3-turbo): Hört sie das Wort bzw. dieselbe Lesung – und auch den Ton?

Aufruf:
  .venv-tts/bin/python scripts/tts/ki_pruefen.py --alle [--out bericht.jsonl]
      alle KI-Dateien laut public/data/audio.json
  .venv-tts/bin/python scripts/tts/ki_pruefen.py --liste dateien.json
      [{"s": "超市", "n": "chao1 shi4", "f": "/pfad/datei.wav", "src": "ai"}, ...]
  --nachbessern: KI-Wörter, die die Erkennung nicht genau so (Wort oder Silben samt Ton) hört, und solche mit Vorlaut in
      Varianten neu erzeugen (Anlauf, Tempo, notfalls andere Stimmen) und die beste behalten (echte Aufnahmen bleiben unberührt)

Einrichtung zusätzlich zu ki_aussprache.py (Whisper lädt beim ersten Lauf ca. 1,6 GB):
  VIRTUAL_ENV=.venv-tts uv pip install transformers torch pypinyin
"""

import argparse
import io
import json
import os
import re
import sys
import warnings
from pathlib import Path

warnings.filterwarnings('ignore')

# Liegt das Modell schon im Zwischenspeicher, ohne Netzabfrage laden (sonst hängt der Start bei Netzproblemen)
_HF_HUB = Path(os.environ.get('HF_HOME', Path.home() / '.cache' / 'huggingface')) / 'hub'
if (_HF_HUB / 'models--openai--whisper-large-v3-turbo').exists():
    os.environ.setdefault('HF_HUB_OFFLINE', '1')

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
from pypinyin import Style, pinyin  # noqa: E402
from transformers import WhisperForConditionalGeneration, WhisperProcessor  # noqa: E402
from transformers.modeling_outputs import BaseModelOutput  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MODEL = 'openai/whisper-large-v3-turbo'
VOICELESS = ('zh', 'ch', 'sh', 'f', 'j', 'q', 'x', 'z', 'c', 's')


def load_16k(path):
    x, sr = sf.read(path, dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    if sr != 16000:
        n, m = len(x), int(round(len(x) * 16000 / sr))
        X = np.fft.rfft(x)
        Y = np.zeros(m // 2 + 1, dtype=X.dtype)
        k = min(len(X), len(Y))
        Y[:k] = X[:k]
        x = np.fft.irfft(Y, n=m).astype(np.float32) * (m / n)
    return x


def prevoice_ms(x, sr=16000):
    """Dauer stimmhafter Laute vor dem ersten Reibe- oder Zischlaut (ms). Echte Aufnahmen: fast immer 0.
    Als Reibelaut zählen mindestens 20 ms anhaltendes Rauschen, auch leises wie bei f (30–40 dB unter dem
    Spitzenpegel); ein einzelnes Rausch-Fenster am Einsatz (MP3-Vorecho, Schnitt) zählt nicht."""
    n = int(0.01 * sr)
    peak = np.max(np.abs(x)) + 1e-9
    frames = []
    for i in range(0, len(x) - n, n):
        fr = x[i: i + n]
        frames.append((20 * np.log10(np.sqrt(np.mean(fr ** 2)) / peak + 1e-9), np.mean(np.abs(np.diff(np.sign(fr)))) / 2))
    noise = lambda k: k < len(frames) and frames[k][1] > 0.15 and frames[k][0] > -50
    voiced = 0
    for k, (db, zcr) in enumerate(frames):
        if noise(k) and noise(k + 1):
            break
        if db > -32 and zcr < 0.1:
            voiced += 10
        if voiced > 300:
            break
    return voiced


def expected_syllables(n):
    return [re.sub(r'[0-5]$', '', s).lower().replace('v', 'u').replace('ü', 'u') for s in n.split() if re.sub(r'[0-5]$', '', s).lower() != 'r']


# Zahlen schreibt die Erkennung oft als Ziffern (七 → „7.“, 三 → „3“): wie das Zahlwort lesen
DIGITS = str.maketrans('0123456789', '零一二三四五六七八九')


def heard_hanzi(text):
    return re.findall(r'[㐀-鿿]', text.replace('10', '十').translate(DIGITS))


def expected_tones(n):
    """Töne passend zu expected_syllables (0 = neutral)"""
    return [int(s[-1]) % 5 if s[-1].isdigit() else 0 for s in n.split() if re.sub(r'[0-5]$', '', s).lower() != 'r']


def heard_tones(s, n, text):
    """Hört die Erkennung die Silben auch mit den vorgegebenen Tönen? Verglichen werden die Lesungen der erkannten Zeichen
    samt Ton; neutraler Ton und der 3.-Ton-Sandhi (3+3 wird 2+3 gesprochen) zählen als gleich."""
    exp, tones = expected_syllables(n), expected_tones(n)
    han = heard_hanzi(text)
    if han and han[-1] == '儿' and len(han) > len(exp):
        han = han[:-1]
    if ''.join(han) in (s, s.replace('儿', '')):
        return True
    if len(han) != len(exp):
        return False
    for i, (c, e, t) in enumerate(zip(han, exp, tones)):
        ok = False
        for p in pinyin(c, style=Style.TONE3, heteronym=True, neutral_tone_with_five=True)[0]:
            th = int(p[-1]) % 5 if p[-1].isdigit() else 0
            sandhi = t == 3 and th == 2 and i + 1 < len(tones) and tones[i + 1] == 3
            if re.sub(r'[0-5]$', '', p).replace('ü', 'u').replace('v', 'u') == e and (th == t or 0 in (th, t) or sandhi):
                ok = True
        if not ok:
            return False
    return True


def classify(s, n, text):
    exp = expected_syllables(n)
    han = heard_hanzi(text)
    if han and han[-1] == '儿' and len(han) > len(exp):
        han = han[:-1]
    rd = [{x.replace('ü', 'u').replace('v', 'u') for x in pinyin(c, style=Style.NORMAL, heteronym=True)[0]} for c in han]
    if ''.join(han) in (s, s.replace('儿', '')):
        return 'gleich'
    match = lambda r: len(r) == len(exp) and all(e in x for e, x in zip(exp, r))
    if match(rd):
        return 'gleiche_lesung'
    if len(rd) == len(exp) + 1 and match(rd[1:]):
        return 'extra_vorne'
    if rd and exp:
        hits = max(sum(e in x for e, x in zip(exp, rd)), sum(e in x for e, x in zip(exp, rd[1:])))
        if hits / len(exp) >= 0.5:
            return 'teilweise'
    return 'kein_hanzi' if not han else 'anders'


def resample_16k(x, sr):
    if sr == 16000:
        return x.astype(np.float32)
    n, m = len(x), int(round(len(x) * 16000 / sr))
    X = np.fft.rfft(x)
    Y = np.zeros(m // 2 + 1, dtype=X.dtype)
    k = min(len(X), len(Y))
    Y[:k] = X[:k]
    return (np.fft.irfft(Y, n=m) * (m / n)).astype(np.float32)


# weitere Stimmen von Kokoro v1.1-zh: kommen dazu, wenn die Hauptstimme ein Wort in keiner Variante genau so spricht
OTHER_VOICES = ('zf_002', 'zm_010', 'zm_009')
VOICE_LOG = ROOT / 'data' / 'ki-stimmen.tsv'
# Varianten je Stimme: Anlauf vor dem Wort × Tempo
GRID = [(lead, speed) for lead in (',', '…', ';') for speed in (0.8, 0.9, 1.0, 1.1)]


def no_prevoice(r):
    return (r.get('prevoice') or 0) < 40


def heard_well(r):
    """sicher gehört: genau das Wort oder seine Silben samt Ton, ohne Vorlaut"""
    return no_prevoice(r) and (r['cls'] == 'gleich' or bool(r.get('ton')))


def rank(r):
    """Rangfolge einer Variante: kein Vorlaut, keine Extrasilbe vorne, wie sicher das Wort gehört wird (genau so oder
    samt Ton > Silben mit anderem Ton > sonst), dann der Abstand Δ zum wahrscheinlichsten Text, zuletzt genau das Wort"""
    heard = 2 if r['cls'] == 'gleich' or r.get('ton') else 1 if r['cls'] == 'gleiche_lesung' else 0
    return (no_prevoice(r), r['cls'] != 'extra_vorne', heard, -max(r['delta'], 0.0), r['cls'] == 'gleich')


def clearly_better(b, c):
    """b deutlich besser als c? (Unterschiede im Δ unter 0,3 gelten als Rauschen)"""
    if rank(b)[:3] != rank(c)[:3]:
        return rank(b)[:3] > rank(c)[:3]
    db, dc = max(b['delta'], 0.0), max(c['delta'], 0.0)
    return db < dc - 0.3 or (abs(db - dc) <= 0.3 and rank(b)[4] > rank(c)[4])


def improve(rows, evaluate, voice):
    """Wörter, die die Erkennung nicht sicher hört, in Varianten neu erzeugen: erst mit der Hauptstimme, und wenn keine
    Variante genau das Wort ergibt, auch mit den anderen Stimmen. Die beste Variante ersetzt die Datei, wenn sie deutlich
    besser ist – welche Stimme, ist egal, Hauptsache das Wort stimmt. Bewertet wird nach MP3-Kodierung, also so, wie die
    Datei später klingt. Welche Dateien eine andere Stimme sprechen, steht in data/ki-stimmen.tsv."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import ki_aussprache as K
    from kokoro import KModel, KPipeline

    kmodel = KModel(repo_id=K.REPO_ID).eval()
    pipe = KPipeline(lang_code='z', repo_id=K.REPO_ID, model=kmodel)
    others = [v for v in OTHER_VOICES if v != voice]
    packs = {v: pipe.load_voice(v) for v in (voice, *others)}
    voices = {}
    if VOICE_LOG.exists():
        for line in VOICE_LOG.read_text(encoding='utf8').splitlines():
            if line and not line.startswith('#'):
                f, v = line.split('\t')
                voices[f] = v
    # nur KI-Dateien – echte Aufnahmen werden nie ersetzt
    is_ai = lambda r: r.get('src', 'ai') == 'ai' and str(r['f']).endswith(('.ki.mp3', '.wav'))
    todo = [r for r in rows if not heard_well(r) and is_ai(r)]
    print(f'Nachbessern: {len(todo)} Wörter', file=sys.stderr)
    out, improved = [], 0
    for r in rows:
        if heard_well(r) or not is_ai(r):
            out.append(r)
            continue
        try:
            ps = K.pinyin_to_phonemes(r['n'])
        except Exception as e:
            print(f"  ! {r['s']}: {e}", file=sys.stderr)
            out.append(r)
            continue
        mp3 = Path(r['f']).suffix == '.mp3'
        meta = {k: r[k] for k in ('s', 'n', 'f', 'src') if k in r}
        cands = []  # (Stimme, Audio, MP3-Daten, Ergebnis)
        for stage in ([voice], others):
            batch = []
            for v in stage:
                for lead, speed in GRID:
                    K.LEAD = lead
                    try:
                        y = K.tidy(K.synthesize(kmodel, packs[v], ps, speed))
                    except Exception as e:
                        print(f"  ! {r['s']} ({v}): {e}", file=sys.stderr)
                        continue
                    finally:
                        K.LEAD = ','
                    batch.append((v, y, K.to_mp3(y) if mp3 else None))
            if not batch:
                continue
            # so bewerten, wie die Datei später klingt: Bei knappen Wörtern verschiebt schon die MP3-Kodierung das Ergebnis
            heard = [sf.read(io.BytesIO(b), dtype='float32')[0] if mp3 else y for _, y, b in batch]
            res = evaluate([meta] * len(batch), [resample_16k(h, K.SAMPLE_RATE) for h in heard])
            cands += [(v, y, b, x) for (v, y, b), x in zip(batch, res)]
            if any(no_prevoice(x) and x['cls'] == 'gleich' for *_, x in cands):
                break  # genau das Wort: andere Stimmen könnten es nur gleich gut
        if not cands:
            out.append(r)
            continue
        v, y, b, best = max(cands, key=lambda c: (rank(c[3]), c[0] == voice))
        if clearly_better(best, r):
            path = Path(r['f'])
            if mp3:
                path.write_bytes(b)  # genau die bewerteten Daten
            else:
                sf.write(path, y, K.SAMPLE_RATE)
            voices[path.name] = v
            out.append({**best, 'nachgebessert': True, 'vorher': r['asr'], 'stimme': v})
            improved += 1
        else:
            out.append(r)
        print(f"  {r['s']}: {'verbessert' if out[-1].get('nachgebessert') else 'unverändert'} ({improved} bisher)", file=sys.stderr)
    print(f'{improved} von {len(todo)} Dateien verbessert', file=sys.stderr)
    # nur Dateien in public/audio protokollieren, deren Stimme von der Hauptstimme abweicht
    keep = {f: v for f, v in voices.items() if v != voice and (ROOT / 'public' / 'audio' / f).exists()}
    VOICE_LOG.write_text(
        '# KI-Dateien, die nicht mit der Hauptstimme gesprochen sind (von scripts/tts/ki_pruefen.py --nachbessern)\n'
        + ''.join(f'{f}\t{v}\n' for f, v in sorted(keep.items())),
        encoding='utf8',
    )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--alle', action='store_true')
    ap.add_argument('--liste')
    ap.add_argument('--out')
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--nachbessern', action='store_true', help='nicht erkannte KI-Wörter in Varianten neu erzeugen und die beste behalten')
    ap.add_argument('--voice', default='zf_001')
    args = ap.parse_args()

    if args.liste:
        items = json.load(open(args.liste, encoding='utf8'))
    else:
        audio = json.load(open(ROOT / 'public' / 'data' / 'audio.json', encoding='utf8'))['words']
        items = [{'s': k.split('|')[0], 'n': k.split('|')[1], 'f': str(ROOT / 'public' / 'audio' / a['f'])} for k, a in audio.items() if a['s'] == 'ai']
    print(f'{len(items)} Dateien', file=sys.stderr)

    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    dtype = torch.float16 if device == 'mps' else torch.float32
    proc = WhisperProcessor.from_pretrained(MODEL)
    model = WhisperForConditionalGeneration.from_pretrained(MODEL, torch_dtype=dtype).to(device).eval()
    tok = proc.tokenizer
    prefix = tok.convert_tokens_to_ids(['<|startoftranscript|>', '<|zh|>', '<|transcribe|>', '<|notimestamps|>'])
    eot = tok.convert_tokens_to_ids('<|endoftext|>')

    @torch.no_grad()
    def score(enc, texts):
        seqs = [prefix + tok(t, add_special_tokens=False).input_ids + [eot] for t in texts]
        L = max(len(s) for s in seqs)
        ids = torch.full((len(seqs), L), eot, dtype=torch.long)
        mask = torch.zeros((len(seqs), L), dtype=torch.bool)
        for i, s in enumerate(seqs):
            ids[i, : len(s)] = torch.tensor(s)
            mask[i, len(prefix): len(s)] = True
        ids = ids.to(device)
        logits = model(encoder_outputs=BaseModelOutput(last_hidden_state=enc), decoder_input_ids=ids[:, :-1]).logits
        lp = torch.log_softmax(logits.float(), dim=-1).gather(-1, ids[:, 1:].unsqueeze(-1)).squeeze(-1)
        return [float(x) for x in (lp * mask[:, 1:].to(device)).sum(-1)]

    def evaluate(batch, wavs):
        """Spracherkennung und Vorlaut für Audiodaten (16 kHz) mit den Angaben aus batch (s, n, f)."""
        out = []
        for b in range(0, len(batch), args.batch):
            its, xs = batch[b: b + args.batch], wavs[b: b + args.batch]
            feats = proc.feature_extractor(xs, sampling_rate=16000, return_tensors='pt').input_features.to(device, dtype)
            with torch.no_grad():
                enc = model.model.encoder(feats).last_hidden_state
                gen = model.generate(encoder_outputs=BaseModelOutput(last_hidden_state=enc), language='zh', task='transcribe', max_new_tokens=40, num_beams=1, do_sample=False)
            texts = [t.strip() for t in tok.batch_decode(gen, skip_special_tokens=True)]
            lp_exp = score(enc, [it['s'] for it in its])
            lp_free = score(enc, [t or ' ' for t in texts])
            for it, x, t, le, lf in zip(its, xs, texts, lp_exp, lp_free):
                first = expected_syllables(it['n'])[0] if it['n'] else ''
                pv = prevoice_ms(x) if first.startswith(VOICELESS) else None
                out.append({**it, 'asr': t, 'cls': classify(it['s'], it['n'], t), 'ton': heard_tones(it['s'], it['n'], t),
                            'delta': round(lf - le, 2), 'prevoice': pv, 'dur': round(len(x) / 16000, 2)})
        return out

    rows = []
    for b in range(0, len(items), args.batch):
        batch = items[b: b + args.batch]
        rows += evaluate(batch, [load_16k(it['f']) for it in batch])
        print(f'{len(rows)}/{len(items)}', file=sys.stderr)
    if args.nachbessern:
        rows = improve(rows, evaluate, args.voice)

    if args.out:
        with open(args.out, 'w', encoding='utf8') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
    ok = [r for r in rows if r['cls'] in ('gleich', 'gleiche_lesung')]
    pv = [r['prevoice'] for r in rows if r['prevoice'] is not None]
    extra = [r for r in rows if r['cls'] == 'extra_vorne']
    sus = [r for r in rows if (r['cls'] not in ('gleich', 'gleiche_lesung') and r['delta'] > 4) or r['cls'] == 'extra_vorne' or (r['prevoice'] or 0) >= 40]
    tone_ok = [r for r in ok if r['cls'] == 'gleich' or r.get('ton')]
    print(f'\nErkannt wie erwartet: {len(ok)}/{len(rows)} ({len(ok) / max(1, len(rows)):.0%}), davon auch im Ton: {len(tone_ok)}')
    print(f'Extrasilbe vorne: {len(extra)}')
    if pv:
        print(f'Vorlaut ≥ 40 ms: {sum(v >= 40 for v in pv)}/{len(pv)} Wörtern mit stimmlosem Anlaut (Median {np.median(pv):.0f} ms)')
    print(f'Auffällig: {len(sus)}')
    for r in sorted(sus, key=lambda r: -r['delta']):
        print(f"  {r['s']} [{r['n']}] gehört „{r['asr']}“ ({r['cls']}, Δ={r['delta']}, Vorlaut {r['prevoice']})")


if __name__ == '__main__':
    main()
