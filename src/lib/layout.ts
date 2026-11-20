// Bildschirmgrößen, die auch im Code gebraucht werden (die CSS-Media-Queries nutzen dieselben Werte).

/** Üben zweispaltig: Aufgabe links, große Zeichenfläche rechts (iPad quer, PC) */
export const WIDE_PRACTICE = '(min-width: 900px) and (min-height: 560px) and (orientation: landscape)'

export function isWidePractice(): boolean {
  return typeof matchMedia === 'function' && matchMedia(WIDE_PRACTICE).matches
}

/** Tablet oder größer (Rail/Seitenleiste statt Tab-Leiste) */
export function isTablet(): boolean {
  return window.innerWidth >= 700
}
