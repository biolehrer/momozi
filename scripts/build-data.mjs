// Bereitet die Daten für die App auf:
//   - HSK-Sets mit deutschen Kurzbedeutungen  -> public/data/sets/*.json
//   - gekürztes Wörterbuch für die Suche      -> public/data/dict.json
//   - Quellen-Infos für die Lizenzseite        -> public/data/sources.json
//
// Aufruf:  npm run data              (nutzt vorhandene Downloads in data-src/)
//          npm run data -- --refresh (lädt die Quellen neu herunter)
//
// Handdaten (alle in data/):
//   overrides/<set>.json|.tsv  Lesung/Bedeutung vorhandener Wörter korrigieren (Wort <TAB> Bedeutung [<TAB> Pinyin])
//   additions/<set>.tsv        Wörter der Prüfungsliste, die in der Quelle fehlen (Wort <TAB> Pinyin <TAB> Bedeutung)
//   alternatives.tsv           Schreibweise wie in der Prüfungsliste + weitere richtige Formen für die Ton-Abfrage
//   extras.tsv                 „Weitere Bedeutungen“ von Hand ersetzen (Wort <TAB> Pinyin <TAB> Text, "-" = keine)

import fs from 'node:fs'
import path from 'node:path'
import { isToneVariant, normalizeNumeric, searchKey, splitNumeric } from '../src/lib/pinyin.ts'
import { shortMeaning, SENSE_SEP } from '../src/lib/meaning.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC_DIR = path.join(ROOT, 'data-src')
const OUT_DIR = path.join(ROOT, 'public', 'data')
const STROKE_DIR = path.join(ROOT, 'node_modules', 'hanzi-writer-data')

const HSK_COMMIT = '7ac65bf1a6387d35f1ade478906172a19311c7f9'
const SOURCES = {
  hsk: {
    file: 'hsk-complete.json',
    url: `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/${HSK_COMMIT}/complete.json`,
  },
  handedict: {
    file: 'handedict.u8',
    url: 'https://raw.githubusercontent.com/gugray/HanDeDict/master/handedict.u8',
  },
}

/** HSK 3.0, Prüfungsfassung 2026 ("newest" in der Quelle). Handkorrekturen je Stufe in data/overrides/<id>.json */
const SETS = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: `hsk${n}`,
  name: `HSK ${n}`,
  description: 'HSK 3.0 · Prüfungsfassung 2026',
  tag: `newest-${n}`,
}))

const refresh = process.argv.includes('--refresh')

async function ensureSource(src) {
  const file = path.join(SRC_DIR, src.file)
  if (!refresh && fs.existsSync(file)) return file
  console.log(`Lade ${src.url} …`)
  const res = await fetch(src.url)
  if (!res.ok) throw new Error(`Download fehlgeschlagen (${res.status}): ${src.url}`)
  fs.mkdirSync(SRC_DIR, { recursive: true })
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

// ---------- HanDeDict ----------

// Wortart-/Fachgebiets-Kürzel in Klammern, z. B. "(Adj)", "(S, Edu)", "(S, EDV)", "(Eig, Geo)", "(u.E.)"
const TAG_FIRST = /^(?:[A-ZÄÖÜ][A-Za-zäöüß-]{0,8}\.?|u\.E\.)$/
const TAG_TOKEN = /^[A-Za-zÄÖÜäöüß.-]{1,9}$/

function stripTags(text) {
  return text.replace(/\s*\(([^()]*)\)/g, (whole, inner) => {
    const tokens = inner.split(/\s*,\s*/).filter(Boolean)
    return tokens.length && TAG_FIRST.test(tokens[0]) && tokens.every((t) => TAG_TOKEN.test(t)) ? '' : whole
  })
}

// Langzeichen erkennen. HanDeDict hat fehlerhafte Zeilen (z. B. Langzeichen auch in der Spalte „vereinfacht“),
// deshalb wird gezählt: Ein Zeichen gilt als Langzeichen, wenn es weit häufiger als Abweichung in der Spalte
// „traditionell“ vorkommt als in der Spalte „vereinfacht“; umgewandelt wird in das häufigste Kurzzeichen.
const SIMP_COUNT = new Map()
const TRAD_TARGETS = new Map() // Langzeichen -> Map(Kurzzeichen -> Anzahl)
const TRAD2SIMP = new Map()

function collectTradOnly(text) {
  for (const line of text.split('\n')) {
    const m = line.match(/^(\S+) (\S+) \[/)
    if (!m) continue
    const trad = [...m[1]]
    const simp = [...m[2]]
    simp.forEach((c) => SIMP_COUNT.set(c, (SIMP_COUNT.get(c) ?? 0) + 1))
    if (trad.length !== simp.length) continue
    trad.forEach((c, i) => {
      if (c === simp[i]) return
      if (!TRAD_TARGETS.has(c)) TRAD_TARGETS.set(c, new Map())
      const t = TRAD_TARGETS.get(c)
      t.set(simp[i], (t.get(simp[i]) ?? 0) + 1)
    })
  }
  for (const [c, targets] of TRAD_TARGETS) {
    const total = [...targets.values()].reduce((a, b) => a + b, 0)
    if (total > 3 * (SIMP_COUNT.get(c) ?? 0)) TRAD2SIMP.set(c, [...targets].sort((a, b) => b[1] - a[1])[0][0])
  }
}

const toSimp = (w) => [...w].map((c) => TRAD2SIMP.get(c) ?? c).join('')

/** Von zwei Schreibungen ("条|條", "個|个") die vereinfachte wählen */
function pickSimplified(a, b) {
  if (a !== b && toSimp(a) === b) return b
  if (a !== b && toSimp(b) === a) return a
  return toSimp(a) === a ? a : b
}

// "ZEW: 条|條[tiao2],头|頭[tou2]" -> "Zählwort: 条, 头" (die Reihenfolge Kurz-/Langzeichen wechselt in HanDeDict)
function simplifyMeasureWords(text) {
  return text
    .replace(/\bZEW\b\s*:\s*/g, 'Zählwort: ')
    .replace(/\bZEW\b/g, 'Zählwort')
    .replace(/([^\s,|[\]]+)\|([^\s,|[\]]+)\[[^\]]*\]/g, (_, a, b) => pickSimplified(a, b))
    .replace(/([^\s,|[\]]+)\[[^\]]*\]/g, '$1')
    .replace(/([㐀-鿿]),(?=[㐀-鿿])/g, '$1, ')
    // fehlerhafte Zeilen ohne Kurzzeichen ("條条", "頭"): zeichenweise umwandeln, Doppelte entfernen
    .replace(/Zählwort: ([^/;(]*)/g, (_, list) =>
      'Zählwort: ' + list.split(/,\s*/).map((x) => [...new Set(toSimp(x))].join('')).join(', '),
    )
}

function cleanSense(sense) {
  let g = sense.split(/;?\s*Bsp\.:/)[0]
  g = simplifyMeasureWords(stripTags(g))
  return g
    .split(';')
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('; ')
}

/** Eigennamen (Familien-, Vor-, Orts-/Personennamen) und Radikal-Angaben ans Ende der Bedeutungen */
const LOW_TAGS = new Set(['Eig', 'Fam', 'Pers', 'Vorn', 'Org'])

function isLowPriority(raw) {
  const head = raw.split(/;?\s*Bsp\.:/)[0]
  for (const m of head.matchAll(/\(([^()]*)\)/g)) {
    if (m[1].split(/\s*,\s*/).some((t) => LOW_TAGS.has(t))) return true
  }
  return /^\s*Radikal Nr\./.test(head)
}

function parseHanDeDict(text) {
  const entries = new Map() // key: simp|numeric -> { s, n, senses[] }
  let dataDate = ''
  const lineRe = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) {
      const m = line.match(/^# Datenstand: (\S+)/)
      if (m) dataDate = m[1]
      continue
    }
    const m = line.match(lineRe)
    if (!m) continue
    const [, , simp, pinyin, body] = m
    const n = normalizeNumeric(pinyin)
    const senses = body
      .split('/')
      .map((raw) => ({ text: cleanSense(raw), low: isLowPriority(raw) }))
      .filter((x) => x.text)
    if (!senses.length) continue
    const key = `${simp}|${n}`
    const prev = entries.get(key)
    if (prev) {
      for (const x of senses) if (!prev.senses.some((p) => p.text === x.text)) prev.senses.push(x)
    } else {
      entries.set(key, { s: simp, n, senses })
    }
  }
  for (const e of entries.values()) {
    // high: ohne Eigennamen und Radikal-Angaben (für „Weitere Bedeutungen“ in den HSK-Sets)
    e.high = e.senses.filter((x) => !x.low).map((x) => x.text)
    e.senses = [...e.senses.filter((x) => !x.low), ...e.senses.filter((x) => x.low)].map((x) => x.text)
  }
  return { entries, dataDate }
}


// ---------- Hilfen ----------

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
}

function hasStrokeData(ch) {
  return fs.existsSync(path.join(STROKE_DIR, `${ch}.json`))
}

// ---------- Hauptteil ----------

const hskFile = await ensureSource(SOURCES.hsk)
const dictFile = await ensureSource(SOURCES.handedict)

const dictText = fs.readFileSync(dictFile, 'utf8')
collectTradOnly(dictText)
const { entries: dict, dataDate } = parseHanDeDict(dictText)
console.log(`HanDeDict: ${dict.size} Einträge (Datenstand ${dataDate})`)

const bySimp = new Map()
for (const e of dict.values()) {
  if (!bySimp.has(e.s)) bySimp.set(e.s, [])
  bySimp.get(e.s).push(e)
}

/** HanDeDict-Eintrag mit derselben Lesung (Neutralton/一不-Schreibung dürfen abweichen), sonst undefined */
function findEntry(s, n) {
  return dict.get(`${s}|${n}`) ?? (bySimp.get(s) ?? []).find((e) => isToneVariant(s, e.n, n))
}

const DATA_DIR = path.join(ROOT, 'data')

function readTsv(file) {
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.split('\t').map((x) => x.trim()))
}

/** alternatives.tsv: Wort, Anzeige-Lesung, weitere richtige Lesungen (durch | getrennt), Grund */
const ALTERNATIVES = new Map()
for (const [s, main, alts] of readTsv(path.join(DATA_DIR, 'alternatives.tsv'))) {
  if (!ALTERNATIVES.has(s)) ALTERNATIVES.set(s, [])
  const row = { s, main: normalizeNumeric(main), alts: (alts ?? '').split('|').filter(Boolean).map(normalizeNumeric), used: false }
  row.alts = row.alts.filter((x) => x !== row.main)
  ALTERNATIVES.get(s).push(row)
}

/** Passende Zeile aus alternatives.tsv, wenn die Lesung eine der dort genannten Formen ist */
function alternativesFor(s, n) {
  const row = (ALTERNATIVES.get(s) ?? []).find((r) => r.main === n || r.alts.includes(n))
  if (row) row.used = true
  return row
}

/** extras.tsv: Wort, Lesung, „Weitere Bedeutungen“ ("-" = keine anzeigen) */
const EXTRAS = new Map()
for (const [s, n, text] of readTsv(path.join(DATA_DIR, 'extras.tsv'))) {
  EXTRAS.set(`${s}|${normalizeNumeric(n)}`, { text: text === '-' ? '' : text, used: false })
}

function extrasFor(s, n, alts = []) {
  for (const k of [n, ...alts]) {
    const e = EXTRAS.get(`${s}|${k}`)
    if (e) {
      e.used = true
      return e.text
    }
  }
  return undefined
}

/** Sortierschlüssel wie in der Quelle (alphabetisch nach Pinyin, dann Ton) */
const sortKey = (n) => searchKey(n) + ' ' + normalizeNumeric(n).replace(/[^0-9]/g, '')

const hsk = JSON.parse(fs.readFileSync(hskFile, 'utf8'))

/**
 * Handkorrekturen je Stufe: data/overrides/<id>.json und/oder <id>.tsv.
 * TSV-Zeilen: Wort <TAB> Bedeutung [<TAB> Pinyin in Zahlen]; Bedeutung "=" behält die automatische.
 */
function loadOverrides(setId) {
  const dir = path.join(ROOT, 'data', 'overrides')
  const out = {}
  const json = path.join(dir, `${setId}.json`)
  if (fs.existsSync(json)) Object.assign(out, JSON.parse(fs.readFileSync(json, 'utf8')))
  const tsv = path.join(dir, `${setId}.tsv`)
  if (fs.existsSync(tsv)) {
    for (const line of fs.readFileSync(tsv, 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#')) continue
      const [s, meaning, pinyin] = line.split('\t').map((x) => x?.trim())
      const ov = { ...out[s] }
      if (meaning && meaning !== '=') ov.meaning = meaning
      if (pinyin) ov.pinyin = pinyin
      out[s] = ov
    }
  }
  return out
}

const setIndex = []
const problems = []
const REVIEW_DIR = path.join(SRC_DIR, 'review')
fs.mkdirSync(REVIEW_DIR, { recursive: true })

for (const set of SETS) {
  const overrides = loadOverrides(set.id)
  const words = []
  // Prüfliste: Wort, Pinyin, deutsche Kurzbedeutung, englische Bedeutung (CC-CEDICT), Markierung
  const review = []
  for (const e of hsk.filter((x) => x.level.includes(set.tag))) {
    const s = e.simplified
    const ov = overrides[s] ?? {}
    let flag = ov.meaning ? 'HAND' : 'AUTO'
    const readings = []
    for (const f of e.forms) {
      const n = f.transcriptions.numeric
      if (!readings.includes(n)) readings.push(n)
    }
    let reading = ov.pinyin
    if (!reading) {
      const lower = readings.filter((r) => r[0] === r[0].toLowerCase())
      const candidates = lower.length ? lower : readings
      reading = candidates.find((r) => dict.has(`${s}|${normalizeNumeric(r)}`)) ?? candidates[0]
      if (candidates.length > 1 && !ov.meaning) {
        problems.push(`${set.id} ${s}: mehrere Lesungen ${candidates.join(', ')} -> ${reading} (bitte prüfen)`)
        flag = 'LESUNG?'
      }
    }
    // Schreibweise wie in der Prüfungsliste und weitere richtige Formen (alternatives.tsv)
    const altRow = alternativesFor(s, normalizeNumeric(reading))
    if (altRow) reading = altRow.main
    const n = normalizeNumeric(reading)
    // Großschreibung (Eigennamen wie Zhōngguó) für die Anzeige erhalten
    const display = splitNumeric(reading)
      .map((syl, i) => (i === 0 && syl[0] !== syl[0].toLowerCase() ? syl[0].toUpperCase() + splitNumeric(n)[i].slice(1) : splitNumeric(n)[i]))
      .join(' ')

    // Zusatzbedeutungen nur aus einem Eintrag mit derselben Lesung (sonst stünden z. B. bei 哦 ò Bedeutungen von é)
    const entry = findEntry(s, n)
    let fallback
    if (!entry && !ov.meaning) {
      fallback = bySimp.get(s)?.[0]
      if (fallback) {
        problems.push(`${set.id} ${s} [${n}]: keine passende Lesung in HanDeDict, Bedeutung aus [${fallback.n}]`)
        flag = 'ANDERE-LESUNG'
      }
    }
    const meaning = ov.meaning ?? (entry ?? fallback ? shortMeaning((entry ?? fallback).senses.join(SENSE_SEP)) : '')
    if (!meaning) {
      problems.push(`${set.id} ${s} [${n}]: keine deutsche Bedeutung gefunden`)
      flag = 'FEHLT'
    }
    if (splitNumeric(n).length !== [...s].length) problems.push(`${set.id} ${s} [${n}]: Silbenzahl ≠ Zeichenzahl`)
    for (const ch of s) if (!hasStrokeData(ch)) problems.push(`${set.id} ${s}: keine Strichdaten für ${ch}`)
    const english = (e.forms.find((f) => normalizeNumeric(f.transcriptions.numeric) === n) ?? e.forms[0]).meanings.slice(0, 3).join('; ')
    review.push([s, reading, meaning, english, flag].join('\t'))

    const word = {
      s,
      n: display,
      m: meaning,
      x: extrasFor(s, n, altRow?.alts) ?? (entry ? entry.high.slice(0, 6).join(SENSE_SEP) : ''),
    }
    if (altRow?.alts.length) word.a = altRow.alts
    words.push(word)
  }

  // Wörter der Prüfungsliste, die in der Quelle fehlen (data/additions/<set>.tsv), passend einsortieren
  for (const [s, pinyin, meaning, extra] of readTsv(path.join(DATA_DIR, 'additions', `${set.id}.tsv`))) {
    let n = normalizeNumeric(pinyin)
    const altRow = alternativesFor(s, n)
    if (altRow) n = altRow.main
    const display = altRow ? n : pinyin
    if (words.some((w) => w.s === s && normalizeNumeric(w.n) === n)) {
      problems.push(`${set.id} ${s} [${n}]: Ergänzung ist schon vorhanden`)
      continue
    }
    if (splitNumeric(n).length !== [...s].length) problems.push(`${set.id} ${s} [${n}]: Silbenzahl ≠ Zeichenzahl`)
    for (const ch of s) if (!hasStrokeData(ch)) problems.push(`${set.id} ${s}: keine Strichdaten für ${ch}`)
    if (!meaning) problems.push(`${set.id} ${s} [${n}]: Ergänzung ohne Bedeutung`)
    const entry = findEntry(s, n)
    const word = {
      s,
      n: display,
      m: meaning,
      x: extra ? (extra === '-' ? '' : extra) : (extrasFor(s, n, altRow?.alts) ?? (entry ? entry.high.slice(0, 6).join(SENSE_SEP) : '')),
    }
    if (altRow?.alts.length) word.a = altRow.alts
    const k = sortKey(display)
    const at = words.findIndex((w) => sortKey(w.n) > k)
    words.splice(at < 0 ? words.length : at, 0, word)
    review.push([s, display, meaning, '', 'ERGÄNZT'].join('\t'))
  }

  writeJson(path.join(OUT_DIR, 'sets', `${set.id}.json`), {
    id: set.id,
    name: set.name,
    description: set.description,
    words,
  })
  setIndex.push({ id: set.id, name: set.name, description: set.description, count: words.length })
  fs.writeFileSync(path.join(REVIEW_DIR, `${set.id}.tsv`), review.join('\n') + '\n')
  const flags = review.reduce((acc, line) => ((acc[line.split('\t')[4]] = (acc[line.split('\t')[4]] ?? 0) + 1), acc), {})
  console.log(`${set.name}: ${words.length} Wörter ${JSON.stringify(flags)}`)
}
writeJson(path.join(OUT_DIR, 'sets', 'index.json'), setIndex)

// Handdaten, die nirgends gegriffen haben (Tippfehler, geänderte Lesung …)
for (const rows of ALTERNATIVES.values()) {
  for (const r of rows) if (!r.used) problems.push(`alternatives.tsv: ${r.s} [${r.main}] passt zu keinem Wort`)
}
for (const [k, e] of EXTRAS) if (!e.used) problems.push(`extras.tsv: ${k} passt zu keinem Wort`)

// Wörterbuch für die Suche: [vereinfacht, Pinyin (Zahlen), Bedeutungen]
const dictOut = []
for (const e of dict.values()) {
  let m = e.senses.slice(0, 4).join(SENSE_SEP)
  if (m.length > 160) m = m.slice(0, 157).replace(/\s+\S*$/, '') + ' …'
  dictOut.push([e.s, e.n, m])
}
writeJson(path.join(OUT_DIR, 'dict.json'), dictOut)
const dictSize = fs.statSync(path.join(OUT_DIR, 'dict.json')).size
console.log(`Wörterbuch: ${dictOut.length} Einträge, ${(dictSize / 1e6).toFixed(1)} MB`)

writeJson(path.join(OUT_DIR, 'sources.json'), {
  handedictDate: dataDate,
  hskCommit: HSK_COMMIT,
  generated: new Date().toISOString().slice(0, 10),
})

if (problems.length) {
  console.log(`\n${problems.length} Hinweise:`)
  for (const p of problems) console.log('  - ' + p)
}
