# Quellen und Lizenzen

Zeichenweise besteht aus eigenem Code (MIT-Lizenz, siehe `LICENSE`) und Daten bzw. Bibliotheken anderer Projekte. Hier steht, was woher kommt und unter welcher Lizenz es steht.

## Daten

| Was | Wo im Projekt | Quelle | Lizenz |
| --- | --- | --- | --- |
| Chinesisch-deutsches Wörterbuch | `public/data/dict.json` | [HanDeDict](https://github.com/gugray/HanDeDict), veröffentlicht von Gábor L. Ugray, ursprünglich mit Unterstützung der Chinesisch-Deutschen Gesellschaft e. V. Hamburg | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/deed.de) laut Datenkopf (die README des Projekts nennt CC BY-SA 2.0) |
| HSK-Sets mit deutschen Kurzbedeutungen | `public/data/sets/*.json` | Wortliste: [complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (Yanis Zafirópulos, MIT); Lesungen dort ursprünglich aus [CC-CEDICT](https://cc-cedict.org/) (CC BY-SA 4.0); Bedeutungen aus HanDeDict | CC BY-SA (wegen HanDeDict) |
| Handkorrekturen für HSK-Wörter | `data/hsk-overrides.json` | eigene Bearbeitung | CC BY-SA (wie HanDeDict) |
| Strichfolgen | wird beim Bauen aus `node_modules/hanzi-writer-data` nach `dist/strokes/` kopiert | [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), abgeleitet aus [Make Me a Hanzi](https://github.com/skishore/makemeahanzi), ursprünglich aus Schriften von Arphic Technology | [Arphic Public License](https://github.com/chanind/hanzi-writer-data/blob/master/ARPHICPL.TXT) (Lizenztext liegt in `dist/strokes/ARPHICPL.TXT`) |
| App-Symbole | `public/icons/` | aus den Strichdaten von 字 (siehe oben) | Arphic Public License |

### Bearbeitung der HanDeDict-Daten

`scripts/build-data.mjs` kürzt die Einträge auf vereinfachte Zeichen, Pinyin und Bedeutungen (ohne Beispielsätze und Wortart-Kürzel). Für HSK-Wörter wählt es die passende Lesung und eine Kurzbedeutung; `data/hsk-overrides.json` enthält von Hand überarbeitete Kurzbedeutungen. Diese abgeleiteten Daten stehen nach dem Share-Alike-Prinzip ebenfalls unter CC BY-SA.

## Bibliotheken

| Paket | Zweck | Lizenz |
| --- | --- | --- |
| [hanzi-writer](https://github.com/chanind/hanzi-writer) (David Chanin) | Strichfolge-Animation, Nachzeichnen | MIT |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) (Open Spaced Repetition) | Spaced-Repetition-Algorithmus FSRS | MIT |
| [idb](https://github.com/jakearchibald/idb) (Jake Archibald) | IndexedDB-Hilfsfunktionen | ISC |
| [Svelte](https://svelte.dev) | Oberfläche | MIT |
| [Vite](https://vite.dev) | Bauwerkzeug (nicht in der App enthalten) | MIT |

## Hinweis

Zeichenweise ist ein privates, nicht-kommerzielles Projekt und steht in keiner Verbindung zu den Herausgebern der HSK-Prüfung (Chinese Testing International) oder zu anderen Lern-Apps.
