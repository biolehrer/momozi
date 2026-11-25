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
  /**
   * Angezeigte Kurzbedeutung in Kleinbuchstaben – Treffer dort zählen mehr als in den weiteren Bedeutungen.
   * Bei HSK-Wörtern vorgegeben, im Wörterbuch erst bei Bedarf berechnet (siehe shownLower).
   */
  pm?: string
  /** Malus für seltene Zeichen (siehe rarity), wird zum Suchwert addiert */
  r?: number
  /** Zahl der Einträge, in denen das Wort steckt (siehe compounds), bei Bedarf berechnet */
  c?: number
}

/**
 * Wie gebräuchlich ein Wort ist, geschätzt aus dem Wörterbuch selbst: in wie vielen Einträgen sein
 * seltenstes Zeichen vorkommt. 玉 steckt in 128 Wörtern, Zeichen wie 瑔 nur in ihrem eigenen Eintrag.
 * Seltene Wörter rutschen so bei gleich gutem Treffer nach unten (ähnlich wie Pleco nach Häufigkeit sortiert).
 */
function rarity(s: string, count: Map<string, number>): number {
  let min = Infinity
  for (const c of s) min = Math.min(min, count.get(c) ?? 0)
  return min <= 1 ? 0.6 : min <= 3 ? 0.4 : min <= 10 ? 0.2 : 0
}

let dictPromise: Promise<DictEntry[]> | null = null

export function loadDictionary(): Promise<DictEntry[]> {
  if (!dictPromise) {
    dictPromise = getJson<[string, string, string][]>(`${BASE}data/dict.json`).then((rows) => {
      const count = new Map<string, number>()
      for (const [s] of rows) for (const c of new Set(s)) count.set(c, (count.get(c) ?? 0) + 1)
      return rows.map(([s, n, m]) => ({ s, n, m, pk: searchKey(n), tk: toneSearchKey(n), ml: m.toLowerCase(), r: rarity(s, count) }))
    })
    dictPromise.catch(() => (dictPromise = null))
  }
  return dictPromise
}

const CJK = /[㐀-鿿豈-﫿]/
const PINYIN_ONLY = /^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ0-5\s':]+$/
const HAS_TONE = /[0-5]|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/

/** Kurzbedeutung, wie sie in der Liste steht (vgl. wordFromDict); wird am Eintrag gemerkt */
function shownLower(e: DictEntry): string {
  if (e.pm === undefined) e.pm = (shortMeaning(e.m) || e.m).toLowerCase()
  return e.pm
}

/** Klammerzusätze entfernen: „italien (staat in süd europa)“ → „italien“ */
function stripParens(s: string): string {
  return s.replace(/\([^)]*\)?/g, ' ').replace(/\s+/g, ' ').trim()
}

function glossList(head: string): string[] {
  return head
    .split(/\s*[;/,]\s*/)
    .map((g) => g.replace(/[!?.…]+$/, '').trim())
    .filter(Boolean)
}

const sameGloss = (g: string, q: string) => g === q || g.replace(/^(sich|etw\.|jmdn\.|jmdm\.)\s+/i, '') === q

/**
 * Ist das Suchwort eine der Bedeutungen (ohne Klammerzusatz)? 0 = die einzige Bedeutung (咖啡 „Kaffee“),
 * 0.1 = die erste von mehreren, 0.2 = eine spätere; null = keine. `caseOk`: auch in Groß-/Kleinschreibung gleich.
 */
function glossTier(head: string, headCase: string, ql: string, q: string): { tier: number; caseOk: boolean } | null {
  const gl = glossList(head)
  const i = gl.findIndex((g) => sameGloss(g, ql))
  if (i < 0) return null
  const caseOk = sameGloss(glossList(headCase)[i] ?? '', q)
  return { tier: gl.length === 1 ? 0 : i === 0 ? 0.1 : 0.2, caseOk }
}

/**
 * In wie vielen anderen Einträgen steckt das Wort (日本 → 日本人, 日本语 …)? Grobes Maß dafür, wie gebräuchlich es ist –
 * entscheidet bei fast gleich guten Treffern (日本 vor 东洋 für „Japan“). Wird nur für die besten Treffer berechnet.
 */
function compounds(e: DictEntry, pool: DictEntry[]): number {
  // Einzelzeichen stecken in sehr vielen Wörtern ganz anderer Bedeutung – das sagt über ihre eigene nichts
  if ([...e.s].length < 2) return 0
  if (e.c === undefined) {
    let n = 0
    for (const o of pool) if (o.s.length > e.s.length && o.s.includes(e.s)) n++
    e.c = n
  }
  return e.c
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
      if (ql.length >= 2 && e.ml.includes(ql)) {
        // Klammerzusätze zählen nicht als Bedeutung: „Italien (Staat in Süd Europa)“ ist ein genauer Treffer für
        // „Italien“, „Turin (Stadt in Italien)“ dagegen nur eine Erklärung – sonst verdrängen hunderte Orte das Land
        const head = stripParens(e.ml)
        const i = head.indexOf(ql)
        let s2: number
        if (i >= 0) {
          const headCase = stripParens(e.m)
          const boundary = i === 0 || /[\s;/,"„-]/.test(head[i - 1])
          const g = glossTier(head, headCase, ql, q)
          s2 = g ? g.tier : boundary ? 2 : 4
          // Groß-/Kleinschreibung passt nicht: „gehen“ meint das Verb, nicht 竞走 „Gehen (Sportdisziplin)“,
          // „essen“ nicht die Stadt 埃森 „Essen“
          if (!(g ? g.caseOk : headCase.slice(i, i + q.length) === q)) s2 += 0.3
        } else {
          s2 = 5 // nur in einer Klammer-Erklärung
        }
        // Passt nur in den weiteren Bedeutungen, nicht in der angezeigten Kurzbedeutung
        // (门 „Schule“ als Denkrichtung, 宗 „Sekte, Schule“): nach hinten
        if (!shownLower(e).includes(ql)) s2 += 0.5
        if (s2 < score) score = s2
      }
      if (score < 99) hits.push({ e, score })
    }
  }

  for (const h of hits) {
    h.score += [...h.e.s].length * 0.05 + (h.e.r ?? 0)
    if (boost?.has(h.e.s)) h.score -= 0.5
  }
  hits.sort((a, b) => a.score - b.score)
  // Fast gleich gute Spitzentreffer: das gebräuchlichere Wort zuerst (höchstens 0,15 Unterschied)
  const top = hits.slice(0, 12).filter((h) => h.score < 1)
  if (top.length > 1) {
    for (const h of top) h.score -= Math.min(0.15, 0.05 * Math.log10(1 + compounds(h.e, dict)))
    hits.sort((a, b) => a.score - b.score)
  }
  return hits.slice(0, limit).map((h) => h.e)
}

export function wordFromDict(e: DictEntry): Word {
  return { s: e.s, n: e.n, m: shortMeaning(e.m) || e.m, x: e.m }
}
