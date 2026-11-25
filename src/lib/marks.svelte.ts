// Markierte (⚑) und ausgeblendete Wörter – je Wort, unabhängig vom Deck (wie der Lernstand).
// Gespeichert in IndexedDB (meta „marks“) und in der Sicherungsdatei; beim Zusammenführen gewinnt die neuere Änderung.
import { getMeta, setMeta } from './db'
import { wordKey, type Word } from './types'

export interface Mark {
  /** markiert, z. B. als Problemwort – landet im automatischen Deck „Markiert“ */
  flag?: boolean
  /** ausgeblendet: kommt beim Üben und im Zeichenmodus nicht mehr dran, bis es wieder eingeblendet wird */
  hidden?: boolean
  /** letzte Änderung (ms) – entscheidet beim Zusammenführen von Sicherungen */
  at: number
  /** das Wort selbst, damit „Markiert“ Wörter aus jedem Deck (auch aus dem Wörterbuch) zeigen kann */
  word: Word
}

/** Kennung des automatischen Decks „Markiert“ (lib/srs.ts, views/Deck.svelte) */
export const FLAGGED = 'markiert'

export const marks = $state({ map: {} as Record<string, Mark> })

export async function loadMarks() {
  marks.map = (await getMeta<Record<string, Mark>>('marks')) ?? {}
}

export function isFlagged(w: Word): boolean {
  return !!marks.map[wordKey(w)]?.flag
}

export function isHidden(w: Word): boolean {
  return !!marks.map[wordKey(w)]?.hidden
}

/** Markieren bzw. Ausblenden setzen oder aufheben */
export async function setMark(w: Word, change: { flag?: boolean; hidden?: boolean }) {
  const k = wordKey(w)
  const prev = marks.map[k]
  const word: Word = { s: w.s, n: w.n, m: w.m, ...(w.x ? { x: w.x } : {}), ...(w.h ? { h: w.h } : {}), ...(w.a?.length ? { a: [...w.a] } : {}) }
  marks.map[k] = { flag: prev?.flag, hidden: prev?.hidden, ...change, at: Date.now(), word }
  await setMeta('marks', marks.map)
}

/** alle markierten Wörter (auch ausgeblendete – geübt werden die nicht, siehe lib/srs.ts) */
export function flaggedWords(): Word[] {
  return Object.values(marks.map)
    .filter((m) => m.flag)
    .sort((a, b) => b.at - a.at)
    .map((m) => m.word)
}

/** Markierungen aus einer Sicherung übernehmen: ersetzen oder je Wort die neuere Änderung behalten */
export async function importMarks(incoming: Record<string, Mark> | undefined, replace: boolean) {
  const next: Record<string, Mark> = replace ? {} : { ...marks.map }
  for (const [k, m] of Object.entries(incoming ?? {})) {
    if (!m || typeof m.at !== 'number' || typeof m.word?.s !== 'string') continue
    if (replace || !next[k] || m.at > next[k].at) next[k] = m
  }
  marks.map = next
  await setMeta('marks', next)
}
