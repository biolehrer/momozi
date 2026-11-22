// Reihenfolge einer Übungssitzung: Karten zum selben Wort nie kurz hintereinander,
// neue Wörter zwischen die Wiederholungen gemischt.
// Nur reine Funktionen ohne App-Zustand (lässt sich auch in Node durchspielen).
import type { QuizType, SessionItem, Word } from './types'

/**
 * So viele andere Karten liegen mindestens zwischen zwei Karten zum selben Wort –
 * sonst ist die Antwort von der Karte davor noch im Kurzzeitgedächtnis.
 * Geht nur, wenn genug verschiedene Wörter in der Sitzung sind (ab MIN_GAP + 1).
 */
export const MIN_GAP = 4

/** Ein Wort wird vorgezogen, wenn nach seinen offenen Karten höchstens so viele Karten Spielraum bleiben (siehe interleave) */
export const URGENT_SLACK = 8

/** Gleiche Zeichen gelten als dasselbe Wort, auch mit anderer Lesung (好 hǎo / 好 hào) */
const spreadKey = (it: SessionItem) => it.word.s

/** Wort samt Lesung – Kennenlern-Karte und Abfragen eines Wortes stammen vom selben Word */
const readingKey = (w: Word) => `${w.s}|${w.n}`

export function shuffle<T>(a: T[], rand: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Karten so anordnen, dass Karten zum selben Wort mindestens `gap` andere Karten Abstand haben.
 * `queue` ist nach Vorrang sortiert. An jeder Stelle kommt die erste Karte dran, deren Wort lange genug
 * nicht dran war – außer ein Wort hat so viele offene Karten, dass sie sonst nicht mehr mit Abstand
 * in den Rest passen (meist gegen Ende): dann dieses. Passt gar keine, die Karte, deren Wort am längsten her ist.
 * Abfragen zu einem neuen Wort kommen erst nach seiner Kennenlern-Karte.
 * `recent`: zuletzt gespielte Karten (älteste zuerst), damit der Abstand auch über den Anfang hinweg gilt.
 */
export function interleave(queue: SessionItem[], gap = MIN_GAP, recent: SessionItem[] = [], urgentAt = URGENT_SLACK): SessionItem[] {
  const rest = [...queue]
  const out: SessionItem[] = []
  const last = new Map<string, number>()
  recent.forEach((it, i) => last.set(spreadKey(it), i - recent.length))
  const open = new Map<string, number>()
  for (const it of rest) open.set(spreadKey(it), (open.get(spreadKey(it)) ?? 0) + 1)
  const learnFirst = new Set(queue.filter((it) => it.kind === 'learn').map((it) => readingKey(it.word)))
  while (rest.length) {
    const pos = out.length
    let pick = -1
    let urgent = -1
    let urgentSlack = Infinity
    let oldest = -1
    let oldestAt = Infinity
    for (let i = 0; i < rest.length; i++) {
      const it = rest[i]
      if (it.kind === 'quiz' && learnFirst.has(readingKey(it.word))) continue
      const k = spreadKey(it)
      const at = last.get(k) ?? -Infinity
      if (pos - at - 1 >= gap) {
        if (pick < 0) pick = i
        // Platz, den die offenen Karten dieses Wortes mit Abstand brauchen, gegen den Platz, der noch übrig ist
        const slack = rest.length - ((open.get(k)! - 1) * (gap + 1) + 1)
        if (slack < urgentSlack) {
          urgentSlack = slack
          urgent = i
        }
      } else if (at < oldestAt) {
        oldestAt = at
        oldest = i
      }
    }
    // Es gibt immer eine Kandidatin: die Kennenlern-Karte eines wartenden neuen Wortes ist nie gesperrt
    const chosen = urgent >= 0 && urgentSlack <= urgentAt ? urgent : pick >= 0 ? pick : oldest
    const [it] = rest.splice(chosen, 1)
    out.push(it)
    last.set(spreadKey(it), pos)
    open.set(spreadKey(it), open.get(spreadKey(it))! - 1)
    if (it.kind === 'learn') learnFirst.delete(readingKey(it.word))
  }
  return out
}


/**
 * „Nochmal“ für die Karte an Stelle `index`: eine Kopie kommt nach etwa `gap` anderen Karten wieder,
 * der Rest der Sitzung wird dafür neu auf Abstand gebracht. Gibt die neue Kartenliste zurück.
 */
export function requeue(items: SessionItem[], index: number, gap = MIN_GAP): SessionItem[] {
  const rest = items.slice(index + 1)
  rest.splice(Math.min(rest.length, gap), 0, { ...items[index] })
  const recent = items.slice(Math.max(0, index + 1 - (gap + 1)), index + 1)
  return [...items.slice(0, index + 1), ...interleave(rest, gap, recent)]
}

/** fällige Karte mit Fälligkeitszeitpunkt (ms) */
export interface DueCard {
  item: SessionItem
  at: number
}

/**
 * Sitzung anordnen:
 * - Wiederholungen: Wörter nach ihrer am längsten fälligen Karte, die Karten reihum (erst von jedem Wort eine,
 *   dann die nächste) – die Karten eines Wortes werden meist zusammen fällig, weil man sie zusammen beantwortet hat
 * - neue Wörter (Kennenlern-Karte, dann die Abfragen in zufälliger Folge) gleichmäßig dazwischen
 * - zuletzt mit interleave() auf Abstand gebracht
 */
export function orderSession(
  due: DueCard[],
  fresh: { word: Word; types: QuizType[] }[],
  rand: () => number = Math.random,
): SessionItem[] {
  const byWord = new Map<string, DueCard[]>()
  for (const d of due) {
    const k = readingKey(d.item.word)
    byWord.set(k, [...(byWord.get(k) ?? []), d])
  }
  const groups = [...byWord.values()].map((g) => g.sort((a, b) => a.at - b.at)).sort((a, b) => a[0].at - b[0].at)
  const reviews: SessionItem[] = []
  for (let round = 0; groups.some((g) => g.length > round); round++) {
    for (const g of groups) if (round < g.length) reviews.push(g[round].item)
  }

  const queue: SessionItem[] = []
  let r = 0
  fresh.forEach(({ word, types }, n) => {
    const upto = Math.round(((n + 1) * reviews.length) / (fresh.length + 1))
    while (r < upto) queue.push(reviews[r++])
    const quizzes = types.map((type): SessionItem => ({ kind: 'quiz', word, type }))
    queue.push({ kind: 'learn', word }, ...shuffle(quizzes, rand))
  })
  while (r < reviews.length) queue.push(reviews[r++])
  return interleave(queue)
}
