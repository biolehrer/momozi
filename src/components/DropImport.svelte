<script lang="ts">
  // Dateien ins App-Fenster ziehen (Mac/PC, iPad mit der Dateien-App daneben) – wie bei Mail-Anhängen:
  // Deck-Dateien werden sofort übernommen, eine Sicherung geht zur Seite „Sicherung“ (Zusammenführen/Ersetzen),
  // also dieselben Wege wie beim Laden über die Knöpfe (views/Decks.svelte, views/Backup.svelte).
  import Icon from './Icon.svelte'
  import { importDeck, parseFile, type BackupFile } from '../lib/backup'
  import { dropped } from '../lib/drop.svelte'
  import { go, route } from '../lib/router.svelte'

  /** dragenter/dragleave feuern für jedes Element einzeln – mitzählen, sonst flackert die Fläche */
  let depth = 0
  let active = $state(false)
  let note = $state<{ text: string; bad: boolean } | null>(null)
  let timer = 0

  /** nur Dateien (keine gezogenen Texte oder Links) */
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  function onEnter(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth++
    active = true
  }

  function onOver(e: DragEvent) {
    if (!hasFiles(e)) return
    // ohne preventDefault würde der Browser die Datei selbst öffnen und die App verlassen
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    active = true
  }

  function onLeave(e: DragEvent) {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) active = false
  }

  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    active = false
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) void handle(files)
  }

  function show(text: string, bad: boolean) {
    note = { text, bad }
    clearTimeout(timer)
    timer = window.setTimeout(() => (note = null), 6000)
  }

  async function handle(files: File[]) {
    const decks: { id: string; name: string }[] = []
    const problems: string[] = []
    let backup: BackupFile | null = null
    for (const f of files) {
      try {
        const data = parseFile(await f.text())
        if (data.type === 'deck') decks.push(await importDeck(data))
        else if (!backup) backup = data
      } catch (x) {
        problems.push(`„${f.name}“: ${(x as Error).message}`)
      }
    }
    if (backup) {
      // Lernstand nie still überschreiben: die Seite „Sicherung“ fragt nach
      dropped.backup = backup
      if (route.path !== '/sicherung') go('/sicherung')
    } else if (decks.length === 1) go(`/deck?id=${decks[0].id}`)
    else if (decks.length > 1) go('/decks')

    const parts: string[] = []
    if (decks.length === 1) parts.push(`Deck „${decks[0].name}“ importiert.`)
    else if (decks.length > 1) parts.push(`${decks.length} Decks importiert.`)
    parts.push(...problems)
    if (parts.length) show(parts.join(' '), !decks.length && !backup)
  }
</script>

<svelte:window ondragenter={onEnter} ondragover={onOver} ondragleave={onLeave} ondrop={onDrop} />

{#if active}
  <div class="drop" aria-hidden="true">
    <div class="zone">
      <Icon name="upload" size={44} stroke={1.8} />
      <strong>Datei hier ablegen</strong>
      <span class="small">Deck oder Sicherung von Momozì</span>
    </div>
  </div>
{/if}

{#if note}
  <div class="note fade-in" class:bad={note.bad} role="status">
    <span class="grow">{note.text}</span>
    <button class="icon-btn" aria-label="Hinweis schließen" onclick={() => (note = null)}><Icon name="close" size={18} /></button>
  </div>
{/if}

<style>
  /* deckt das ganze Fenster ab, lässt die Zieh-Ereignisse aber zu den Elementen darunter durch */
  .drop {
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    background: rgb(0 0 0 / 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: drop-in 0.12s ease;
  }
  .zone {
    width: min(440px, 100%);
    padding: 44px 24px;
    border: 3px dashed var(--accent);
    border-radius: 24px;
    background: var(--bg);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    box-shadow: 0 16px 48px rgb(0 0 0 / 0.3);
  }
  .zone :global(svg) {
    color: var(--accent);
  }
  .zone strong {
    font-size: 1.25rem;
  }
  .zone span {
    color: var(--muted);
  }
  @keyframes drop-in {
    from {
      opacity: 0;
    }
  }
  /* kurze Meldung oben, wie der Hinweis „Neue Version verfügbar“ */
  .note {
    position: fixed;
    z-index: 61;
    left: calc(var(--nav-w) + 12px);
    right: 12px;
    top: calc(var(--safe-top) + 8px);
    max-width: 536px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.15);
    font-weight: 600;
  }
  .note.bad {
    background: var(--bad-soft);
    color: var(--bad);
    border-color: var(--bad-soft);
  }
  .grow {
    flex: 1;
  }
</style>
