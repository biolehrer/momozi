// Lernstand an korrigierte Wortdaten anpassen (Tabelle: public/data/migrations.json,
// erzeugt von scripts/build-migrations.mjs):
//   - Karten und Verlauf von alten Wortschlüsseln auf neue umschreiben (z. B. 一起 yī qǐ -> yì qǐ)
//   - Kopien in eigenen Decks auffrischen: Lesung, weitere Bedeutungen (samt Kennzeichen h), weitere richtige Lesungen und –
//     nur wenn sie noch der früheren Fassung entspricht – die Kurzbedeutung (selbst geänderte bleiben)
// Läuft einmal je Version der Tabelle, außerdem nach dem Einspielen einer Sicherung.
import { db, getMeta } from './db'
import { loadSet, loadSetIndex } from './data'
import { wordKey, type CardRecord, type Word } from './types'

interface Migrations {
  version: number
  keys: Record<string, string>
  meanings: Record<string, string[]>
}

const BASE = import.meta.env.BASE_URL
let migrations: Promise<Migrations | null> | null = null

function loadMigrations(): Promise<Migrations | null> {
  migrations ??= fetch(`${BASE}data/migrations.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Migrations>) : null))
    .catch(() => null)
  return migrations
}

async function setWords(): Promise<Map<string, Word>> {
  const out = new Map<string, Word>()
  for (const s of await loadSetIndex()) {
    for (const w of (await loadSet(s.id)).words) if (!out.has(wordKey(w))) out.set(wordKey(w), w)
  }
  return out
}

function refreshWord(w: Word, mig: Migrations, sets: Map<string, Word>): Word {
  const key = mig.keys[wordKey(w)] ?? wordKey(w)
  const sw = sets.get(key)
  if (!sw) return w
  const out: Word = { ...w, n: sw.n }
  if (w.m === sw.m || mig.meanings[key]?.includes(w.m)) out.m = sw.m
  if (sw.x) out.x = sw.x
  else delete out.x
  if (sw.h) out.h = sw.h
  else delete out.h
  if (sw.a?.length) out.a = sw.a
  else delete out.a
  return out
}

function dedupe(words: Word[]): Word[] {
  const seen = new Set<string>()
  return words.filter((w) => !seen.has(wordKey(w)) && !!seen.add(wordKey(w)))
}

const lastReview = (c: CardRecord) => (c.fsrs.last_review ? new Date(c.fsrs.last_review).getTime() : 0)

/** Wörter eines geteilten Decks oder einer Sicherung auf den aktuellen Datenstand bringen */
export async function migrateWords(words: Word[]): Promise<Word[]> {
  const mig = await loadMigrations()
  if (!mig) return words
  const sets = await setWords()
  return dedupe(words.map((w) => refreshWord(w, mig, sets)))
}

export async function migrateData(force = false): Promise<void> {
  const mig = await loadMigrations()
  if (!mig) return
  if (!force && (await getMeta<number>('migrations')) === mig.version) return
  const d = await db()
  const cards = await d.getAll('cards')
  const decks = await d.getAll('decks')
  // Nur laden, was gebraucht wird: ohne Lernstand und ohne Deck-Wörter gibt es nichts umzuschreiben
  const sets = cards.length || decks.some((x) => x.words.length) ? await setWords() : new Map<string, Word>()

  const tx = d.transaction(['cards', 'log', 'decks', 'meta'], 'readwrite')
  const store = tx.objectStore('cards')
  const byId = new Map(cards.map((c) => [c.id, c]))
  const renamed = new Map<string, string>()
  for (const c of cards) {
    const target = mig.keys[c.wordKey]
    if (!target) continue
    const id = `${target}#${c.type}`
    renamed.set(c.id, id)
    await store.delete(c.id)
    const existing = byId.get(id)
    // beide Fassungen geübt: die mit dem neueren bzw. größeren Lernstand behalten
    if (existing && (lastReview(existing) > lastReview(c) || (lastReview(existing) === lastReview(c) && existing.fsrs.reps >= c.fsrs.reps))) continue
    const moved: CardRecord = { ...c, id, wordKey: target }
    byId.set(id, moved)
    await store.put(moved)
  }
  if (renamed.size) {
    let cursor = await tx.objectStore('log').openCursor()
    while (cursor) {
      const id = renamed.get(cursor.value.cardId)
      if (id) await cursor.update({ ...cursor.value, cardId: id })
      cursor = await cursor.continue()
    }
  }
  for (const deck of decks) {
    const words = dedupe(deck.words.map((w) => refreshWord(w, mig, sets)))
    if (JSON.stringify(words) !== JSON.stringify(deck.words)) await tx.objectStore('decks').put({ ...deck, words })
  }
  // eine angefangene Übung enthält Kopien mit alter Lesung
  if (renamed.size || sets.size) await tx.objectStore('meta').delete('session')
  await tx.objectStore('meta').put(mig.version, 'migrations')
  await tx.done
}
