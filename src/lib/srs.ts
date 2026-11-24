// Spaced Repetition mit FSRS (ts-fsrs). Jede Abfrageart eines Wortes ist eine eigene Karte.
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'
import { allCards, cardsForWord, db, delMeta, getMeta, setMeta } from './db'
import { loadSet } from './data'
import { app } from './state.svelte'
import { tonesOf } from './pinyin'
import { orderSession, type DueCard } from './order'
import { FLAGGED, flaggedWords, isHidden } from './marks.svelte'
import { QUIZ_TYPES, wordKey, type CardRecord, type QuizType, type Session, type Word } from './types'

const scheduler = fsrs({ enable_fuzz: true, request_retention: 0.9 })

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function endOfToday(): number {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * Fällig? Wiederholungen (Tagesabstände) zählen ab ihrem Fälligkeitstag,
 * Karten in der Lernphase (Minutenabstände) erst ab ihrer genauen Zeit.
 */
function isDue(c: CardRecord | undefined, now: number, end: number): boolean {
  if (!c) return true
  const due = c.fsrs.due.getTime()
  return c.fsrs.state === State.Review ? due <= end : due <= now
}

export function cardId(key: string, type: QuizType): string {
  return `${key}#${type}`
}

/** Wie wahrscheinlich man die Karte jetzt noch weiß (0–1, neue Karten 0) – nur lesen, ändert nichts */
export function retrievability(c: CardRecord, now = new Date()): number {
  return scheduler.retrievability(c.fsrs, now)
}

export function toneQuizPossible(w: Word): boolean {
  if (!w.n || w.noTones) return false
  const t = tonesOf(w.n)
  return t.length === [...w.s].length && t.some((x) => x !== null)
}

/** Abfragearten, die für dieses Wort aktiv und möglich sind */
export function typesFor(w: Word): QuizType[] {
  return QUIZ_TYPES.filter((t) => {
    if (!app.settings.types[t]) return false
    if (t === 'tone') return toneQuizPossible(w)
    if (t === 'pinyin') return !!w.n
    return true
  })
}

/** Wörter eines Decks (eigenes Deck oder HSK-Set) */
export async function wordsOfDeck(id: string): Promise<Word[]> {
  if (id === FLAGGED) return flaggedWords()
  const custom = app.decks.find((d) => d.id === id)
  if (custom) return custom.words
  if (app.sets.some((s) => s.id === id)) return (await loadSet(id)).words
  return []
}

/** Alle Wörter der aktiven Decks, ohne Doppelte */
export async function activeWords(): Promise<Word[]> {
  return wordsOfDecks(app.settings.activeDecks)
}

async function wordsOfDecks(ids: string[]): Promise<Word[]> {
  const out: Word[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const words = await wordsOfDeck(id)
    for (const w of words) {
      const k = wordKey(w)
      if (!seen.has(k)) {
        seen.add(k)
        out.push(w)
      }
    }
  }
  return out
}

async function cardMap(): Promise<Map<string, CardRecord>> {
  return new Map((await allCards()).map((c) => [c.id, c]))
}

export async function introducedToday(): Promise<number> {
  return (await getMeta<number>('intro:' + today())) ?? 0
}

export interface Overview {
  due: number
  newToday: number
  learned: number
  total: number
}

/** Überblick über die aktiven Decks – oder nur über ein Deck (dann ohne Tageslimit für neue Wörter) */
export async function overview(deckId?: string): Promise<Overview> {
  const [all, cards, intro] = await Promise.all([deckId ? wordsOfDecks([deckId]) : activeWords(), cardMap(), introducedToday()])
  // ausgeblendete Wörter zählen nicht mit; das Deck „Markiert“ übt alle seine Karten, auch nicht fällige
  const words = all.filter((w) => !isHidden(w))
  const everything = deckId === FLAGGED
  const end = endOfToday()
  const now = Date.now()
  let due = 0
  let fresh = 0
  let learned = 0
  for (const w of words) {
    const k = wordKey(w)
    const types = typesFor(w)
    const existing = types.map((t) => cards.get(cardId(k, t)))
    if (existing.every((c) => !c)) {
      fresh++
      continue
    }
    learned++
    for (const c of existing) if (everything || isDue(c, now, end)) due++
  }
  const newToday = deckId ? fresh : Math.max(0, Math.min(fresh, app.settings.newPerDay - intro))
  return { due, newToday, learned, total: words.length }
}

/**
 * Übungssitzung: fällige Karten + neue Wörter, angeordnet von orderSession() (lib/order.ts).
 * Mit deckId nur dieses Deck – dann alle neuen Wörter des Decks (z. B. Vokabeln der letzten Kursstunde).
 */
export async function buildSession(deckId?: string): Promise<Session> {
  const [all, cards, intro] = await Promise.all([deckId ? wordsOfDecks([deckId]) : activeWords(), cardMap(), introducedToday()])
  const words = all.filter((w) => !isHidden(w))
  const everything = deckId === FLAGGED
  const end = endOfToday()
  const now = Date.now()
  const due: DueCard[] = []
  const fresh: Word[] = []
  for (const w of words) {
    const k = wordKey(w)
    const types = typesFor(w)
    const existing = types.map((t) => cards.get(cardId(k, t)))
    if (existing.every((c) => !c)) {
      fresh.push(w)
      continue
    }
    types.forEach((type, i) => {
      const c = existing[i]
      if (everything || isDue(c, now, end)) due.push({ item: { kind: 'quiz', word: w, type }, at: c ? c.fsrs.due.getTime() : 0 })
    })
  }
  const limit = deckId ? Infinity : Math.max(0, app.settings.newPerDay - intro)
  const items = orderSession(due, fresh.slice(0, limit).map((word) => ({ word, types: typesFor(word) })))
  return { date: today(), deckId, items, index: 0, charIndex: 0, stats: { good: 0, again: 0, learned: 0 } }
}

export async function loadSession(): Promise<Session | undefined> {
  return getMeta<Session>('session')
}

export async function saveSession(s: Session) {
  await setMeta('session', s)
}

export async function clearSession() {
  await delMeta('session')
}

/** Offene Sitzung von heute mit verbleibenden Aufgaben? */
export async function resumableSession(): Promise<Session | undefined> {
  const s = await loadSession()
  if (s && s.date === today() && s.index < s.items.length) return s
  return undefined
}

/** Alles, was nötig ist, um eine Bewertung zurückzunehmen (Übung: „Rückgängig“) */
export interface RatingUndo {
  id: string
  /** Karte vor der Bewertung (undefined: gab es noch nicht) */
  prev: CardRecord | undefined
  logKey: number
}

/** Bewertung speichern: grade 1 = nochmal, 3 = gewusst */
export async function rateCard(word: Word, type: QuizType, grade: 1 | 3): Promise<RatingUndo> {
  const k = wordKey(word)
  const id = cardId(k, type)
  const d = await db()
  const existing = await d.get('cards', id)
  const now = new Date()
  const { card } = scheduler.next(existing?.fsrs ?? createEmptyCard(now), now, grade === 1 ? Rating.Again : Rating.Good)
  const rec: CardRecord = { id, wordKey: k, type, fsrs: card, createdAt: existing?.createdAt ?? now.getTime() }
  const tx = d.transaction(['cards', 'log'], 'readwrite')
  const [, logKey] = await Promise.all([
    tx.objectStore('cards').put(rec),
    tx.objectStore('log').add({ cardId: id, type, rating: grade, at: now.getTime() }),
    tx.done,
  ])
  return { id, prev: existing, logKey }
}

/** Bewertung zurücknehmen: Karte genau wie vorher, Eintrag im Protokoll weg */
export async function undoRating(u: RatingUndo) {
  const d = await db()
  const tx = d.transaction(['cards', 'log'], 'readwrite')
  await Promise.all([
    u.prev ? tx.objectStore('cards').put(u.prev) : tx.objectStore('cards').delete(u.id),
    tx.objectStore('log').delete(u.logKey),
    tx.done,
  ])
}

/** Neues Wort gilt als eingeführt: leere Karten anlegen, Tageszähler erhöhen. Gibt die neu angelegten Karten zurück. */
export async function markIntroduced(word: Word): Promise<string[]> {
  const d = await db()
  const k = wordKey(word)
  const now = new Date()
  const created: string[] = []
  const tx = d.transaction('cards', 'readwrite')
  for (const type of typesFor(word)) {
    const id = cardId(k, type)
    if (!(await tx.store.get(id))) {
      await tx.store.put({ id, wordKey: k, type, fsrs: createEmptyCard(now), createdAt: now.getTime() })
      created.push(id)
    }
  }
  await tx.done
  await setMeta('intro:' + today(), (await introducedToday()) + 1)
  return created
}

/** Kennenlernen zurücknehmen: angelegte (leere) Karten löschen, Tageszähler wieder senken */
export async function undoIntroduced(created: string[]) {
  const d = await db()
  const tx = d.transaction('cards', 'readwrite')
  for (const id of created) await tx.store.delete(id)
  await tx.done
  await setMeta('intro:' + today(), Math.max(0, (await introducedToday()) - 1))
}

export async function wordProgress(word: Word): Promise<Map<QuizType, CardRecord>> {
  const list = await cardsForWord(wordKey(word))
  return new Map(list.map((c) => [c.type, c]))
}

export async function introducedKeys(): Promise<Set<string>> {
  return new Set((await allCards()).map((c) => c.wordKey))
}
