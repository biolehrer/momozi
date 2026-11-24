// Globaler App-Zustand: Einstellungen, eigene Decks, verfügbare HSK-Sets.
import { allDecks, deleteDeck, getMeta, putDeck, setMeta } from './db'
import { loadSetIndex } from './data'
import { loadAudioIndex } from './audio.svelte'
import { migrateData } from './migrate'
import { FLAGGED, loadMarks } from './marks.svelte'
import { refreshStreak, startStreakClock } from './streak.svelte'
import type { CustomDeck, Settings, SetInfo } from './types'

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 10,
  types: { write: true, pinyin: true, tone: true, meaning: true },
  theme: 'auto',
  activeDecks: ['hsk1'],
  autoplay: true,
  backupReminder: true,
  toneColors: false,
}

export const app = $state({
  ready: false,
  settings: structuredClone(DEFAULT_SETTINGS) as Settings,
  decks: [] as CustomDeck[],
  sets: [] as SetInfo[],
})

/** Installations-Angebot des Browsers (Android/Chrome), falls vorhanden */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}
export const install = $state<{ event: InstallPromptEvent | null }>({ event: null })

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    install.event = e as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => (install.event = null))
}

export async function initApp() {
  const saved = await getMeta<Settings>('settings')
  app.settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    types: { ...DEFAULT_SETTINGS.types, ...saved?.types },
  }
  // Lernstand an korrigierte Wortdaten anpassen (einmal je Datenstand); ohne Netz beim nächsten Start
  await migrateData().catch((e) => console.warn('Datenanpassung übersprungen:', e))
  let decks = await allDecks()
  if (!(await getMeta('initialized'))) {
    // Beim allerersten Start ein leeres eigenes Deck anlegen
    if (!decks.length) {
      const d = createDeck('Mein Deck')
      await putDeck(d)
      decks = [d]
      app.settings.activeDecks.push(d.id)
    }
    await setMeta('initialized', true)
    await saveSettings()
  }
  app.decks = decks.sort((a, b) => a.createdAt - b.createdAt)
  ;[app.sets] = await Promise.all([loadSetIndex(), loadAudioIndex(), loadMarks(), refreshStreak()])
  startStreakClock()
  applyTheme()
  app.ready = true
  // Browser bitten, die Daten nicht automatisch zu löschen
  navigator.storage?.persist?.().catch(() => {})
}

export async function saveSettings() {
  await setMeta('settings', $state.snapshot(app.settings))
  applyTheme()
}

export function applyTheme() {
  const root = document.documentElement
  const t = app.settings.theme
  if (t === 'auto') delete root.dataset.theme
  else root.dataset.theme = t
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.orig ??= m.content
    m.content = t === 'auto' ? m.dataset.orig : bg
  })
}

export function createDeck(name: string): CustomDeck {
  return {
    id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    words: [],
    createdAt: Date.now(),
  }
}

export async function saveDeck(deck: CustomDeck) {
  const snap = $state.snapshot(deck) as CustomDeck
  await putDeck(snap)
  const i = app.decks.findIndex((d) => d.id === deck.id)
  if (i >= 0) app.decks[i] = snap
  else app.decks.push(snap)
}

export async function removeDeck(id: string) {
  await deleteDeck(id)
  app.decks = app.decks.filter((d) => d.id !== id)
  if (app.settings.activeDecks.includes(id)) {
    app.settings.activeDecks = app.settings.activeDecks.filter((x) => x !== id)
    await saveSettings()
  }
}

export function isActive(id: string): boolean {
  return app.settings.activeDecks.includes(id)
}

export async function setActive(id: string, on: boolean) {
  const list = app.settings.activeDecks.filter((x) => x !== id)
  if (on) list.push(id)
  app.settings.activeDecks = list
  await saveSettings()
}

export function deckName(id: string): string {
  if (id === FLAGGED) return 'Markiert'
  return app.decks.find((d) => d.id === id)?.name ?? app.sets.find((s) => s.id === id)?.name ?? 'Deck'
}
