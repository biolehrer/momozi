// Erzeugt public/data/migrations.json, damit Lernstände nach Datenkorrekturen erhalten bleiben:
//   keys:     alter Wortschlüssel -> neuer, wenn sich nur die Schreibweise der Lesung geändert hat
//             (die alte Form steht als „auch richtig“ in alternatives.tsv, z. B. 一起 yī qǐ -> yì qǐ)
//   meanings: frühere Kurzbedeutungen je Wort – Kopien in eigenen Decks mit genau dieser Bedeutung
//             werden beim Start aktualisiert (selbst geänderte Bedeutungen bleiben, wie sie sind)
// Echte Lesungsfehler (z. B. 曲 qū -> qǔ) werden bewusst nicht übertragen: Das Wort beginnt neu.
//
// Aufruf nach Datenkorrekturen (vor dem Veröffentlichen):
//   node scripts/build-migrations.mjs <git-Stand der zuletzt veröffentlichten Daten, z. B. HEAD>
// Die Datei wächst mit jeder Korrektur; vorhandene Einträge bleiben erhalten.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeNumeric } from '../src/lib/pinyin.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SETS = path.join(ROOT, 'public', 'data', 'sets')
const OUT = path.join(ROOT, 'public', 'data', 'migrations.json')
const rev = process.argv[2] ?? 'HEAD'

const keyOf = (w) => `${w.s}|${normalizeNumeric(w.n)}`

function gitJson(file) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }))
  } catch {
    return null
  }
}

const old = new Map()
for (const set of gitJson('public/data/sets/index.json') ?? []) {
  for (const w of gitJson(`public/data/sets/${set.id}.json`)?.words ?? []) old.set(keyOf(w), w)
}
const cur = new Map()
for (const set of JSON.parse(fs.readFileSync(path.join(SETS, 'index.json'), 'utf8'))) {
  for (const w of JSON.parse(fs.readFileSync(path.join(SETS, `${set.id}.json`), 'utf8')).words) cur.set(keyOf(w), w)
}
if (!old.size) throw new Error(`Keine alten Daten im git-Stand ${rev} gefunden`)

const mig = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { version: 0, keys: {}, meanings: {} }
let added = 0

for (const [k, w] of cur) {
  for (const alt of w.a ?? []) {
    const ok = `${w.s}|${alt}`
    if (old.has(ok) && !cur.has(ok) && mig.keys[ok] !== k) {
      mig.keys[ok] = k
      added++
    }
  }
}
// Ketten auflösen (a -> b, später b -> c  =>  a -> c), Zyklen verwerfen
for (const o of Object.keys(mig.keys)) {
  let t = mig.keys[o]
  const seen = new Set([o])
  while (mig.keys[t] && !seen.has(t)) {
    seen.add(t)
    t = mig.keys[t]
  }
  if (t === o || !cur.has(t)) delete mig.keys[o]
  else mig.keys[o] = t
}
for (const [k, w] of cur) {
  const sources = [k, ...Object.entries(mig.keys).filter(([, n]) => n === k).map(([o]) => o)]
  for (const ok of sources) {
    const ow = old.get(ok)
    if (!ow || ow.m === w.m) continue
    const list = mig.meanings[k] ?? []
    if (!list.includes(ow.m)) {
      list.push(ow.m)
      mig.meanings[k] = list
      added++
    }
  }
}
if (added) mig.version++
fs.writeFileSync(OUT, JSON.stringify(mig))
console.log(`migrations.json: Version ${mig.version}, ${Object.keys(mig.keys).length} Schlüssel, ${Object.keys(mig.meanings).length} Bedeutungen (${added} neu)`)
