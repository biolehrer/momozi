# Momozì

Web-App zum Üben chinesischer Schriftzeichen (Kurzzeichen) – für das Handy gemacht, installierbar, auf Deutsch.

- **Fertige Sets:** HSK 1–6 (HSK 3.0, Prüfungsfassung 2026) mit von Hand geprüften deutschen Bedeutungen und Lesungen; in „Decks“ einzeln zuschaltbar
- **Eigene Decks:** Wörter suchen (Zeichen, Pinyin oder Deutsch) – standardmäßig nur in den HSK-Wörtern, mit dem Schalter „Auch im Wörterbuch suchen“ zusätzlich in rund 160.000 HanDeDict-Wörtern (farblich abgesetzt); jedes Wort lässt sich zum Ansehen öffnen (Strichfolge, Aussprache) und einzeln oder mit „Auswählen“ gesammelt zu einem Deck hinzufügen
- **Vier Abfragearten**, einzeln abschaltbar:
  - **Schreiben** – Bedeutung und Pinyin sehen, Zeichen aus dem Gedächtnis schreiben; jeder Strich wird geprüft
  - **Pinyin** – Zeichen sehen, Aussprache erinnern
  - **Töne** – Zeichen sehen, Ton jeder Silbe wischen oder tippen
  - **Bedeutung** – Zeichen sehen, deutsche Bedeutung erinnern
- **Neue Wörter** werden erst vorgeführt (Strichfolge-Animation) und dann nachgezeichnet
- **Aussprache** mit echten Aufnahmen, Lücken mit gekennzeichneter KI-Stimme (abschaltbares automatisches Abspielen); bei Pinyin- und Ton-Abfragen erst nach der Antwort
- **Spaced Repetition** mit FSRS, jede Abfrageart wird einzeln geplant
- **Offline nutzbar** (Service Worker): App und HSK-Sets fest gespeichert, Strichfolgen und Aussprache der eigenen/aktiven Decks werden im Hintergrund vorgeladen, das Wörterbuch bei der ersten Suche mit Wörterbuch-Schalter oder beim ersten Einfügen einer Vokabelliste; Updates nach Tippen auf „Aktualisieren“
- **Eigene Decks zusammenstellen:** HSK-Wörter ankreuzen, bei Bedarf auch im Wörterbuch suchen oder die Vokabelliste aus dem Kurs einfügen; Decks als Datei teilen und importieren
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

Weitere Handdaten in `data/`:

- `additions/<stufe>.tsv` – Wörter der HSK-Prüfungsliste 2025/2026, die in der Quelle fehlen, auch zweite Lesungen eines Zeichens (`Wort<TAB>Pinyin<TAB>Bedeutung`)
- `alternatives.tsv` – Schreibweise wie in der Prüfungsliste (z. B. 一起 yìqǐ) und weitere richtige Lesungen, die die Ton-Abfrage gelten lässt (wahlweise neutraler Ton, Grundform von 一/不)
- `extras.tsv` – „Weitere Bedeutungen“ von Hand, wo die automatischen aus HanDeDict falsch sind

Ändert sich dabei die Lesung eines Wortes, bleibt der Lernstand nur erhalten, wenn danach `node scripts/build-migrations.mjs <git-Stand der letzten Veröffentlichung>` läuft: Es schreibt `public/data/migrations.json`, mit der die App alte Wortschlüssel beim Start umschreibt.

### Aussprache

```bash
npm run audio
```

Lädt echte Aufnahmen für alle Wörter der HSK-Sets (Yue Tan / Universität Caen über audio-cmn, ergänzt durch Lingua Libre), prüft Lesung und Lizenz und schreibt `public/audio/`, `public/data/audio.json` und die Namensnennung `public/audio/CREDITS.txt`. Einsilbige Wörter ohne eigene Aufnahme bekommen die Aufnahme eines gleich ausgesprochenen Zeichens (散 sǎn klingt genau wie 伞 sǎn), wenn Yue Tan eines mit genau dieser Lesung samt Ton eingesprochen hat; die App nennt dann das Zeichen. Wörter ohne freie Aufnahme landen in `data/audio-missing.txt` – sie können z. B. auf [Lingua Libre](https://lingualibre.org) eingesprochen werden und werden beim nächsten Lauf übernommen.

Bis dahin spricht sie eine **KI-Stimme** ([Kokoro v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh), Apache 2.0), in der App mit „KI“ gekennzeichnet. Die Aussprache wird direkt aus unserem Pinyin in Kokoros Lautschrift übersetzt, und jedes Wort wird genau am Wortanfang geschnitten (Kokoro setzt sonst einen stimmhaften Vorlaut davor), bei b, p, d, t, g und k im Verschluss vor dem Laut; Wörter, die mit Vokal, w, y oder er beginnen, werden weich eingeblendet. Nach Änderungen am Skript alle KI-Dateien mit `npm run audio -- --ki-neu` neu erzeugen und mit `.venv-tts/bin/python scripts/tts/ki_pruefen.py --alle --nachbessern` prüfen: Vorlaut-Messung und Spracherkennung (Whisper, braucht zusätzlich `transformers`, `torch` und `pypinyin`). Wörter, die die Erkennung nicht genau so hört – als das Wort selbst oder mit denselben Silben samt Tönen – oder die doch einen Vorlaut haben, werden in Varianten neu erzeugt (Anlauf und Tempo; trifft die Hauptstimme das Wort in keiner Variante genau, auch mit den anderen Stimmen des Modells zf_002, zm_010 und zm_009, und zuletzt im Satzrahmen: das Wort nach „我说“ oder „这是“ gesprochen und herausgeschnitten, was vor allem dem 3. Ton am Wortanfang hilft). Behalten wird die beste Variante, bewertet nach der MP3-Umwandlung; welche Datei eine andere Stimme spricht, steht in `data/ki-stimmen.tsv`. Danach noch einmal `npm run audio`, damit die Namensnennung stimmt. Für die KI braucht es einmalig eine Python-Umgebung (sonst überspringt das Skript diesen Schritt, mit `--no-ai` auch absichtlich):

```bash
uv venv .venv-tts --python 3.12
VIRTUAL_ENV=.venv-tts uv pip install "kokoro>=0.9" "misaki[zh]>=0.9" soundfile lameenc
```

Die App-Symbole entstehen mit `node scripts/make-icons.mjs` (SVG) und werden auf dem Mac mit `sips` in PNG umgewandelt.

## Veröffentlichen

Jeder Push auf `main` baut die App per GitHub Actions und veröffentlicht sie auf GitHub Pages (`.github/workflows/deploy.yml`). Im Repository muss dafür einmalig unter **Settings → Pages → Source** „GitHub Actions“ eingestellt sein.

## Lizenz

Eigener Code: MIT (siehe `LICENSE`). Daten: HanDeDict (CC BY-SA), Strichdaten aus Make Me a Hanzi (Arphic Public License) – Details in `LICENSES.md` und in der App unter „Quellen & Lizenzen“.
