// Spaced Repetition mit FSRS (ts-fsrs). Jede Abfrageart eines Wortes ist eine eigene Karte.
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs'
import { allCards, cardsForWord, db, delMeta, getMeta, setMeta } from './db'
import { loadSet } from './data'
import { app } from './state.svelte'
import { tonesOf } from './pinyin'
import { QUIZ_TYPES, wordKey, type CardRecord, type QuizType, type Session, type SessionItem, type Word } from './types'

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
  const [words, cards, intro] = await Promise.all([deckId ? wordsOfDecks([deckId]) : activeWords(), cardMap(), introducedToday()])
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
    for (const c of existing) if (isDue(c, now, end)) due++
  }
  const newToday = deckId ? fresh : Math.max(0, Math.min(fresh, app.settings.newPerDay - intro))
  return { due, newToday, learned, total: words.length }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Dasselbe Wort möglichst nicht zweimal direkt hintereinander */
function spreadSameWord(items: SessionItem[]): SessionItem[] {
  for (let i = 1; i < items.length; i++) {
    if (items[i].word.s !== items[i - 1].word.s) continue
    const j = items.findIndex((it, idx) => idx > i && it.word.s !== items[i - 1].word.s)
    if (j > 0) [items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/**
 * Übungssitzung: fällige Karten + neue Wörter.
 * Mit deckId nur dieses Deck – dann alle neuen Wörter des Decks (z. B. Vokabeln der letzten Kursstunde).
 */
export async function buildSession(deckId?: string): Promise<Session> {
  const [words, cards, intro] = await Promise.all([deckId ? wordsOfDecks([deckId]) : activeWords(), cardMap(), introducedToday()])
  const end = endOfToday()
  const now = Date.now()
  const due: { item: SessionItem; at: number }[] = []
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
      if (isDue(c, now, end)) due.push({ item: { kind: 'quiz', word: w, type }, at: c ? c.fsrs.due.getTime() : 0 })
    })
  }
  due.sort((a, b) => a.at - b.at)
  const items = spreadSameWord(due.map((d) => d.item))

  // Neue Wörter: erst kennenlernen, die Abfragen dazu kommen versetzt nach dem nächsten neuen Wort
  const limit = deckId ? Infinity : Math.max(0, app.settings.newPerDay - intro)
  let pending: SessionItem[] = []
  for (const w of fresh.slice(0, limit)) {
    items.push({ kind: 'learn', word: w })
    items.push(...pending)
    pending = shuffle(typesFor(w).map((type): SessionItem => ({ kind: 'quiz', word: w, type })))
  }
  items.push(...pending)
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

/** Bewertung speichern: grade 1 = nochmal, 3 = gewusst */
export async function rateCard(word: Word, type: QuizType, grade: 1 | 3): Promise<CardRecord> {
  const k = wordKey(word)
  const id = cardId(k, type)
  const d = await db()
  const existing = await d.get('cards', id)
  const now = new Date()
  const { card } = scheduler.next(existing?.fsrs ?? createEmptyCard(now), now, grade === 1 ? Rating.Again : Rating.Good)
  const rec: CardRecord = { id, wordKey: k, type, fsrs: card, createdAt: existing?.createdAt ?? now.getTime() }
  const tx = d.transaction(['cards', 'log'], 'readwrite')
  await Promise.all([
    tx.objectStore('cards').put(rec),
    tx.objectStore('log').add({ cardId: id, type, rating: grade, at: now.getTime() }),
    tx.done,
  ])
  return rec
}

/** Neues Wort gilt als eingeführt: leere Karten anlegen, Tageszähler erhöhen */
export async function markIntroduced(word: Word) {
  const d = await db()
  const k = wordKey(word)
  const now = new Date()
  const tx = d.transaction('cards', 'readwrite')
  for (const type of typesFor(word)) {
    const id = cardId(k, type)
    if (!(await tx.store.get(id))) {
      await tx.store.put({ id, wordKey: k, type, fsrs: createEmptyCard(now), createdAt: now.getTime() })
    }
  }
  await tx.done
  await setMeta('intro:' + today(), (await introducedToday()) + 1)
}

export async function wordProgress(word: Word): Promise<Map<QuizType, CardRecord>> {
  const list = await cardsForWord(wordKey(word))
  return new Map(list.map((c) => [c.type, c]))
}

export async function introducedKeys(): Promise<Set<string>> {
  return new Set((await allCards()).map((c) => c.wordKey))
}
