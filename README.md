# Zeichenweise

Web-App zum Üben chinesischer Schriftzeichen (Kurzzeichen) – für das Handy gemacht, installierbar, auf Deutsch.

- **Fertige Sets:** HSK 1 (HSK 3.0, Prüfungsfassung 2026), weitere Stufen folgen
- **Eigene Decks:** Wörter im Wörterbuch suchen (Zeichen, Pinyin oder Deutsch) oder selbst anlegen
- **Vier Abfragearten**, einzeln abschaltbar:
  - **Schreiben** – Bedeutung und Pinyin sehen, Zeichen aus dem Gedächtnis schreiben; jeder Strich wird geprüft
  - **Pinyin** – Zeichen sehen, Aussprache erinnern
  - **Töne** – Zeichen sehen, Ton jeder Silbe wischen oder tippen
  - **Bedeutung** – Zeichen sehen, deutsche Bedeutung erinnern
- **Neue Wörter** werden erst vorgeführt (Strichfolge-Animation) und dann nachgezeichnet
- **Spaced Repetition** mit FSRS, jede Abfrageart wird einzeln geplant
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
```

## Daten neu erzeugen

Die aufbereiteten Daten liegen fertig in `public/data/`. Neu erzeugen (lädt HanDeDict und die HSK-Liste herunter):

```bash
npm run data -- --refresh
```

Eine weitere HSK-Stufe kommt dazu, indem man in `scripts/build-data.mjs` einen Eintrag in `SETS` ergänzt und mehrdeutige Lesungen oder unpassende Bedeutungen in `data/hsk-overrides.json` korrigiert. Das Skript listet alle Wörter auf, die geprüft werden sollten.

Die App-Symbole entstehen mit `node scripts/make-icons.mjs` (SVG) und werden auf dem Mac mit `sips` in PNG umgewandelt.

## Veröffentlichen

Jeder Push auf `main` baut die App per GitHub Actions und veröffentlicht sie auf GitHub Pages (`.github/workflows/deploy.yml`). Im Repository muss dafür einmalig unter **Settings → Pages → Source** „GitHub Actions“ eingestellt sein.

## Lizenz

Eigener Code: MIT (siehe `LICENSE`). Daten: HanDeDict (CC BY-SA), Strichdaten aus Make Me a Hanzi (Arphic Public License) – Details in `LICENSES.md` und in der App unter „Quellen & Lizenzen“.
