// Pinyin-Hilfsfunktionen. Wird von der App UND vom Datenskript (Node) genutzt,
// deshalb nur "abstreifbares" TypeScript (keine enums o. Ä.).

const MARKS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

/** Ton 1–4, 5 = neutraler Ton, null = unbekannt bzw. Erhua-„r“ */
export type Tone = 1 | 2 | 3 | 4 | 5 | null

const MARK_TO_BASE: Record<string, [string, number]> = {}
for (const [base, list] of Object.entries(MARKS)) {
  list.forEach((m, tone) => {
    if (tone > 0) {
      MARK_TO_BASE[m] = [base, tone]
      MARK_TO_BASE[m.toUpperCase()] = [base.toUpperCase(), tone]
    }
  })
}

function normUmlaut(s: string): string {
  return s.replace(/u:/g, 'ü').replace(/U:/g, 'Ü').replace(/v/g, 'ü').replace(/V/g, 'Ü')
}

/** "hao3" -> "hǎo", "lu:4" -> "lǜ", "ma5" -> "ma" */
export function numSyllableToMarked(syl: string): string {
  const s = normUmlaut(syl)
  const m = s.match(/^(.*?)([0-5])$/)
  if (!m) return s
  const base = m[1]
  const tone = Number(m[2])
  if (tone === 0 || tone === 5) return base
  const lower = base.toLowerCase()
  let idx = -1
  if (lower.includes('a')) idx = lower.indexOf('a')
  else if (lower.includes('e')) idx = lower.indexOf('e')
  else if (lower.includes('ou')) idx = lower.indexOf('o')
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i])) {
        idx = i
        break
      }
    }
  }
  if (idx < 0) return base
  const ch = base[idx]
  const marked = MARKS[ch.toLowerCase()]?.[tone]
  if (!marked) return base
  const out = ch === ch.toLowerCase() ? marked : marked.toUpperCase()
  return base.slice(0, idx) + out + base.slice(idx + 1)
}

/** Ton einer Silbe in Zahlenschreibweise ("hao3" -> 3) */
function numSyllableTone(syl: string): Tone {
  const m = syl.match(/([0-5])$/)
  if (!m) return null
  const t = Number(m[1])
  return (t === 0 ? 5 : t) as Tone
}

function isErhua(syl: string): boolean {
  return /^r[05]?$/i.test(syl)
}

/** Silben in Zahlenschreibweise, z. B. "ni3 hao3" -> ["ni3","hao3"] */
export function splitNumeric(numeric: string): string[] {
  return numeric.trim().split(/\s+/).filter(Boolean)
}

/** Töne je Silbe; Erhua-„r“ liefert null (wird nicht abgefragt). */
export function tonesOf(numeric: string): Tone[] {
  return splitNumeric(numeric).map((s) => (isErhua(s) ? null : numSyllableTone(s)))
}

/** Silben mit Tonzeichen, eine pro Zeichen ("yi1 dian3 r5" -> ["yī","diǎn","r"]) */
export function markedSyllables(numeric: string): string[] {
  return splitNumeric(numeric).map((s) => (isErhua(s) ? 'r' : numSyllableToMarked(s)))
}

/** Anzeigeform: "ni3 hao3" -> "nǐ hǎo", Erhua wird angehängt ("yī diǎnr") */
export function displayPinyin(numeric: string): string {
  const out: string[] = []
  for (const s of splitNumeric(numeric)) {
    if (isErhua(s) && out.length) out[out.length - 1] += 'r'
    else out.push(numSyllableToMarked(s))
  }
  return out.join(' ')
}

/** Einheitliche Zahlenschreibweise als Schlüssel: Kleinbuchstaben, ü als "v", neutraler Ton = 5 */
export function normalizeNumeric(numeric: string): string {
  return splitNumeric(numeric)
    .map((s) => {
      let x = s.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v')
      if (!/[0-5]$/.test(x)) x += '5'
      return x.replace(/0$/, '5')
    })
    .join(' ')
}

/**
 * Nutzereingabe ("nǐ hǎo", "ni3 hao3", "ni hao") in Zahlenschreibweise umwandeln.
 * Gibt hasTones=false zurück, wenn keine einzige Silbe einen Ton trägt.
 */
export function inputToNumeric(input: string): { numeric: string; hasTones: boolean } {
  const syls = input
    .normalize('NFC')
    .trim()
    .replace(/['’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  let hasTones = false
  const out = syls.map((syl) => {
    if (/[0-5]$/.test(syl)) {
      hasTones = true
      return syl.replace(/ü/g, 'v').replace(/Ü/g, 'V')
    }
    let tone = 5
    let base = ''
    for (const ch of syl) {
      const hit = MARK_TO_BASE[ch]
      if (hit) {
        tone = hit[1]
        hasTones = true
        base += hit[0]
      } else base += ch
    }
    return base.replace(/ü/g, 'v').replace(/Ü/g, 'V') + tone
  })
  return { numeric: out.join(' '), hasTones }
}

/** Suchschlüssel ohne Töne/Leerzeichen: "Nǐ hǎo" -> "nihao", "lǜ" -> "lv" */
export function searchKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/[üǖǘǚǜ]/g, 'v')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-9\s'’·-]/g, '')
}

/** Suchschlüssel MIT Tönen ("nǐ hǎo" / "ni3hao3" -> "ni3hao3"), für genaue Treffer */
export function toneSearchKey(numeric: string): string {
  return normalizeNumeric(numeric).replace(/\s+/g, '')
}

export const TONE_MARK_EXAMPLE: Record<number, string> = { 1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à', 5: 'a' }
