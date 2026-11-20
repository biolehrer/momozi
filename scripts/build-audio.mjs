// Sammelt echte Aussprache-Aufnahmen für die Wörter der HSK-Sets:
//   1. Yue Tan (Universität Caen, über audio-cmn), CC BY-SA 3.0 US – Lesung wird mit dem Shtooka-Index geprüft
//   2. Lingua Libre (Wikimedia Commons), CC0 / CC BY / CC BY-SA – nur für Wörter mit eindeutiger Lesung
//   3. Lücken: KI-Stimme Kokoro v1.1-zh (Apache 2.0), deutlich als KI gekennzeichnet
//      (braucht die Python-Umgebung .venv-tts, siehe scripts/tts/ki_aussprache.py; abschaltbar mit --no-ai)
// Ergebnis:
//   public/audio/*.mp3          Audiodateien
//   public/data/audio.json      Index Wort -> Datei + Quelle/Namensnennung
//   public/audio/CREDITS.txt    Namensnennung je Datei
//   data/audio-missing.txt      Wörter ohne Aufnahme (zum Einsprechen auf Lingua Libre)
//
// Aufruf: npm run audio            (nutzt Zwischenspeicher in data-src/)
//         npm run audio -- --refresh

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { displayPinyin, inputToNumeric, normalizeNumeric, searchKey, splitNumeric, toneSearchKey } from '../src/lib/pinyin.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC_DIR = path.join(ROOT, 'data-src')
const AUDIO_DIR = path.join(ROOT, 'public', 'audio')
const DATA_DIR = path.join(ROOT, 'public', 'data')
const UA = 'open-data-build-script/0.1'
const refresh = process.argv.includes('--refresh')
const noAi = process.argv.includes('--no-ai')
const AI = { model: 'Kokoro v1.1-zh', voice: 'zf_001', python: path.join(ROOT, '.venv-tts', 'bin', 'python') }

const AUDIO_CMN = 'hugolpz/audio-cmn'
const TAN_INDEX_URL = 'https://fsi-languages.yojik.eu/audiocollections/detailled/cmn-caen-tan/flac/index.tags.txt'
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
const LL_CATEGORY = 'Category:Lingua_Libre_pronunciation-cmn'
/** erlaubte Lizenzen für Lingua-Libre-Dateien, in bevorzugter Reihenfolge */
const LL_LICENSES = ['CC0', 'CC BY 4.0', 'CC BY-SA 4.0', 'CC BY 3.0', 'CC BY-SA 3.0']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchRetry(url, { as = 'text', tries = 5 } = {}) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return as === 'json' ? res.json() : as === 'buffer' ? Buffer.from(await res.arrayBuffer()) : res.text()
    if (res.status === 429 || res.status >= 500) {
      await sleep(5000 * (i + 1))
      continue
    }
    throw new Error(`${res.status} ${url}`)
  }
  throw new Error(`zu viele Fehlversuche: ${url}`)
}

async function cached(file, producer) {
  const p = path.join(SRC_DIR, file)
  if (!refresh && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  const data = await producer()
  fs.mkdirSync(SRC_DIR, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data))
  return data
}

const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16)).join('-')
const keyOf = (w) => `${w.s}|${w.n ? normalizeNumeric(w.n) : ''}`
const fileOf = (w) => `${hex(w.s)}_${toneSearchKey(w.n)}.mp3`
const normMarked = (s) => s.normalize('NFC').toLowerCase().replace(/[\s'’]/g, '')

// ---------- Quellen laden ----------

/** audio-cmn: fester Commit + Liste der vorhandenen 64k-Dateien */
const cmn = await cached('audio-cmn.json', async () => {
  const commit = (await fetchRetry(`https://api.github.com/repos/${AUDIO_CMN}/commits/master`, { as: 'json' })).sha
  const dir = await fetchRetry(`https://api.github.com/repos/${AUDIO_CMN}/contents/64k?ref=${commit}`, { as: 'json' })
  const hskSha = dir.find((f) => f.name === 'hsk').sha
  const tree = await fetchRetry(`https://api.github.com/repos/${AUDIO_CMN}/git/trees/${hskSha}`, { as: 'json' })
  return { commit, words: tree.tree.map((e) => e.path).filter((p) => p.startsWith('cmn-')).map((p) => p.slice(4, -4)) }
})
const cmnWords = new Set(cmn.words)

/** Shtooka-Index der Aufnahmen von Yue Tan: Wort -> Lesungen */
const tanIndexFile = path.join(SRC_DIR, 'cmn-caen-tan.tags.txt')
if (refresh || !fs.existsSync(tanIndexFile)) fs.writeFileSync(tanIndexFile, await fetchRetry(TAN_INDEX_URL))
const tanReadings = new Map()
for (const block of fs.readFileSync(tanIndexFile, 'utf8').split(/\n(?=\[cmn-)/)) {
  const text = block.match(/^SWAC_TEXT=(.+)$/m)?.[1]?.trim()
  const phon = block.match(/^SWAC_PRON_PHON=(.+)$/m)?.[1]?.trim()
  if (!text || !phon) continue
  if (!tanReadings.has(text)) tanReadings.set(text, [])
  tanReadings.get(text).push(phon)
}

/** Lingua Libre: alle Mandarin-Dateien (Titel) */
const llTitles = await cached('lingualibre-cmn.json', async () => {
  const titles = []
  let cont = {}
  for (;;) {
    const params = new URLSearchParams({ action: 'query', list: 'categorymembers', cmtitle: LL_CATEGORY, cmlimit: '500', cmtype: 'file', format: 'json', ...cont })
    const d = await fetchRetry(`${COMMONS_API}?${params}`, { as: 'json' })
    titles.push(...d.query.categorymembers.map((m) => m.title))
    if (!d.continue) break
    cont = { cmcontinue: d.continue.cmcontinue }
    await sleep(2000)
  }
  return titles
})
const llByWord = new Map()
for (const t of llTitles) {
  // nur Q9192 = Hochchinesisch (Mandarin); z. B. Q727694 = taiwanisches Mandarin bleibt außen vor
  const m = t.match(/^File:LL-Q9192 \(cmn\)-(.+?)-(.+)\.(wav|ogg|mp3|flac|oga|opus)$/)
  if (!m) continue
  if (!llByWord.has(m[2])) llByWord.set(m[2], [])
  llByWord.get(m[2]).push({ title: t, speaker: m[1] })
}
const speakerCount = new Map()
for (const list of llByWord.values()) for (const f of list) speakerCount.set(f.speaker, (speakerCount.get(f.speaker) ?? 0) + 1)

/** Verschiedene Lesungen je Schreibung (für die Eindeutigkeitsprüfung): HanDeDict + HSK-Quelle (CC-CEDICT) + Tan-Index */
const readingsBySimp = new Map()
function addReading(s, pinyin) {
  if (!readingsBySimp.has(s)) readingsBySimp.set(s, new Set())
  readingsBySimp.get(s).add(searchKey(pinyin))
}
for (const [s, n] of JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dict.json'), 'utf8'))) addReading(s, n)
const hskSource = path.join(SRC_DIR, 'hsk-complete.json')
if (fs.existsSync(hskSource)) {
  for (const e of JSON.parse(fs.readFileSync(hskSource, 'utf8'))) {
    for (const f of e.forms) if (/^[a-z]/.test(f.transcriptions.numeric)) addReading(e.simplified, f.transcriptions.numeric)
  }
} else {
  console.warn('Hinweis: data-src/hsk-complete.json fehlt (npm run data), Eindeutigkeitsprüfung nur mit HanDeDict')
}
for (const [s, phons] of tanReadings) for (const p of phons) addReading(s, p)

// ---------- Prüfungen ----------

/** Passt die Lesung einer Tan-Aufnahme zu unserem Pinyin? */
function tanMatches(word) {
  const phons = tanReadings.get(word.s)
  if (!phons) return false
  const syllables = splitNumeric(word.n).length
  const ours = normalizeNumeric(word.n)
  const oursMarked = normMarked(displayPinyin(word.n))
  return phons.some((p) => {
    if (syllables === 1) return normalizeNumeric(inputToNumeric(p).numeric) === ours
    // mehrsilbig: Abweichungen nur durch Tonsandhi / neutralen Ton sind in Ordnung
    return normMarked(p) === oursMarked || searchKey(p) === searchKey(oursMarked)
  })
}

/** Lingua-Libre-Aufnahmen tragen keine Lesung – nur nehmen, wenn das Wort eindeutig ist */
function unambiguous(word) {
  const r = readingsBySimp.get(word.s)
  return !r || r.size <= 1
}

async function llMetadata(titles) {
  const out = new Map()
  for (let i = 0; i < titles.length; i += 40) {
    const params = new URLSearchParams({
      action: 'query',
      prop: 'videoinfo',
      viprop: 'url|derivatives|extmetadata',
      viextmetadatafilter: 'LicenseShortName|LicenseUrl',
      titles: titles.slice(i, i + 40).join('|'),
      format: 'json',
    })
    const d = await fetchRetry(`${COMMONS_API}?${params}`, { as: 'json' })
    for (const p of Object.values(d.query.pages)) {
      const vi = p.videoinfo?.[0]
      if (!vi) continue
      const mp3 = vi.derivatives?.find((x) => x.type === 'audio/mpeg')?.src
      out.set(p.title, {
        mp3,
        license: vi.extmetadata?.LicenseShortName?.value ?? '',
        licenseUrl: vi.extmetadata?.LicenseUrl?.value ?? '',
        page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      })
    }
    await sleep(1500)
  }
  return out
}

// ---------- Auswahl ----------

const sets = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sets', 'index.json'), 'utf8'))
const words = new Map()
for (const set of sets) {
  for (const w of JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sets', `${set.id}.json`), 'utf8')).words) {
    words.set(keyOf(w), { ...w, set: set.id })
  }
}

const chosen = new Map() // key -> entry
const rejected = []
const llCandidates = []
for (const [key, w] of words) {
  if (cmnWords.has(w.s) && tanMatches(w)) {
    chosen.set(key, { word: w, src: 'tan', url: `https://raw.githubusercontent.com/${AUDIO_CMN}/${cmn.commit}/64k/hsk/cmn-${encodeURIComponent(w.s)}.mp3` })
    continue
  }
  if (cmnWords.has(w.s)) rejected.push(`${w.s} [${displayPinyin(w.n)}]: Aufnahme von Yue Tan hat andere Lesung (${(tanReadings.get(w.s) ?? ['?']).join(', ')})`)
  const ll = llByWord.get(w.s)
  if (ll?.length && unambiguous(w)) llCandidates.push({ key, w, files: ll })
  else if (ll?.length) rejected.push(`${w.s}: Lingua-Libre-Aufnahme vorhanden, aber Lesung nicht eindeutig prüfbar`)
}

const meta = await llMetadata(llCandidates.flatMap((c) => c.files.map((f) => f.title)))
for (const c of llCandidates) {
  const ranked = c.files
    .map((f) => ({ ...f, ...meta.get(f.title) }))
    .filter((f) => f.mp3 && LL_LICENSES.includes(f.license))
    .sort((a, b) => LL_LICENSES.indexOf(a.license) - LL_LICENSES.indexOf(b.license) || (speakerCount.get(b.speaker) ?? 0) - (speakerCount.get(a.speaker) ?? 0))
  const f = ranked[0]
  if (!f) {
    rejected.push(`${c.w.s}: keine Lingua-Libre-Datei mit passender Lizenz`)
    continue
  }
  chosen.set(c.key, { word: c.w, src: 'll', url: f.mp3, author: f.speaker, license: f.license, licenseUrl: f.licenseUrl, page: f.page })
}

// ---------- Herunterladen ----------

fs.mkdirSync(AUDIO_DIR, { recursive: true })
const jobs = [...chosen.values()].filter((e) => refresh || !fs.existsSync(path.join(AUDIO_DIR, fileOf(e.word))))
let done = 0
async function worker() {
  while (jobs.length) {
    const e = jobs.shift()
    const buf = await fetchRetry(e.url, { as: 'buffer' })
    fs.writeFileSync(path.join(AUDIO_DIR, fileOf(e.word)), buf)
    done++
    if (e.src === 'll') await sleep(500)
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
console.log(`${done} Audiodateien heruntergeladen`)

// ---------- KI-Stimme für die Lücken ----------
// Nur Wörter ohne echte Aufnahme; Quelle "ai" (in der App mit „KI“-Abzeichen gekennzeichnet).

const missingReal = [...words.values()].filter((w) => !chosen.has(keyOf(w)))
const aiFile = (w) => `${hex(w.s)}_${toneSearchKey(w.n)}.ki.mp3`
if (!noAi) {
  const todo = missingReal.filter((w) => refresh || !fs.existsSync(path.join(AUDIO_DIR, aiFile(w))))
  if (todo.length && fs.existsSync(AI.python)) {
    console.log(`KI-Stimme (${AI.model}, ${AI.voice}) für ${todo.length} Wörter …`)
    const r = spawnSync(AI.python, [path.join(ROOT, 'scripts', 'tts', 'ki_aussprache.py'), '--out', AUDIO_DIR, '--voice', AI.voice], {
      input: JSON.stringify(todo.map((w) => ({ s: w.s, n: normalizeNumeric(w.n), id: aiFile(w).slice(0, -4) }))),
      stdio: ['pipe', 'ignore', 'inherit'],
      cwd: ROOT,
    })
    if (r.status !== 0) console.warn(`KI-Erzeugung fehlgeschlagen (Status ${r.status})`)
  } else if (todo.length) {
    console.warn(`Hinweis: ${todo.length} Wörter ohne KI-Aussprache – Python-Umgebung .venv-tts fehlt (siehe scripts/tts/ki_aussprache.py)`)
  }
  for (const w of missingReal) {
    if (fs.existsSync(path.join(AUDIO_DIR, aiFile(w)))) chosen.set(keyOf(w), { word: w, src: 'ai' })
  }
}

// ---------- Index, Namensnennung, Fehlliste ----------

const index = {
  sources: {
    tan: {
      name: 'Yue Tan (Universität Caen, Shtooka-Projekt)',
      license: 'CC BY-SA 3.0 US',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/us/',
      url: 'https://github.com/hugolpz/audio-cmn',
      note: 'aus FLAC in MP3 (64 kbit/s) umgewandelt durch audio-cmn',
    },
    ll: {
      name: 'Lingua Libre (Wikimedia Commons)',
      url: 'https://lingualibre.org',
      note: 'MP3-Fassung von Wikimedia Commons',
    },
    ai: {
      name: `KI-Stimme: ${AI.model} (Stimme ${AI.voice})`,
      license: 'Apache 2.0',
      licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
      url: 'https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh',
      note: 'synthetisch erzeugt, keine echte Aufnahme; Lesung aus unserem Pinyin vorgegeben',
    },
  },
  words: {},
}
const credits = ['Namensnennung für die Audiodateien in diesem Ordner', '']
for (const [key, e] of [...chosen.entries()].sort()) {
  const entry = { f: e.src === 'ai' ? aiFile(e.word) : fileOf(e.word), s: e.src }
  if (e.src === 'll') Object.assign(entry, { a: e.author, l: e.license, p: e.page })
  index.words[key] = entry
  credits.push(
    e.src === 'tan'
      ? `${entry.f}\t${e.word.s}\tYue Tan, Universität Caen / Shtooka – CC BY-SA 3.0 US – via audio-cmn (in MP3 umgewandelt)`
      : e.src === 'll'
        ? `${entry.f}\t${e.word.s}\t${e.author} – ${e.license} – ${e.page} (MP3-Fassung von Wikimedia Commons)`
        : `${entry.f}\t${e.word.s}\tKI-Stimme ${AI.model} (${AI.voice}), Apache 2.0 – synthetisch erzeugt, keine echte Aufnahme`,
  )
}
fs.writeFileSync(path.join(DATA_DIR, 'audio.json'), JSON.stringify(index))
fs.writeFileSync(path.join(AUDIO_DIR, 'CREDITS.txt'), credits.join('\n') + '\n')

// nicht mehr verwendete Dateien entfernen (z. B. KI-Datei, wenn inzwischen eine echte Aufnahme existiert)
const used = new Set(Object.values(index.words).map((e) => e.f))
for (const f of fs.readdirSync(AUDIO_DIR)) {
  if (f.endsWith('.mp3') && !used.has(f)) fs.rmSync(path.join(AUDIO_DIR, f))
}

fs.writeFileSync(
  path.join(ROOT, 'data', 'audio-missing.txt'),
  '# Wörter ohne echte freie Aufnahme – können z. B. auf https://lingualibre.org eingesprochen werden.\n' +
    '# Spalten: Wort, Pinyin, Set, derzeit in der App (KI = KI-Stimme, - = ohne Ton)\n' +
    missingReal.map((w) => `${w.s}\t${displayPinyin(w.n)}\t${w.set}\t${chosen.has(keyOf(w)) ? 'KI' : '-'}`).join('\n') +
    '\n',
)

for (const set of sets) {
  const all = [...words.values()].filter((w) => w.set === set.id)
  const has = all.filter((w) => chosen.has(keyOf(w)))
  const count = (src) => has.filter((w) => chosen.get(keyOf(w)).src === src).length
  console.log(
    `${set.name}: ${has.length}/${all.length} mit Aussprache – echt ${count('tan') + count('ll')} (Yue Tan ${count('tan')}, Lingua Libre ${count('ll')}), KI ${count('ai')}`,
  )
}
console.log(`ohne echte Aufnahme (${missingReal.length}): ${missingReal.map((w) => w.s).join(' ')}`)
if (rejected.length) console.log('\nAussortiert:\n  - ' + rejected.join('\n  - '))
