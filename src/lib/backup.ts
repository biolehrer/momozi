// Sicherung des Lernstands als Datei und Teilen einzelner Decks.
// Nichts wird hochgeladen: Die Datei geht über das Teilen-Menü des Geräts (Dateien, iCloud, AirDrop …)
// oder wird heruntergeladen.
import { allCards, allDecks, db, getMeta, setMeta } from './db'
import { app, createDeck, DEFAULT_SETTINGS, saveDeck, saveSettings, setActive } from './state.svelte'
import { migrateData, migrateWords } from './migrate'
import { importMarks, marks, type Mark } from './marks.svelte'
import { refreshStreak } from './streak.svelte'
import { today } from './srs'
import { wordKey, type CardRecord, type CustomDeck, type ReviewLogRecord, type Settings, type Word } from './types'

// Kennung im Dateiformat – bleibt vom früheren App-Namen, damit alte Sicherungen und geteilte Decks weiter lesbar sind
const APP = 'zeichenweise'
const DAY = 86_400_000

export interface BackupFile {
  app: typeof APP
  type: 'backup'
  version: 1
  created: string
  settings: Settings
  decks: CustomDeck[]
  cards: CardRecord[]
  log: ReviewLogRecord[]
  /** markierte und ausgeblendete Wörter (seit 0.9.0, fehlt in älteren Sicherungen) */
  marks?: Record<string, Mark>
}

export interface DeckFile {
  app: typeof APP
  type: 'deck'
  version: 1
  created: string
  deck: { name: string; words: Word[] }
}

// ---------- Erstellen ----------

export async function buildBackup(): Promise<BackupFile> {
  const d = await db()
  const [decks, cards, log] = await Promise.all([allDecks(), allCards(), d.getAll('log')])
  return {
    app: APP,
    type: 'backup',
    version: 1,
    created: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(app.settings)) as Settings,
    decks,
    cards,
    log,
    marks: JSON.parse(JSON.stringify(marks.map)) as Record<string, Mark>,
  }
}

export function backupFilename(): string {
  return `momozi-sicherung-${today()}.json`
}

function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9㐀-鿿]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'deck'
  )
}

export function deckFile(deck: CustomDeck): { name: string; text: string } {
  const file: DeckFile = {
    app: APP,
    type: 'deck',
    version: 1,
    created: new Date().toISOString(),
    deck: { name: deck.name, words: JSON.parse(JSON.stringify(deck.words)) as Word[] },
  }
  return { name: `deck-${slug(deck.name)}.json`, text: JSON.stringify(file, null, 1) }
}

/**
 * Datei über das Teilen-Menü anbieten (Handy) oder herunterladen (Computer).
 * Muss direkt aus einem Tippen heraus aufgerufen werden – Inhalt also vorher vorbereiten.
 */
export async function shareText(filename: string, text: string, title: string): Promise<'shared' | 'downloaded' | 'aborted'> {
  const file = new File([text], filename, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'aborted'
      // sonst: Herunterladen versuchen
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return 'downloaded'
}

// ---------- Einlesen ----------

const CJK = /^[㐀-鿿豈-﫿]+$/

function cleanWords(list: unknown): Word[] {
  if (!Array.isArray(list)) return []
  const out: Word[] = []
  for (const w of list as Partial<Word>[]) {
    if (!w || typeof w.s !== 'string' || !CJK.test(w.s) || typeof w.m !== 'string') continue
    const word: Word = { s: w.s, n: typeof w.n === 'string' ? w.n : '', m: w.m.slice(0, 200) }
    if (typeof w.x === 'string') word.x = w.x.slice(0, 600)
    if (Array.isArray(w.a)) {
      const a = w.a.filter((x): x is string => typeof x === 'string' && x.length <= 40).slice(0, 6)
      if (a.length) word.a = a
    }
    if (w.noTones) word.noTones = true
    out.push(word)
  }
  return out
}

interface LooseFile {
  app?: unknown
  version?: unknown
  type?: unknown
  created?: unknown
  deck?: { name?: unknown; words?: unknown }
  cards?: unknown
  decks?: unknown
}

export function parseFile(text: string): BackupFile | DeckFile {
  let data: LooseFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Diese Datei konnte nicht gelesen werden – ist es eine Momozì-Datei?')
  }
  if (data?.app !== APP) throw new Error('Das ist keine Momozì-Datei.')
  if (data.version !== 1) throw new Error('Diese Datei stammt aus einer neueren Version der App.')
  if (data.type === 'deck') {
    const words = cleanWords(data.deck?.words)
    if (!words.length) throw new Error('In diesem Deck sind keine Wörter.')
    return { app: APP, type: 'deck', version: 1, created: String(data.created ?? ''), deck: { name: String(data.deck?.name ?? 'Deck').slice(0, 60), words } }
  }
  if (data.type === 'backup') {
    if (!Array.isArray(data.cards) || !Array.isArray(data.decks)) throw new Error('Die Sicherung ist unvollständig.')
    return data as unknown as BackupFile
  }
  throw new Error('Unbekannter Dateityp.')
}

// ---------- Importieren ----------

export interface ImportSummary {
  decksAdded: number
  decksUpdated: number
  cardsAdded: number
  cardsUpdated: number
}

function reviveCard(c: CardRecord): CardRecord {
  const f = c.fsrs as unknown as Record<string, unknown>
  return {
    ...c,
    fsrs: {
      ...c.fsrs,
      due: new Date(f.due as string),
      last_review: f.last_review ? new Date(f.last_review as string) : undefined,
    },
  }
}

function lastReview(c: CardRecord): number {
  return c.fsrs.last_review ? new Date(c.fsrs.last_review).getTime() : 0
}

/**
 * merge: für jede Karte gewinnt der neuere Lernstand, Decks werden vereinigt, Einstellungen bleiben.
 * replace: das Gerät übernimmt genau den Stand der Sicherung.
 */
export async function importBackup(b: BackupFile, mode: 'merge' | 'replace'): Promise<ImportSummary> {
  const d = await db()
  const sum: ImportSummary = { decksAdded: 0, decksUpdated: 0, cardsAdded: 0, cardsUpdated: 0 }
  const decks = b.decks.map((x) => ({ ...x, words: cleanWords(x.words) }))
  const cards = b.cards.map(reviveCard)

  if (mode === 'replace') {
    const tx = d.transaction(['decks', 'cards', 'log', 'meta'], 'readwrite')
    await Promise.all([tx.objectStore('decks').clear(), tx.objectStore('cards').clear(), tx.objectStore('log').clear()])
    for (const deck of decks) await tx.objectStore('decks').put(deck)
    for (const c of cards) await tx.objectStore('cards').put(c)
    for (const l of b.log ?? []) await tx.objectStore('log').add(l)
    await tx.objectStore('meta').delete('session')
    await tx.done
    sum.decksAdded = decks.length
    sum.cardsAdded = cards.length
    app.settings = { ...DEFAULT_SETTINGS, ...b.settings, types: { ...DEFAULT_SETTINGS.types, ...b.settings?.types } }
  } else {
    const localDecks = new Map((await allDecks()).map((x) => [x.id, x]))
    const localCards = new Map((await allCards()).map((x) => [x.id, x]))
    const localLog = new Set((await d.getAll('log')).map((l) => `${l.cardId}|${l.at}`))
    const tx = d.transaction(['decks', 'cards', 'log'], 'readwrite')
    for (const deck of decks) {
      const local = localDecks.get(deck.id)
      if (!local) {
        await tx.objectStore('decks').put(deck)
        sum.decksAdded++
        continue
      }
      const keys = new Set(local.words.map(wordKey))
      const extra = deck.words.filter((w) => !keys.has(wordKey(w)))
      if (extra.length) {
        await tx.objectStore('decks').put({ ...local, words: [...local.words, ...extra] })
        sum.decksUpdated++
      }
    }
    for (const c of cards) {
      const local = localCards.get(c.id)
      if (!local) {
        await tx.objectStore('cards').put(c)
        sum.cardsAdded++
      } else if (lastReview(c) > lastReview(local) || (lastReview(c) === lastReview(local) && c.fsrs.reps > local.fsrs.reps)) {
        await tx.objectStore('cards').put(c)
        sum.cardsUpdated++
      }
    }
    for (const l of b.log ?? []) {
      if (!localLog.has(`${l.cardId}|${l.at}`)) await tx.objectStore('log').add(l)
    }
    await tx.done
    // neu hinzugekommene Decks so aktiv schalten wie in der Sicherung
    const active = new Set(app.settings.activeDecks)
    for (const deck of decks) if (!localDecks.has(deck.id) && b.settings?.activeDecks?.includes(deck.id)) active.add(deck.id)
    app.settings.activeDecks = [...active]
  }
  await saveSettings()
  await importMarks(b.marks, mode === 'replace')
  await refreshStreak()
  // Sicherungen aus älteren Versionen auf den aktuellen Datenstand bringen
  await migrateData(true).catch((e) => console.warn('Datenanpassung übersprungen:', e))
  app.decks = (await allDecks()).sort((a, b2) => a.createdAt - b2.createdAt)
  return sum
}

/** Geteiltes Deck als neues eigenes Deck übernehmen */
export async function importDeck(f: DeckFile): Promise<CustomDeck> {
  let name = f.deck.name.trim() || 'Deck'
  const names = new Set(app.decks.map((x) => x.name))
  if (names.has(name)) {
    let i = 2
    while (names.has(`${name} (${i})`)) i++
    name = `${name} (${i})`
  }
  const deck = { ...createDeck(name), words: await migrateWords(f.deck.words).catch(() => f.deck.words) }
  await saveDeck(deck)
  await setActive(deck.id, true)
  return deck
}

// ---------- Erinnerung ----------

export interface BackupStatus {
  lastAt: number | null
  /** Bewertungen seit der letzten Sicherung */
  reviewsSince: number
  firstReviewAt: number | null
}

export async function backupStatus(): Promise<BackupStatus> {
  const lastAt = (await getMeta<number>('lastBackup')) ?? null
  const log = await (await db()).getAll('log')
  let firstReviewAt: number | null = null
  let reviewsSince = 0
  for (const l of log) {
    if (firstReviewAt === null || l.at < firstReviewAt) firstReviewAt = l.at
    if (!lastAt || l.at > lastAt) reviewsSince++
  }
  return { lastAt, reviewsSince, firstReviewAt }
}

export async function markBackedUp() {
  await setMeta('lastBackup', Date.now())
}

/**
 * Erinnern nur, wenn es wirklich etwas zu sichern gibt:
 * mind. 30 Bewertungen seit der letzten Sicherung UND
 * (noch nie gesichert und seit 3 Tagen dabei) bzw. (letzte Sicherung älter als 14 Tage).
 */
/** Sicherung empfohlen: ≥ 30 Bewertungen seit der letzten Sicherung und 14 Tage her (ohne Sicherung: 3 Tage seit dem ersten Üben) */
function isDue(s: BackupStatus): boolean {
  if (s.reviewsSince < 30) return false
  const since = s.lastAt ?? s.firstReviewAt
  if (!since) return false
  return Date.now() - since >= (s.lastAt ? 14 : 3) * DAY
}

export async function needsBackup(): Promise<BackupStatus | null> {
  if (!app.settings.backupReminder) return null
  const s = await backupStatus()
  return isDue(s) ? s : null
}

/** so lange bleibt das Schild nach einer Sicherung grün */
const FRESH_DAYS = 7

/**
 * Zustand des Schild-Symbols auf der Startseite (zurückhaltend in Pastell):
 *  fresh – in den letzten 7 Tagen gesichert (grün mit Häkchen)
 *  due   – Sicherung empfohlen, wie bei der Erinnerungskarte (rot mit „!“; nur mit eingeschalteter Erinnerung)
 *  idle  – sonst (grau)
 */
export type BackupLevel = 'fresh' | 'due' | 'idle'

export async function backupLevel(): Promise<{ level: BackupLevel; status: BackupStatus }> {
  const s = await backupStatus()
  let level: BackupLevel = 'idle'
  if (app.settings.backupReminder && isDue(s)) level = 'due'
  else if (s.lastAt && Date.now() - s.lastAt < FRESH_DAYS * DAY) level = 'fresh'
  return { level, status: s }
}

/** Wie needsBackup, aber die Hinweiskarte lässt sich für ein paar Tage wegtippen */
export async function shouldRemind(): Promise<BackupStatus | null> {
  const snooze = await getMeta<number>('backupSnoozeUntil')
  if (snooze && Date.now() < snooze) return null
  return needsBackup()
}

export async function snoozeReminder(days = 7) {
  await setMeta('backupSnoozeUntil', Date.now() + days * DAY)
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}
