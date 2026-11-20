// Bereitet die Daten für die App auf:
//   - HSK-Sets mit deutschen Kurzbedeutungen  -> public/data/sets/*.json
//   - gekürztes Wörterbuch für die Suche      -> public/data/dict.json
//   - Quellen-Infos für die Lizenzseite        -> public/data/sources.json
//
// Aufruf:  npm run data              (nutzt vorhandene Downloads in data-src/)
//          npm run data -- --refresh (lädt die Quellen neu herunter)
//
// Neue HSK-Stufe hinzufügen: Eintrag in SETS ergänzen und ggf. Lesungen/Bedeutungen
// in data/hsk-overrides.json korrigieren.

import fs from 'node:fs'
import path from 'node:path'
import { normalizeNumeric, splitNumeric } from '../src/lib/pinyin.ts'
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

/** HSK 3.0, Prüfungsfassung 2026 ("newest" in der Quelle) */
const SETS = [
  {
    id: 'hsk1',
    name: 'HSK 1',
    description: 'HSK 3.0 · Prüfungsfassung 2026 · Stufe 1',
    tag: 'newest-1',
  },
]

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

// "ZEW:個|个[ge4]" -> "ZEW: 个"
function simplifyMeasureWords(text) {
  return text
    .replace(/ZEW:\s*/g, 'ZEW: ')
    .replace(/\S+?\|(\S+?)\[[^\]]*\]/g, '$1')
    .replace(/(\S+?)\[[^\]]*\]/g, '$1')
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
    const senses = body.split('/').map(cleanSense).filter(Boolean)
    if (!senses.length) continue
    const key = `${simp}|${n}`
    const prev = entries.get(key)
    if (prev) {
      for (const s of senses) if (!prev.senses.includes(s)) prev.senses.push(s)
    } else {
      entries.set(key, { s: simp, n, senses })
    }
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

const { entries: dict, dataDate } = parseHanDeDict(fs.readFileSync(dictFile, 'utf8'))
console.log(`HanDeDict: ${dict.size} Einträge (Datenstand ${dataDate})`)

const bySimp = new Map()
for (const e of dict.values()) {
  if (!bySimp.has(e.s)) bySimp.set(e.s, [])
  bySimp.get(e.s).push(e)
}

const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'hsk-overrides.json'), 'utf8'))
const hsk = JSON.parse(fs.readFileSync(hskFile, 'utf8'))

const setIndex = []
const problems = []

for (const set of SETS) {
  const words = []
  for (const e of hsk.filter((x) => x.level.includes(set.tag))) {
    const s = e.simplified
    const ov = overrides[s] ?? {}
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
      if (candidates.length > 1) problems.push(`${s}: mehrere Lesungen ${candidates.join(', ')} -> ${reading} (bitte prüfen)`)
    }
    const n = normalizeNumeric(reading)
    // Großschreibung (Eigennamen wie Zhōngguó) für die Anzeige erhalten
    const display = splitNumeric(reading)
      .map((syl, i) => (i === 0 && syl[0] !== syl[0].toLowerCase() ? syl[0].toUpperCase() + splitNumeric(n)[i].slice(1) : splitNumeric(n)[i]))
      .join(' ')

    let entry = dict.get(`${s}|${n}`)
    if (!entry) {
      const alt = bySimp.get(s)
      if (alt?.length) {
        entry = alt[0]
        if (!ov.meaning) problems.push(`${s} [${n}]: keine passende Lesung in HanDeDict, nehme [${entry.n}]`)
      }
    }
    const meaning = ov.meaning ?? (entry ? shortMeaning(entry.senses.join(SENSE_SEP)) : '')
    if (!meaning) problems.push(`${s} [${n}]: keine deutsche Bedeutung gefunden`)
    if (splitNumeric(n).length !== [...s].length) problems.push(`${s} [${n}]: Silbenzahl ≠ Zeichenzahl`)
    for (const ch of s) if (!hasStrokeData(ch)) problems.push(`${s}: keine Strichdaten für ${ch}`)

    words.push({
      s,
      n: display,
      m: meaning,
      x: entry ? entry.senses.slice(0, 6).join(SENSE_SEP) : '',
    })
  }
  writeJson(path.join(OUT_DIR, 'sets', `${set.id}.json`), {
    id: set.id,
    name: set.name,
    description: set.description,
    words,
  })
  setIndex.push({ id: set.id, name: set.name, description: set.description, count: words.length })
  console.log(`${set.name}: ${words.length} Wörter`)
}
writeJson(path.join(OUT_DIR, 'sets', 'index.json'), setIndex)

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
