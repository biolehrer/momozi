// Kleine Helfer für Animationen. Alle Animationen bleiben kurz; mit der Systemeinstellung „Bewegung reduzieren“
// entfallen sie (CSS: app.css schaltet dann alle Animationen ab, JS fragt reducedMotion()).

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Zuletzt auf der Startseite gezeigte Zahlen. Kommt man vom Üben zurück, zählen sie von dort aus zum neuen Stand
 * (nur innerhalb einer Sitzung im Speicher – beim Öffnen der App stehen die Zahlen gleich da).
 */
export const lastHome: { due?: number; newToday?: number; learned?: number; total?: number } = {}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const FLAME_KEY = 'momozi.flamme'

/** Ist die Flamme heute schon einmal sichtbar aufgeflammt (Abschluss-Bildschirm oder Startseite)? */
export function flameShownToday(): boolean {
  try {
    return localStorage.getItem(FLAME_KEY) === dayKey()
  } catch {
    return true // ohne Speicher lieber gar nicht als jedes Mal
  }
}

export function markFlameShown() {
  try {
    localStorage.setItem(FLAME_KEY, dayKey())
  } catch {
    /* privates Fenster o. Ä. */
  }
}

/** Meilensteine: gelernte Wörter und Tage in Folge */
const WORD_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2000, 3000, 4000, 5000]
const STREAK_STEPS = [3, 7, 14, 30, 50, 100, 200, 365, 500, 1000]

/** größte Schwelle, die zwischen vorher (ausschließlich) und nachher (einschließlich) überschritten wurde */
function crossed(steps: number[], before: number, after: number): number | null {
  let hit: number | null = null
  for (const s of steps) if (before < s && after >= s) hit = s
  return hit
}

export function milestones(words: [number, number], streak: [number, number]): string[] {
  const out: string[] = []
  const w = crossed(WORD_STEPS, ...words)
  if (w) out.push(`${w.toLocaleString('de-DE')} Wörter gelernt`)
  const s = crossed(STREAK_STEPS, ...streak)
  if (s) out.push(`${s} Tage in Folge`)
  return out
}
