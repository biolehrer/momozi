// Serie: Tage in Folge mit mindestens einer bewerteten Karte beim Üben – Tageswechsel um Mitternacht (Gerätezeit).
// Wird nicht extra gespeichert, sondern aus dem Übungsprotokoll berechnet. Das steckt in jeder Sicherung:
// die Serie kommt beim Laden mit, beim Zusammenführen zählen die Übungstage beider Geräte.
// Ab 23:30 ein kleiner roter Punkt, wenn die Serie läuft, heute aber noch nicht geübt wurde – keine Mitteilung, kein Popup.
import { db } from './db'

/** ab dieser Uhrzeit (Minuten nach Mitternacht) erscheint der Hinweis-Punkt */
const WARN_FROM = 23 * 60 + 30

export const streak = $state({
  /** Tage in Folge (bis heute, oder bis gestern, solange heute noch nicht geübt wurde) */
  days: 0,
  /** heute schon geübt? */
  today: false,
  /** kurz vor Mitternacht und heute noch nicht geübt: roter Punkt */
  warn: false,
})

/** Tage mit mindestens einer Bewertung, als „JJJJ-M-T“ in Gerätezeit */
let practiced = new Set<string>()

function dayKey(t: number | Date): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function recompute(now = new Date()) {
  const today = practiced.has(dayKey(now))
  // rückwärts zählen, je Tag zur Mittagszeit – unempfindlich gegen die Zeitumstellung
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  if (!today) d.setDate(d.getDate() - 1)
  let days = 0
  while (practiced.has(dayKey(d))) {
    days++
    d.setDate(d.getDate() - 1)
  }
  streak.days = days
  streak.today = today
  streak.warn = days > 0 && !today && now.getHours() * 60 + now.getMinutes() >= WARN_FROM
}

/** aus dem Protokoll neu berechnen: beim Start, nach „Rückgängig“, nach dem Laden einer Sicherung */
export async function refreshStreak() {
  const log = await (await db()).getAll('log')
  practiced = new Set(log.map((l) => dayKey(l.at)))
  recompute()
}

/** nach einer Bewertung: heute zählt */
export function practicedNow() {
  practiced.add(dayKey(new Date()))
  recompute()
}

let clock = 0
/** Mitternacht und Hinweis-Punkt mitbekommen: alle 30 s und beim Zurückkehren in die App neu bewerten */
export function startStreakClock() {
  clearInterval(clock)
  clock = window.setInterval(() => recompute(), 30_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) recompute()
  })
}
