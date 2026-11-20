// Lokale Datenbank (IndexedDB). Alles bleibt auf dem Gerät.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { CardRecord, CustomDeck, ReviewLogRecord } from './types'

interface ZwSchema extends DBSchema {
  decks: { key: string; value: CustomDeck }
  cards: { key: string; value: CardRecord; indexes: { byWord: string } }
  log: { key: number; value: ReviewLogRecord }
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<ZwSchema>> | null = null

export function db(): Promise<IDBPDatabase<ZwSchema>> {
  dbPromise ??= openDB<ZwSchema>('zeichenweise', 1, {
    upgrade(d) {
      d.createObjectStore('decks', { keyPath: 'id' })
      const cards = d.createObjectStore('cards', { keyPath: 'id' })
      cards.createIndex('byWord', 'wordKey')
      d.createObjectStore('log', { autoIncrement: true })
      d.createObjectStore('meta')
    },
  })
  return dbPromise
}

/** Kopie ohne Svelte-Proxies o. Ä., damit IndexedDB sie speichern kann */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', plain(value), key)
}

export async function delMeta(key: string): Promise<void> {
  await (await db()).delete('meta', key)
}

export async function allDecks(): Promise<CustomDeck[]> {
  return (await db()).getAll('decks')
}

export async function putDeck(deck: CustomDeck): Promise<void> {
  await (await db()).put('decks', plain(deck))
}

export async function deleteDeck(id: string): Promise<void> {
  await (await db()).delete('decks', id)
}

export async function allCards(): Promise<CardRecord[]> {
  return (await db()).getAll('cards')
}

export async function cardsForWord(wordKey: string): Promise<CardRecord[]> {
  return (await db()).getAllFromIndex('cards', 'byWord', wordKey)
}
