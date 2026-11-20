# Zeichenweise

Web-App zum Üben chinesischer Schriftzeichen (Kurzzeichen) – für das Handy gemacht, installierbar, auf Deutsch.

- **Fertige Sets:** HSK 1–6 (HSK 3.0, Prüfungsfassung 2026) mit von Hand geprüften deutschen Bedeutungen und Lesungen; in „Decks“ einzeln zuschaltbar
- **Eigene Decks:** Wörter im Wörterbuch suchen (Zeichen, Pinyin oder Deutsch) oder selbst anlegen
- **Vier Abfragearten**, einzeln abschaltbar:
  - **Schreiben** – Bedeutung und Pinyin sehen, Zeichen aus dem Gedächtnis schreiben; jeder Strich wird geprüft
  - **Pinyin** – Zeichen sehen, Aussprache erinnern
  - **Töne** – Zeichen sehen, Ton jeder Silbe wischen oder tippen
  - **Bedeutung** – Zeichen sehen, deutsche Bedeutung erinnern
- **Neue Wörter** werden erst vorgeführt (Strichfolge-Animation) und dann nachgezeichnet
- **Aussprache** mit echten Aufnahmen, Lücken mit gekennzeichneter KI-Stimme (abschaltbares automatisches Abspielen); bei Pinyin- und Ton-Abfragen erst nach der Antwort
- **Spaced Repetition** mit FSRS, jede Abfrageart wird einzeln geplant
- **Offline nutzbar** (Service Worker): App und HSK-Sets fest gespeichert, Strichfolgen und Aussprache der eigenen/aktiven Decks werden im Hintergrund vorgeladen, das Wörterbuch beim ersten Suchen; Updates nach Tippen auf „Aktualisieren“
- **Eigene Decks zusammenstellen:** HSK-Wörter ankreuzen, im Wörterbuch suchen oder die Vokabelliste aus dem Kurs einfügen; Decks als Datei teilen und importieren
- **Sicherung** des Lernstands als Datei (Teilen-Menü), Laden mit Zusammenführen oder Ersetzen; dezente Erinnerung
- **Handy, Tablet und PC:** auf dem Handy Leiste unten, auf dem iPad hochkant eine Icon-Leiste links, im Querformat und am Rechner eine Seitenleiste; Üben im Querformat zweispaltig mit großer Zeichenfläche
- **Tastenkürzel** beim Üben: Leertaste/Enter weiter, 1/2 bewerten, 1–5 Töne, P anhören, Esc beenden
- Alle Daten bleiben lokal auf dem Gerät (IndexedDB), kein Konto, kein Server

## Entwickeln

Voraussetzung: [Node.js](https://nodejs.org) ab Version 22.

```bash
npm install
npm run dev
```

Die App läuft dann unter http://localhost:5173. Zum Testen auf dem Handy im selben WLAN die angezeigte „Network“-Adresse öffnen.

```bash
npm run check   # Typprüfung
npm run build   # fertige Seite in dist/
npm run preview # fertige Seite lokal ansehen – nur hier läuft der Service Worker (Offline-Modus)
```

## Daten neu erzeugen

Die aufbereiteten Daten liegen fertig in `public/data/`. Neu erzeugen (lädt HanDeDict und die HSK-Liste herunter):

```bash
npm run data -- --refresh
```

Handkorrekturen liegen je Stufe in `data/overrides/` (`hsk1.json` bzw. `hsk2.tsv` … `hsk6.tsv`). TSV-Zeilen: `Wort<TAB>Bedeutung[<TAB>Pinyin in Zahlen]`, `=` als Bedeutung behält die automatische. Das Skript meldet alles, was noch geprüft werden sollte (mehrdeutige Lesungen, fehlende Bedeutungen), und schreibt pro Stufe eine Prüfliste nach `data-src/review/<stufe>.tsv` (Wort, Lesung, deutsche Kurzbedeutung, englische Bedeutung, Markierung).

### Aussprache

```bash
npm run audio
```

Lädt echte Aufnahmen für alle Wörter der HSK-Sets (Yue Tan / Universität Caen über audio-cmn, ergänzt durch Lingua Libre), prüft Lesung und Lizenz und schreibt `public/audio/`, `public/data/audio.json` und die Namensnennung `public/audio/CREDITS.txt`. Wörter ohne freie Aufnahme landen in `data/audio-missing.txt` – sie können z. B. auf [Lingua Libre](https://lingualibre.org) eingesprochen werden und werden beim nächsten Lauf übernommen.

Bis dahin spricht sie eine **KI-Stimme** ([Kokoro v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh), Apache 2.0), in der App mit „KI“ gekennzeichnet. Die Lesung wird aus unserem Pinyin vorgegeben. Dafür braucht es einmalig eine Python-Umgebung (sonst überspringt das Skript diesen Schritt, mit `--no-ai` auch absichtlich):

```bash
uv venv .venv-tts --python 3.12
VIRTUAL_ENV=.venv-tts uv pip install "kokoro>=0.9" "misaki[zh]>=0.9" soundfile lameenc
```

Die App-Symbole entstehen mit `node scripts/make-icons.mjs` (SVG) und werden auf dem Mac mit `sips` in PNG umgewandelt.

## Veröffentlichen

Jeder Push auf `main` baut die App per GitHub Actions und veröffentlicht sie auf GitHub Pages (`.github/workflows/deploy.yml`). Im Repository muss dafür einmalig unter **Settings → Pages → Source** „GitHub Actions“ eingestellt sein.

## Lizenz

Eigener Code: MIT (siehe `LICENSE`). Daten: HanDeDict (CC BY-SA), Strichdaten aus Make Me a Hanzi (Arphic Public License) – Details in `LICENSES.md` und in der App unter „Quellen & Lizenzen“.
