// Per Drag & Drop abgelegte Sicherung (components/DropImport.svelte) an die Seite „Sicherung“ übergeben –
// dort wird wie beim Laden über den Knopf nach Zusammenführen oder Ersetzen gefragt.
import type { BackupFile } from './backup'

// „raw“: die Sicherung als schlichtes Objekt weitergeben (kein Proxy – IndexedDB könnte ihn nicht speichern)
let backup = $state.raw<BackupFile | null>(null)

export const dropped = {
  get backup() {
    return backup
  },
  set backup(v: BackupFile | null) {
    backup = v
  },
}
