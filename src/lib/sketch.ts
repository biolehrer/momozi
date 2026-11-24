// Zeichenmodus: gelernte Wörter frei schreiben. Liest den Lernstand nur, verändert ihn nie –
// der Lernplan (FSRS) bleibt unberührt.
import { allCards } from './db'
import { loadSet } from './data'
import { cardId, retrievability } from './srs'
import { app } from './state.svelte'
import { FLAGGED, flaggedWords, isHidden } from './marks.svelte'
import { wordKey, type Word } from './types'

export interface SketchGroup {
  id: string
  name: string
  words: Word[]
}

/** Gelernte (schon kennengelernte) Wörter je eigenem Deck und HSK-Set; leere Gruppen fallen weg */
export async function learnedGroups(): Promise<SketchGroup[]> {
  const known = new Set((await allCards()).map((c) => c.wordKey))
  // ausgeblendete Wörter nie; markierte auch, wenn noch nicht gelernt (bewusst ausgewählt)
  const learned = (w: Word) => known.has(wordKey(w)) && !isHidden(w)
  const groups: SketchGroup[] = [{ id: FLAGGED, name: 'Markiert', words: flaggedWords().filter((w) => !isHidden(w)) }]
  groups.push(...app.decks.map((d) => ({ id: d.id, name: d.name, words: d.words.filter(learned) })))
  for (const s of app.sets) {
    const set = await loadSet(s.id)
    groups.push({ id: s.id, name: s.name, words: set.words.filter(learned) })
  }
  return groups.filter((g) => g.words.length)
}

/** Alle Wörter der Gruppen ohne Doppelte */
export function unite(groups: SketchGroup[]): Word[] {
  const seen = new Set<string>()
  const out: Word[] = []
  for (const g of groups) {
    for (const w of g.words) {
      const k = wordKey(w)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(w)
    }
  }
  return out
}

/**
 * Gewicht je Wort (Schlüssel wordKey): Wörter, deren Schreib-Karte man bald vergessen würde, kommen öfter dran.
 * 0,25 (sitzt sicher) bis 1,25 (wackelt oder ist neu) – auch sichere Wörter kommen also ab und zu.
 */
export async function writeWeights(words: Word[]): Promise<Map<string, number>> {
  const cards = new Map((await allCards()).map((c) => [c.id, c]))
  const now = new Date()
  return new Map(
    words.map((w) => {
      const c = cards.get(cardId(wordKey(w), 'write'))
      return [wordKey(w), 0.25 + (1 - (c ? retrievability(c, now) : 0))]
    }),
  )
}

/**
 * Nächstes Wort: zufällig nach Gewicht, aber keins der zuletzt gezeichneten
 * (`recent`, neueste zuletzt; Abstand höchstens 6 bzw. so viele, wie der Vorrat hergibt).
 */
export function pickNext(pool: Word[], weights: Map<string, number>, recent: string[], rand = Math.random): Word | null {
  if (!pool.length) return null
  const gap = Math.min(6, pool.length - 1)
  // slice(-0) wäre die ganze Liste – bei nur einem Wort also nichts sperren
  const block = new Set(gap > 0 ? recent.slice(-gap) : [])
  const options = pool.filter((w) => !block.has(wordKey(w)))
  const weight = (w: Word) => weights.get(wordKey(w)) ?? 1
  let r = rand() * options.reduce((sum, w) => sum + weight(w), 0)
  for (const w of options) {
    r -= weight(w)
    if (r <= 0) return w
  }
  return options[options.length - 1]
}
