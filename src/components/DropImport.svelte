<script lang="ts">
  // Dateien ins App-Fenster ziehen (Mac/PC, iPad mit der Dateien-App daneben) – wie bei Mail-Anhängen:
  // Sobald eine Datei über dem Fenster schwebt (der Browser meldet das mit dragenter/dragover), wird die Seite
  // leicht weichgezeichnet und ein gestrichelter Kasten erscheint. Nur dort abgelegt wird importiert:
  // Deck-Dateien sofort, eine Sicherung über die Seite „Sicherung“ (Zusammenführen/Ersetzen) –
  // dieselben Wege wie beim Laden über die Knöpfe (views/Decks.svelte, views/Backup.svelte).
  import Icon from './Icon.svelte'
  import { importDeck, parseFile, type BackupFile } from '../lib/backup'
  import { dropped } from '../lib/drop.svelte'
  import { go, route } from '../lib/router.svelte'

  /** dragenter/dragleave feuern für jedes Element einzeln – mitzählen, sonst flackert die Fläche */
  let depth = 0
  let active = $state(false)
  /** schwebt die Datei gerade über dem Kasten? */
  let over = $state(false)
  let zone: HTMLDivElement | undefined = $state()
  let note = $state<{ text: string; bad: boolean } | null>(null)
  let noteTimer = 0

  /**
   * Wird eine Datei gezogen (kein Text, kein Link aus der Seite)? Browser melden das unterschiedlich:
   * meist als Typ „Files“, Firefox auch als „application/x-moz-file“, Safari teils als „public.file-url“,
   * manche nur über die Einträge (kind = file).
   */
  function isFileDrag(e: DragEvent): boolean {
    const dt = e.dataTransfer
    if (!dt) return false
    const types = Array.from(dt.types ?? [])
    if (types.some((t) => t === 'Files' || t === 'application/x-moz-file' || t === 'public.file-url')) return true
    return Array.from(dt.items ?? []).some((it) => it.kind === 'file')
  }

  function inZone(e: DragEvent): boolean {
    const r = zone?.getBoundingClientRect()
    return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  }

  function reset() {
    depth = 0
    active = false
    over = false
  }

  /**
   * Sicherheitsnetz, falls ein dragleave fehlt (Safari): während eines Ziehvorgangs meldet der Browser keine
   * normalen Maus-/Tipp-Ereignisse – kommt wieder eines, ist das Ziehen sicher vorbei.
   * (Keine Zeitgrenze: auf dem iPad kommen beim Stillhalten des Fingers womöglich keine dragover-Meldungen.)
   */
  function dragIsOver() {
    if (active) reset()
  }

  function onEnter(e: DragEvent) {
    if (!isFileDrag(e)) return
    e.preventDefault()
    depth++
    active = true
  }

  function onOver(e: DragEvent) {
    if (!isFileDrag(e)) return
    // ohne preventDefault würde der Browser die Datei selbst öffnen und die App verlassen
    e.preventDefault()
    active = true
    over = inZone(e)
    // außerhalb des Kastens zeigt der Mauszeiger „nicht erlaubt“, über dem Kasten „kopieren“
    if (e.dataTransfer) e.dataTransfer.dropEffect = over ? 'copy' : 'none'
  }

  function onLeave(e: DragEvent) {
    if (!isFileDrag(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) reset()
  }

  function onDrop(e: DragEvent) {
    if (!isFileDrag(e)) return
    e.preventDefault()
    // ist der Kasten gar nicht zu sehen (Erkennung beim Hineinziehen fehlgeschlagen), trotzdem übernehmen
    const hit = !zone || inZone(e)
    reset()
    if (!hit) {
      show('Zum Importieren die Datei in den gestrichelten Kasten ziehen.', false)
      return
    }
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) void handle(files)
  }

  function show(text: string, bad: boolean) {
    note = { text, bad }
    clearTimeout(noteTimer)
    noteTimer = window.setTimeout(() => (note = null), 6000)
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

<svelte:window
  ondragenter={onEnter}
  ondragover={onOver}
  ondragleave={onLeave}
  ondrop={onDrop}
  onmousemove={dragIsOver}
  onpointerdown={dragIsOver}
/>

{#if active}
  <!-- lässt die Zieh-Ereignisse zu den Elementen darunter durch; ob die Datei über dem Kasten ist, zählt die Position -->
  <div class="drop" class:over aria-hidden="true">
    <div class="zone" bind:this={zone}>
      <Icon name="upload" size={48} stroke={1.8} />
      <strong>Deck hier ablegen</strong>
      <span class="small">oder eine Sicherung – Datei aus Momozì (.json)</span>
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
  /* ganze Seite leicht weichgezeichnet, wie bei Mail */
  .drop {
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    background: color-mix(in srgb, var(--bg) 35%, transparent);
    -webkit-backdrop-filter: blur(7px);
    backdrop-filter: blur(7px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: drop-in 0.15s ease;
  }
  .zone {
    width: min(520px, 100%);
    min-height: 260px;
    padding: 40px 28px;
    border: 2.5px dashed var(--accent);
    border-radius: 28px;
    background: color-mix(in srgb, var(--bg) 75%, transparent);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    transition:
      transform 0.12s ease,
      background 0.12s ease;
  }
  /* Datei schwebt über dem Kasten: hervorheben */
  .drop.over .zone {
    border-style: solid;
    background: var(--accent-soft);
    transform: scale(1.03);
  }
  .zone :global(svg) {
    color: var(--accent);
  }
  .zone strong {
    font-size: 1.35rem;
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
