// Aussprache: echte Aufnahmen (siehe scripts/build-audio.mjs), abgespielt über Web Audio.
// Web Audio lässt sich nach der ersten Berührung „entsperren“; danach klappt auch automatisches Abspielen (iOS).
// iOS unterbricht die Wiedergabe beim Sperren des Geräts oder beim Wechsel in eine andere App – der AudioContext
// hing danach („interrupted“) oder blieb stumm, obwohl er „lief“, bis zum Neustart der App. Darum wird er beim
// Verlassen der App geschlossen und beim nächsten Antippen frisch angelegt (siehe initAudio).
import { wordKey, type Word } from './types'

export interface AudioEntry {
  /** Dateiname in ./audio/ */
  f: string
  /** Quelle: tan = Yue Tan, ll = Lingua Libre, ai = KI-Stimme */
  s: 'tan' | 'll' | 'ai'
  /** einsilbiges Wort ohne eigene Aufnahme: Zeichen mit gleicher Aussprache, dessen Aufnahme verwendet wird */
  h?: string
  /** Sprecher/in (Lingua Libre) */
  a?: string
  /** Lizenz (Lingua Libre) */
  l?: string
  /** Seite der Originaldatei */
  p?: string
}

export interface AudioIndex {
  sources: Record<string, { name: string; license?: string; licenseUrl?: string; url: string; note?: string }>
  words: Record<string, AudioEntry>
}

export const audio = $state({
  index: null as AudioIndex | null,
  /** wordKey des gerade abgespielten Wortes */
  playing: null as string | null,
})

const BASE = import.meta.env.BASE_URL
let ctx: AudioContext | null = null
let current: AudioBufferSourceNode | null = null
/** dekodierte Aufnahmen – gelten für jeden AudioContext; die zuletzt gebrauchten MAX_BUFFERS bleiben im Speicher */
const buffers = new Map<string, Promise<AudioBuffer>>()
const MAX_BUFFERS = 40
const gains = new Map<string, number>()

/** Lautheit angleichen: Aufnahmen verschiedener Quellen sind unterschiedlich laut */
const TARGET_RMS = 0.09
const PEAK_LIMIT = 0.95

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function gainFor(file: string, buffer: AudioBuffer): number {
  let g = gains.get(file)
  if (g === undefined) {
    const d = buffer.getChannelData(0)
    let sum = 0
    let peak = 0
    for (let i = 0; i < d.length; i++) {
      const v = d[i]
      sum += v * v
      const a = Math.abs(v)
      if (a > peak) peak = a
    }
    const rms = Math.sqrt(sum / Math.max(1, d.length)) || 1
    g = Math.min(TARGET_RMS / rms, PEAK_LIMIT / (peak || 1))
    gains.set(file, g)
  }
  return g
}

export async function loadAudioIndex() {
  try {
    const res = await fetch(`${BASE}data/audio.json`)
    if (res.ok) audio.index = (await res.json()) as AudioIndex
  } catch {
    /* ohne Index gibt es eben keine Aussprache */
  }
}

export function audioFor(w: Word): AudioEntry | undefined {
  return audio.index?.words[wordKey(w)]
}

function context(): AudioContext | null {
  if (!ctx || ctx.state === 'closed') {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

/** AudioContext verwerfen – der nächste entsteht frisch, wie nach einem Neustart der App */
function dropContext() {
  stopAudio()
  const old = ctx
  ctx = null
  if (old && old.state !== 'closed') old.close().catch(() => {})
}

/**
 * Wiedergabe startklar machen. Wirkt auf iOS nur aus einer Berührung oder Taste heraus – darum bei jeder
 * Berührung (initAudio) und beim Antippen des Lautsprechers.
 */
function prepare(): AudioContext | null {
  // nach einer Unterbrechung durch das System hängen geblieben (Safari: „interrupted“): frisch anlegen
  if (ctx?.state === 'interrupted') dropContext()
  const c = context()
  if (c?.state === 'suspended') c.resume().catch(() => {})
  return c
}

/** Bei jeder Berührung aufrufen: entsperrt die Wiedergabe (iOS/Safari) */
export function unlockAudio() {
  prepare()
  // iOS 16.4+: auch bei Stummschalter abspielen, wie bei Medien üblich
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session && session.type !== 'playback') session.type = 'playback'
}

/** einmal beim Start: bei jeder Berührung entsperren, beim Verlassen der App den AudioContext schließen */
export function initAudio() {
  const opts: AddEventListenerOptions = { capture: true, passive: true }
  // pointerup: auf Touch-Geräten gilt erst das Loslassen als Geste, die Ton freigibt
  for (const type of ['pointerdown', 'pointerup', 'keydown'] as const) window.addEventListener(type, unlockAudio, opts)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') dropContext()
  })
  window.addEventListener('pagehide', dropContext)
}

function load(file: string): Promise<AudioBuffer> {
  let p = buffers.get(file)
  if (p) {
    // zuletzt gebraucht: ans Ende der Reihe (siehe MAX_BUFFERS)
    buffers.delete(file)
  } else {
    const loading = fetch(`${BASE}audio/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Audio fehlt: ${file}`)
        return r.arrayBuffer()
      })
      .then((data) => {
        const c = context()
        if (!c) throw new Error('Kein Web Audio')
        return c.decodeAudioData(data)
      })
    loading.catch(() => {
      if (buffers.get(file) === loading) buffers.delete(file)
    })
    p = loading
  }
  buffers.set(file, p)
  for (const key of buffers.keys()) {
    if (buffers.size <= MAX_BUFFERS) break
    buffers.delete(key)
  }
  return p
}

/** Aufnahme vorab laden und dekodieren (nächste Karten), damit sie beim Erscheinen sofort abspielt */
export function preloadAudio(w: Word) {
  const entry = audioFor(w)
  if (entry) load(entry.f).then((b) => gainFor(entry.f, b), () => {})
}

export function stopAudio() {
  try {
    current?.stop()
  } catch {
    /* schon beendet */
  }
  current = null
  audio.playing = null
}

export async function playWord(w: Word) {
  const entry = audioFor(w)
  if (!entry) return
  const c = prepare()
  if (!c) return
  try {
    const buffer = await load(entry.f)
    // noch nicht freigegeben (z. B. nach dem Entsperren noch nicht angetippt): kurz warten – und sonst nicht so
    // tun, als liefe es (Taste leuchtet nur, wenn wirklich abgespielt wird)
    if (c.state !== 'running') await Promise.race([c.resume(), sleep(400)]).catch(() => {})
    if (c !== ctx || c.state !== 'running') return
    stopAudio()
    const src = c.createBufferSource()
    src.buffer = buffer
    const gain = c.createGain()
    gain.gain.value = gainFor(entry.f, buffer)
    src.connect(gain).connect(c.destination)
    const t = c.currentTime
    const key = wordKey(w)
    const done = () => {
      if (current === src) {
        current = null
        audio.playing = null
      }
    }
    src.onended = done
    // Rückfall, falls die Wiedergabe nie endet: Taste nicht weiter leuchten lassen. Stand die Uhr des Kontexts
    // dabei still, obwohl er „läuft“, ist er stumm hängen geblieben – verwerfen, das nächste Antippen legt einen
    // frischen an (wie ein Neustart der App). Großzügig bemessen, damit ein spät startender Ton nicht stört.
    setTimeout(() => {
      if (current !== src) return
      if (ctx === c && c.currentTime - t < 0.2) dropContext()
      else done()
    }, (buffer.duration + 2) * 1000)
    current = src
    audio.playing = key
    src.start()
  } catch {
    audio.playing = null
  }
}
