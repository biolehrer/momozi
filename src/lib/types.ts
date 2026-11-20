import type { Card } from 'ts-fsrs'
import { normalizeNumeric } from './pinyin'

export type QuizType = 'write' | 'pinyin' | 'tone' | 'meaning'
export const QUIZ_TYPES: QuizType[] = ['write', 'pinyin', 'tone', 'meaning']
export const QUIZ_LABEL: Record<QuizType, string> = {
  write: 'Schreiben',
  pinyin: 'Pinyin',
  tone: 'Töne',
  meaning: 'Bedeutung',
}
export const QUIZ_HINT: Record<QuizType, string> = {
  write: 'Bedeutung und Pinyin sehen, Zeichen aus dem Gedächtnis schreiben',
  pinyin: 'Zeichen sehen, Aussprache erinnern',
  tone: 'Zeichen sehen, Ton jeder Silbe angeben',
  meaning: 'Zeichen sehen, deutsche Bedeutung erinnern',
}

export interface Word {
  /** vereinfachte Zeichen */
  s: string
  /** Pinyin in Zahlenschreibweise, Silben durch Leerzeichen getrennt ("ni3 hao3"); leer = unbekannt */
  n: string
  /** deutsche Kurzbedeutung */
  m: string
  /** weitere Bedeutungen (Gruppen durch " / " getrennt) */
  x?: string
  /** true, wenn beim manuellen Anlegen keine Töne angegeben wurden */
  noTones?: boolean
}

/** Eindeutiger Schlüssel eines Wortes – Fortschritt hängt am Wort, nicht am Deck */
export function wordKey(w: Word): string {
  return `${w.s}|${w.n ? normalizeNumeric(w.n) : ''}`
}

export interface CustomDeck {
  id: string
  name: string
  words: Word[]
  createdAt: number
}

export interface SetInfo {
  id: string
  name: string
  description: string
  count: number
}

export interface WordSet {
  id: string
  name: string
  description: string
  words: Word[]
}

export interface CardRecord {
  /** `${wordKey}#${type}` */
  id: string
  wordKey: string
  type: QuizType
  fsrs: Card
  createdAt: number
}

export interface ReviewLogRecord {
  cardId: string
  type: QuizType
  /** 1 = nochmal, 3 = gewusst */
  rating: number
  at: number
}

export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  newPerDay: number
  types: Record<QuizType, boolean>
  theme: Theme
  activeDecks: string[]
}

export type SessionItem =
  | { kind: 'learn'; word: Word }
  | { kind: 'quiz'; word: Word; type: QuizType }

export interface Session {
  date: string
  items: SessionItem[]
  index: number
  /** Fortschritt innerhalb eines Wortes beim Schreiben (gespeichert nach jedem Zeichen) */
  charIndex: number
  stats: { good: number; again: number; learned: number }
}
