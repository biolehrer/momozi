// Kurzbedeutung aus Wörterbuch-Bedeutungen ableiten.
// Format der Eingabe: Bedeutungsgruppen getrennt durch " / ", Synonyme durch "; ".
// Wird von der App und vom Datenskript genutzt.

export const SENSE_SEP = ' / '

/** 1–3 kurze Begriffe, bevorzugt aus der ersten Bedeutungsgruppe */
export function shortMeaning(senses: string, maxItems = 3, maxLen = 48): string {
  const groups = senses
    .split(SENSE_SEP)
    .map((g) =>
      g
        .split(';')
        .map((x) => x.trim())
        .filter((x) => x && !x.startsWith('Radikal Nr.')),
    )
    .filter((g) => g.length)
  const picked: string[] = []
  // erst aus der ersten Gruppe, dann je ein Begriff aus den folgenden
  for (const item of groups[0] ?? []) {
    if (picked.length >= maxItems) break
    picked.push(item)
  }
  for (const g of groups.slice(1)) {
    if (picked.length >= Math.min(2, maxItems)) break
    if (!picked.includes(g[0])) picked.push(g[0])
  }
  let out = ''
  for (const p of picked) {
    const next = out ? `${out}; ${p}` : p
    if (out && next.length > maxLen) break
    out = next
  }
  return out
}

/**
 * Die ersten weiteren Bedeutungen für die Lernansichten („auch: a · b · c“) – nur wenn die Liste von Hand
 * nach Alltagsgebrauch sortiert ist (h) und sich von der Hauptbedeutung unterscheidet; sonst ''.
 */
export function alsoMeanings(w: { m: string; x?: string; h?: 1 }, max = 3): string {
  if (!w.h || !w.x || w.x === w.m) return ''
  return 'auch: ' + w.x.split(SENSE_SEP).slice(0, max).join(' · ')
}
