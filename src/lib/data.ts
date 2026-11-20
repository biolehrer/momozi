// Laden der mitgelieferten Daten (HSK-Sets, Wörterbuch) und Wörterbuchsuche.
import type { SetInfo, Word, WordSet } from './types'
import { inputToNumeric, searchKey, toneSearchKey } from './pinyin'
import { shortMeaning } from './meaning'

const BASE = import.meta.env.BASE_URL

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Laden fehlgeschlagen (${res.status}): ${url}`)
  return (await res.json()) as T
}

export function loadSetIndex(): Promise<SetInfo[]> {
  return getJson<SetInfo[]>(`${BASE}data/sets/index.json`)
}

const setCache = new Map<string, Promise<WordSet>>()

export function loadSet(id: string): Promise<WordSet> {
  let p = setCache.get(id)
  if (!p) {
    p = getJson<WordSet>(`${BASE}data/sets/${id}.json`)
    setCache.set(id, p)
    p.catch(() => setCache.delete(id))
  }
  return p
}

export interface Sources {
  handedictDate: string
  hskCommit: string
  generated: string
}

export function loadSources(): Promise<Sources> {
  return getJson<Sources>(`${BASE}data/sources.json`)
}

// ---------- Wörterbuch ----------

export interface DictEntry {
  s: string
  n: string
  m: string
  /** Pinyin ohne Töne/Leerzeichen */
  pk: string
  /** Pinyin mit Tonziffern, ohne Leerzeichen */
  tk: string
  /** Bedeutung in Kleinbuchstaben */
  ml: string
}

let dictPromise: Promise<DictEntry[]> | null = null

export function loadDictionary(): Promise<DictEntry[]> {
  if (!dictPromise) {
    dictPromise = getJson<[string, string, string][]>(`${BASE}data/dict.json`).then((rows) =>
      rows.map(([s, n, m]) => ({ s, n, m, pk: searchKey(n), tk: toneSearchKey(n), ml: m.toLowerCase() })),
    )
    dictPromise.catch(() => (dictPromise = null))
  }
  return dictPromise
}

const CJK = /[㐀-鿿豈-﫿]/
const PINYIN_ONLY = /^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-5\s':]+$/
const HAS_TONE = /[0-5]|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/

function glossExact(ml: string, q: string): boolean {
  return ml.split(/\s*[;/,]\s*/).some((raw) => {
    const g = raw.replace(/[!?.…]+$/, '').trim()
    return g === q || g.replace(/^(sich|etw\.|jmdn\.|jmdm\.)\s+/, '') === q
  })
}

/**
 * Sucht nach Zeichen, Pinyin (mit oder ohne Töne) oder deutscher Bedeutung.
 * `boost`: vereinfachte Zeichen, die bevorzugt werden (z. B. HSK-Wörter).
 */
export function searchDictionary(dict: DictEntry[], query: string, boost?: Set<string>, limit = 60): DictEntry[] {
  const q = query.trim()
  if (!q) return []
  const hits: { e: DictEntry; score: number }[] = []

  if (CJK.test(q)) {
    for (const e of dict) {
      let score = -1
      if (e.s === q) score = 0
      else if (e.s.startsWith(q)) score = 1
      else if (e.s.includes(q)) score = 2
      if (score >= 0) hits.push({ e, score })
    }
  } else {
    const ql = q.toLowerCase()
    const pinyinish = PINYIN_ONLY.test(q)
    const pk = pinyinish ? searchKey(q) : ''
    const tk = pinyinish && HAS_TONE.test(q) ? toneSearchKey(inputToNumeric(q).numeric) : ''
    for (const e of dict) {
      let score = 99
      if (pk) {
        if (tk && e.tk === tk) score = 0
        else if (e.pk === pk) score = tk ? 1.2 : 0.4
        else if (pk.length >= 2 && e.pk.startsWith(pk)) score = 3.5
      }
      if (ql.length >= 2) {
        const i = e.ml.indexOf(ql)
        if (i >= 0) {
          const boundary = i === 0 || /[\s;/(,"„]/.test(e.ml[i - 1])
          const s2 = glossExact(e.ml, ql) ? 0.2 : boundary ? 2 : 4
          if (s2 < score) score = s2
        }
      }
      if (score < 99) hits.push({ e, score })
    }
  }

  for (const h of hits) {
    h.score += [...h.e.s].length * 0.05
    if (boost?.has(h.e.s)) h.score -= 0.5
  }
  hits.sort((a, b) => a.score - b.score)
  return hits.slice(0, limit).map((h) => h.e)
}

export function wordFromDict(e: DictEntry): Word {
  return { s: e.s, n: e.n, m: shortMeaning(e.m) || e.m, x: e.m }
}
