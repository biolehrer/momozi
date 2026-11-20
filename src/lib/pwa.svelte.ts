// Service Worker registrieren (Offline-Modus) und über neue Versionen informieren.
import { registerSW } from 'virtual:pwa-register'

export const pwa = $state({
  /** neue Version liegt bereit */
  needRefresh: false,
  /** App ist vollständig offline nutzbar */
  offlineReady: false,
})

let update: ((reload?: boolean) => Promise<void>) | null = null

export function initPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  update = registerSW({
    immediate: true,
    onNeedRefresh() {
      pwa.needRefresh = true
    },
    onOfflineReady() {
      pwa.offlineReady = true
    },
    onRegisteredSW(_url, reg) {
      // bei längerer Nutzung stündlich nach Updates schauen
      if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
}

export async function applyUpdate() {
  pwa.needRefresh = false
  await update?.(true)
}

export function serviceWorkerActive(): boolean {
  return !!navigator.serviceWorker?.controller
}
