// Kurze Erfolgsmeldung über der ganzen App (components/Celebrate.svelte): Seite leicht weichgezeichnet wie beim
// Drag & Drop, ein Haken zeichnet sich, die Meldung verschwindet von selbst (oder beim Antippen).
import { go } from './router.svelte'
import type { CustomDeck } from './types'

export interface Celebration {
  id: number
  title: string
  detail?: string
}

export const celebration = $state({ current: null as Celebration | null, leaving: false })

/** so lange steht die Meldung; mit Folgeschritt kürzer – der läuft, sobald der Haken fertig ist */
const HOLD = 1500
const HOLD_THEN = 1000
const FADE = 280

let seq = 0
let holdTimer = 0
let fadeTimer = 0
let after: (() => void) | null = null

/** Meldung zeigen; `then` (z. B. das neue Deck öffnen) läuft unter der ausblendenden Fläche */
export function celebrate(title: string, detail?: string, then?: () => void) {
  clearTimeout(holdTimer)
  clearTimeout(fadeTimer)
  after = then ?? null
  celebration.current = { id: ++seq, title, detail }
  celebration.leaving = false
  holdTimer = window.setTimeout(finish, then ? HOLD_THEN : HOLD)
}

/** Folgeschritt ausführen und ausblenden (auch beim Antippen) */
export function finish() {
  if (!celebration.current || celebration.leaving) return
  clearTimeout(holdTimer)
  const next = after
  after = null
  next?.()
  celebration.leaving = true
  fadeTimer = window.setTimeout(() => {
    celebration.current = null
    celebration.leaving = false
  }, FADE)
}

/** Importierte Decks melden und öffnen – ein Deck direkt (mit sanftem Hereingleiten), mehrere über die Deck-Liste */
export function announceDecks(decks: CustomDeck[], open = true) {
  if (!decks.length) return
  if (decks.length === 1) {
    const d = decks[0]
    const n = d.words.length
    celebrate('Deck importiert', `„${d.name}“ · ${n} ${n === 1 ? 'Wort' : 'Wörter'}`, open ? () => go(`/deck?id=${d.id}&neu=1`) : undefined)
  } else {
    celebrate(`${decks.length} Decks importiert`, decks.map((d) => d.name).join(', '), open ? () => go('/decks') : undefined)
  }
}
