// Tastenkürzel beim Üben (PC/Mac, iPad mit Tastatur):
//   Leertaste/Enter  Hauptaktion (Aufdecken, Lösung zeigen, Weiter)
//   1 / 2            Nochmal / Gewusst
//   1–5              Töne (5 oder 0 = neutral)
//   T                Tipp beim Schreiben (nächster Strich)
//   N                Neu zeichnen (noch einmal aus dem Kopf, zählt nicht für die Bewertung)
//   U / →            Zeichenmodus: Umriss an/aus, Wort überspringen
//   P                Aussprache abspielen
//   Esc              Üben beenden

/** Gedrückte Taste als Kürzel – null beim Tippen in Feldern, mit Cmd/Strg/Alt oder bei gehaltener Taste */
export function shortcut(e: KeyboardEvent): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return null
  const t = e.target
  if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return null
  if (e.key === ' ') return 'Space'
  return e.key.length === 1 ? e.key.toLowerCase() : e.key
}

export function isPrimary(key: string): boolean {
  return key === 'Enter' || key === 'Space'
}

/**
 * Kürzel übernommen: Standardaktion verhindern und den Fokus von Tasten lösen –
 * sonst löst die Leertaste auf einer fokussierten Taste dieselbe Aktion ein zweites Mal aus.
 */
export function consume(e: KeyboardEvent) {
  e.preventDefault()
  const a = document.activeElement
  if (a instanceof HTMLElement && a !== document.body) a.blur()
}
