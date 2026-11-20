// Offline-Vorrat: Strichfolgen und Aussprache aller Wörter der eigenen und aktiven Decks
// werden still im Hintergrund in den Zwischenspeicher gelegt (dieselben Caches nutzt der Service Worker).
import { audioFor } from './audio.svelte'
import { activeWords } from './srs'
import { app } from './state.svelte'
import { strokeUrl } from './strokes'
import { wordKey, type Word } from './types'

/** Namen wie in vite.config.ts (runtimeCaching) */
export const CACHE = { strokes: 'zw-strokes', audio: 'zw-audio', dict: 'zw-dict' } as const

const BASE = import.meta.env.BASE_URL
export const DICT_URL = `${BASE}data/dict.json`

export const offline = $state({ running: false, done: 0, total: 0 })

function supported(): boolean {
  return typeof caches !== 'undefined'
}

/** Wörter, die offline verfügbar sein sollen: aktive Decks + alle eigenen Decks */
async function wordsToKeep(): Promise<Word[]> {
  const out = new Map<string, Word>()
  for (const w of await activeWords()) out.set(wordKey(w), w)
  for (const d of app.decks) for (const w of d.words) out.set(wordKey(w), w)
  return [...out.values()]
}

function urlsFor(words: Word[]): { strokes: string[]; audio: string[] } {
  const chars = new Set<string>()
  const audio = new Set<string>()
  for (const w of words) {
    for (const ch of w.s) chars.add(ch)
    const a = audioFor(w)
    if (a) audio.add(`${BASE}audio/${a.f}`)
  }
  return { strokes: [...chars].map(strokeUrl), audio: [...audio] }
}

async function split(cacheName: string, urls: string[]): Promise<{ have: number; missing: string[] }> {
  const cache = await caches.open(cacheName)
  const missing: string[] = []
  let have = 0
  for (const u of urls) {
    if (await cache.match(u)) have++
    else missing.push(u)
  }
  return { have, missing }
}

export interface OfflineStatus {
  have: number
  total: number
  dict: boolean
}

export async function offlineStatus(): Promise<OfflineStatus> {
  if (!supported()) return { have: 0, total: 0, dict: false }
  const { strokes, audio } = urlsFor(await wordsToKeep())
  const [s, a] = await Promise.all([split(CACHE.strokes, strokes), split(CACHE.audio, audio)])
  return { have: s.have + a.have, total: strokes.length + audio.length, dict: await dictCached() }
}

/** Fehlende Dateien nachladen – bereits gespeicherte werden übersprungen */
export async function warmUp() {
  if (!supported() || offline.running || !navigator.onLine) return
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return
  offline.running = true
  try {
    const { strokes, audio } = urlsFor(await wordsToKeep())
    const [s, a] = await Promise.all([split(CACHE.strokes, strokes), split(CACHE.audio, audio)])
    const jobs: [string, string][] = [
      ...s.missing.map((u): [string, string] => [CACHE.strokes, u]),
      ...a.missing.map((u): [string, string] => [CACHE.audio, u]),
    ]
    offline.total = jobs.length
    offline.done = 0
    if (!jobs.length) return
    const stores = {
      [CACHE.strokes]: await caches.open(CACHE.strokes),
      [CACHE.audio]: await caches.open(CACHE.audio),
    } as Record<string, Cache>
    let next = 0
    const worker = async () => {
      while (next < jobs.length) {
        const [name, url] = jobs[next++]
        try {
          await stores[name].add(url)
        } catch {
          /* z. B. Zeichen ohne Strichdaten – überspringen */
        }
        offline.done++
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker))
  } finally {
    offline.running = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Vorladen etwas verzögert starten (nach dem App-Start bzw. nach Änderungen an Decks) */
export function scheduleWarmUp(delay = 4000) {
  clearTimeout(timer)
  timer = setTimeout(() => void warmUp(), delay)
}

export async function dictCached(): Promise<boolean> {
  if (!supported()) return false
  return !!(await (await caches.open(CACHE.dict)).match(DICT_URL))
}

export async function cacheDictionary() {
  await (await caches.open(CACHE.dict)).add(DICT_URL)
}

/** Belegter Speicher (App, Caches, Datenbank) in MB, wenn der Browser es verrät */
export async function storageUsageMB(): Promise<number | null> {
  const est = await navigator.storage?.estimate?.()
  return est?.usage ? Math.round((est.usage / 1e6) * 10) / 10 : null
}
