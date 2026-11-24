// Per Drag & Drop abgelegte Sicherung (components/DropImport.svelte) an die Seite „Sicherung“ übergeben –
// dort wird wie beim Laden über den Knopf nach Zusammenführen oder Ersetzen gefragt.
import type { BackupFile } from './backup'

export const dropped = $state({ backup: null as BackupFile | null })
