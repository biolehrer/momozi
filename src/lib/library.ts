// Wortbibliothek: alle Wörter der HSK-Sets (mit geprüften Bedeutungen und Aussprache)
// plus das Wörterbuch für alles andere. Grundlage für „Wörter auswählen“ und „Liste einfügen“.
import { loadSet, wordFromDict, type DictEntry } from './data'
import { normalizeNumeric, searchKey, toneSearchKey } from './pinyin'
import { app } from './state.svelte'
import { wordKey, type Word } from './types'

export interface LibItem {
  key: string
  word: Word
  /** Name des HSK-Sets, z. B. "HSK 1"; leer = aus dem Wörterbuch */
  set?: string
}

/** Eintrag im Suchformat des Wörterbuchs, mit Verweis auf das Bibliotheks-Element */
export type LibEntry = DictEntry & { item: LibItem }

export async function loadHskItems(): Promise<LibItem[]> {
  const out: LibItem[] = []
  const seen = new Set<string>()
  for (const s of app.sets) {
    for (const w of (await loadSet(s.id)).words) {
      const key = wordKey(w)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, word: w, set: s.name })
    }
  }
  return out
}

export function itemFromDict(e: DictEntry): LibItem {
  const w = wordFromDict(e)
  return { key: wordKey(w), word: w }
}

export function toEntries(items: LibItem[]): LibEntry[] {
  return items.map((item) => {
    const n = normalizeNumeric(item.word.n)
    const m = [item.word.m, item.word.x].filter(Boolean).join(' / ')
    return { s: item.word.s, n, m, pk: searchKey(n), tk: toneSearchKey(n), ml: m.toLowerCase(), item }
  })
}

export function groupBySimp<T>(list: T[], simp: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of list) {
    const s = simp(x)
    const arr = m.get(s)
    if (arr) arr.push(x)
    else m.set(s, [x])
  }
  return m
}

const CJK_RUN = /[㐀-鿿豈-﫿]+/g

/**
 * Zusammenhängende Zeichenfolge in bekannte Wörter zerlegen: möglichst wenige Teile,
 * bei Gleichstand mehr HSK-Wörter und ausgewogenere Längen (谢谢你好 → 谢谢 + 你好).
 */
function segment(run: string, known: (s: string) => boolean, isHsk: (s: string) => boolean): string[] {
  const chars = [...run]
  const n = chars.length
  type Best = { parts: number; hsk: number; maxLen: number; prev: number }
  const best: (Best | null)[] = Array(n + 1).fill(null)
  best[0] = { parts: 0, hsk: 0, maxLen: 0, prev: -1 }
  const better = (a: Best, b: Best | null) =>
    !b || a.parts < b.parts || (a.parts === b.parts && (a.hsk > b.hsk || (a.hsk === b.hsk && a.maxLen < b.maxLen)))
  for (let i = 0; i < n; i++) {
    const cur = best[i]
    if (!cur) continue
    for (let len = 1; len <= Math.min(8, n - i); len++) {
      const w = chars.slice(i, i + len).join('')
      if (len > 1 && !known(w)) continue
      const cand: Best = { parts: cur.parts + 1, hsk: cur.hsk + (isHsk(w) ? 1 : 0), maxLen: Math.max(cur.maxLen, len), prev: i }
      if (better(cand, best[i + len])) best[i + len] = cand
    }
  }
  const out: string[] = []
  for (let j = n; j > 0; j = best[j]!.prev) out.unshift(chars.slice(best[j]!.prev, j).join(''))
  return out
}

/**
 * Schriftzeichen-Wörter aus einem eingefügten Text holen. Pinyin, Übersetzungen, Nummern usw.
 * dürfen mit drinstehen. Zeichenfolgen, die kein bekanntes Wort sind, werden zerlegt.
 */
export function tokenize(text: string, known: (s: string) => boolean, isHsk: (s: string) => boolean = () => false): string[] {
  const out: string[] = []
  for (const run of text.match(CJK_RUN) ?? []) {
    if (known(run)) out.push(run)
    else out.push(...segment(run, known, isHsk))
  }
  return [...new Set(out)]
}

export interface PasteEntry {
  token: string
  /** 0 = nicht gefunden, 1 = eindeutig, mehr = Lesung wählen */
  options: LibItem[]
}

/** HSK-Wörter haben Vorrang (geprüfte Bedeutung, Aussprache), sonst das Wörterbuch */
export function matchTokens(tokens: string[], hskBySimp: Map<string, LibItem[]>, dictBySimp: Map<string, DictEntry[]>): PasteEntry[] {
  return tokens.map((token) => {
    const hsk = hskBySimp.get(token)
    if (hsk?.length) return { token, options: hsk }
    const seen = new Set<string>()
    const options: LibItem[] = []
    for (const e of dictBySimp.get(token) ?? []) {
      const it = itemFromDict(e)
      if (!seen.has(it.key)) {
        seen.add(it.key)
        options.push(it)
      }
    }
    return { token, options }
  })
}
