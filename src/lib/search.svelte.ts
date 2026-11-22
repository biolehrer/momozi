// Zustand der Suche über das Öffnen eines Wortes hinweg merken:
// Die Suchansicht wird beim Zurückkommen neu aufgebaut, Suchbegriff, Filter,
// Auswahl und Scroll-Position sollen dabei erhalten bleiben.
import type { LibItem } from './library'

export interface SearchState {
  /** Ansicht, zu der der Zustand gehört: "/suche" oder "/auswahl?deck=…" */
  context: string
  query: string
  filter: string
  withDict: boolean
  select: boolean
  limit: number
  target: string
  selected: [string, LibItem][]
  scrollY: number
}

let saved: SearchState | null = null

/** Gemerkten Zustand holen – nur, wenn er zur selben Ansicht gehört */
export function restoreSearch(context: string): SearchState | null {
  return saved && saved.context === context ? saved : null
}

export function rememberSearch(s: SearchState) {
  saved = s
}
