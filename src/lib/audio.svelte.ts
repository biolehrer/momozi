// Aussprache: echte Aufnahmen (siehe scripts/build-audio.mjs), abgespielt über Web Audio.
// Web Audio lässt sich nach der ersten Berührung „entsperren“; danach klappt auch automatisches Abspielen (iOS).
import { wordKey, type Word } from './types'

export interface AudioEntry {
  /** Dateiname in ./audio/ */
  f: string
  /** Quelle: tan = Yue Tan, ll = Lingua Libre, ai = KI-Stimme (später) */
  s: 'tan' | 'll' | 'ai'
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
const buffers = new Map<string, Promise<AudioBuffer>>()

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
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

/** Bei jeder Berührung aufrufen: entsperrt die Wiedergabe (iOS/Safari) */
export function unlockAudio() {
  const c = context()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
  // iOS 16.4+: auch bei Stummschalter abspielen, wie bei Medien üblich
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session && session.type !== 'playback') session.type = 'playback'
}

function load(file: string): Promise<AudioBuffer> {
  let p = buffers.get(file)
  if (!p) {
    p = fetch(`${BASE}audio/${file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Audio fehlt: ${file}`)
        return r.arrayBuffer()
      })
      .then((data) => context()!.decodeAudioData(data))
    buffers.set(file, p)
    p.catch(() => buffers.delete(file))
  }
  return p
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
  const c = context()
  if (!entry || !c) return
  if (c.state === 'suspended') await c.resume().catch(() => {})
  try {
    const buffer = await load(entry.f)
    stopAudio()
    const src = c.createBufferSource()
    src.buffer = buffer
    src.connect(c.destination)
    const key = wordKey(w)
    src.onended = () => {
      if (current === src) {
        current = null
        audio.playing = null
      }
    }
    current = src
    audio.playing = key
    src.start()
  } catch {
    audio.playing = null
  }
}
