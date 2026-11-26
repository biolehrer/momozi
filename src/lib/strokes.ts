// Strichdaten (aus hanzi-writer-data) je Zeichen laden – liegen unter ./strokes/<hex>.json
const cache = new Map<string, Promise<unknown>>()

export function strokeUrl(ch: string): string {
  return `${import.meta.env.BASE_URL}strokes/${ch.codePointAt(0)!.toString(16)}.json`
}

export function loadStrokes(ch: string): Promise<unknown> {
  let p = cache.get(ch)
  if (!p) {
    p = fetch(strokeUrl(ch)).then((r) => {
      if (!r.ok) throw new Error(`Keine Strichdaten für „${ch}“`)
      return r.json()
    })
    cache.set(ch, p)
    p.catch(() => cache.delete(ch))
  }
  return p
}

/**
 * Strichdaten im Voraus laden (die nächsten Karten), damit beim Umblättern kein „Lade Strichfolge …“ erscheint.
 * Kommt aus dem Offline-Speicher, sonst aus dem Netz; Fehler zeigt erst die Zeichenfläche selbst an.
 */
export function preloadStrokes(text: string) {
  for (const ch of new Set(text)) loadStrokes(ch).catch(() => {})
}
