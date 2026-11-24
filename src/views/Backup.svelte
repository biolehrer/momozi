<script lang="ts">
  // Sicherung: Lernstand als Datei speichern / laden – mit kurzer Erklärung, wofür das gut ist.
  import { onMount } from 'svelte'
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import {
    backupFilename,
    backupStatus,
    buildBackup,
    formatDate,
    importBackup,
    importDeck,
    markBackedUp,
    parseFile,
    shareText,
    summaryText,
    type BackupFile,
    type BackupStatus,
    type ImportSummary,
  } from '../lib/backup'
  import { announceDecks, celebrate } from '../lib/celebrate.svelte'
  import { dropped } from '../lib/drop.svelte'
  import { app, saveSettings } from '../lib/state.svelte'

  let status = $state<BackupStatus | null>(null)
  let counts = $state({ decks: 0, cards: 0 })
  let prepared: { name: string; text: string } | null = null
  let ready = $state(false)
  let message = $state('')
  let error = $state('')
  let pending = $state<BackupFile | null>(null)
  let summary = $state<ImportSummary | null>(null)
  /** läuft gerade ein Import (Knöpfe sperren, „Wird übernommen …“)? */
  let importing = $state<'merge' | 'replace' | null>(null)
  let fileInput: HTMLInputElement
  let pendingCard: HTMLDivElement | undefined = $state()

  // per Drag & Drop abgelegte Sicherung (components/DropImport.svelte): weiter wie nach „Sicherung laden“
  $effect(() => {
    const b = dropped.backup
    if (!b) return
    dropped.backup = null
    error = ''
    message = ''
    summary = null
    pending = b
    // nach dem Seitenwechsel (der nach oben scrollt) zur Auswahl Zusammenführen/Ersetzen
    setTimeout(() => pendingCard?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
  })

  async function refresh() {
    ready = false
    const [s, b] = await Promise.all([backupStatus(), buildBackup()])
    status = s
    counts = { decks: b.decks.length, cards: b.cards.filter((c) => c.fsrs.reps > 0).length }
    prepared = { name: backupFilename(), text: JSON.stringify(b) }
    ready = true
  }

  onMount(refresh)

  async function save() {
    if (!prepared) return
    error = ''
    const r = await shareText(prepared.name, prepared.text, 'Momozì-Sicherung')
    if (r === 'aborted') return
    await markBackedUp()
    message = r === 'shared' ? 'Sicherung erstellt.' : `Sicherung als „${prepared.name}“ heruntergeladen.`
    await refresh()
  }

  async function onFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const f = input.files?.[0]
    input.value = ''
    if (!f) return
    error = ''
    message = ''
    summary = null
    try {
      const data = parseFile(await f.text())
      if (data.type === 'deck') {
        announceDecks([await importDeck(data)])
        return
      }
      pending = data
    } catch (x) {
      error = (x as Error).message
    }
  }

  async function doImport(mode: 'merge' | 'replace') {
    if (!pending || importing) return
    if (mode === 'replace' && !confirm('Wirklich alles auf diesem Gerät durch die Sicherung ersetzen? Der jetzige Lernstand geht dabei verloren.')) return
    importing = mode
    error = ''
    message = ''
    try {
      const sum = await importBackup(pending, mode)
      // geklappt: Auswahl schließen, kurz bestätigen; die Zahlen bleiben darunter stehen
      pending = null
      summary = sum
      celebrate(mode === 'replace' ? 'Lernstand übernommen' : 'Import erfolgreich', summaryText(sum))
    } catch (x) {
      console.error('Import fehlgeschlagen', x)
      const why = String((x as Error)?.message ?? x).replace(/\.+$/, '')
      error = `Der Import hat nicht geklappt: ${why}. Auf diesem Gerät hat sich nichts geändert.`
    } finally {
      importing = null
    }
    await refresh().catch((x) => console.warn('Übersicht nicht aktualisiert', x))
  }

  const pendingInfo = $derived(
    pending
      ? {
          date: pending.created ? formatDate(Date.parse(pending.created)) : 'unbekannt',
          decks: pending.decks.length,
          cards: pending.cards.filter((c) => c.fsrs.reps > 0).length,
        }
      : null,
  )
</script>

<Header title="Sicherung" backTo="/einstellungen" />

<div class="page no-dock stack">
  <section class="card explain">
    <h2><Icon name="shield" size={22} /> Wofür ist das gut?</h2>
    <p>
      Dein Lernstand liegt <strong>nur hier auf diesem Gerät</strong> – es gibt kein Konto und keinen Server. Löschst du die
      Websitedaten oder die App, ist er weg.
    </p>
    <p>
      Eine Sicherung ist eine kleine Datei, die <strong>du selbst aufbewahrst</strong>, z. B. in „Dateien“, iCloud Drive oder Google
      Drive. Sie wird nirgends hochgeladen und enthält nur deine Decks und deinen Lernstand.
    </p>
    <p>Damit kannst du den Lernstand später wiederherstellen oder auf ein anderes Gerät übertragen, z. B. aufs iPad.</p>
  </section>

  <div class="card stack">
    <div class="row small">
      <span class="spacer muted">Letzte Sicherung</span>
      <span>{status?.lastAt ? formatDate(status.lastAt) : 'noch keine'}</span>
    </div>
    <div class="row small">
      <span class="spacer muted">Auf diesem Gerät</span>
      <span>{counts.decks} {counts.decks === 1 ? 'eigenes Deck' : 'eigene Decks'}, {counts.cards} geübte Karten</span>
    </div>
    {#if status?.lastAt && status.reviewsSince}
      <div class="row small">
        <span class="spacer muted">Seitdem geübt</span>
        <span>{status.reviewsSince} Bewertungen</span>
      </div>
    {/if}
    <button class="btn primary block" disabled={!ready} onclick={save}><Icon name="share" /> Sicherung speichern</button>
    <button class="btn block" onclick={() => fileInput.click()}><Icon name="upload" /> Sicherung laden</button>
    <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onFile} />
  </div>

  {#if message}<div class="notice fade-in">{message}</div>{/if}
  {#if error}<div class="notice error fade-in">{error}</div>{/if}

  {#if pending && pendingInfo}
    <div class="card stack fade-in" bind:this={pendingCard}>
      <h2>Sicherung vom {pendingInfo.date}</h2>
      <p class="small muted">{pendingInfo.decks} eigene Decks · {pendingInfo.cards} geübte Karten</p>
      <button class="btn primary block" disabled={!!importing} onclick={() => doImport('merge')}>
        {importing === 'merge' ? 'Wird übernommen …' : 'Zusammenführen'}
      </button>
      <p class="small muted">Empfohlen. Für jede Karte zählt der neuere Lernstand; nichts auf diesem Gerät geht verloren.</p>
      <button class="btn bad block" disabled={!!importing} onclick={() => doImport('replace')}>
        {importing === 'replace' ? 'Wird übernommen …' : 'Ersetzen'}
      </button>
      <p class="small muted">Dieses Gerät übernimmt genau den Stand der Sicherung.</p>
      <button class="btn ghost block" disabled={!!importing} onclick={() => (pending = null)}>Abbrechen</button>
    </div>
  {/if}

  {#if summary}
    <div class="notice fade-in">
      Sicherung übernommen: {summaryText(summary)}.
      {#if summary.problems.length}
        <span class="sub">Nicht ganz geklappt: {summary.problems.join(', ')}.</span>
      {/if}
    </div>
  {/if}

  <label class="card row reminder">
    <span class="spacer">
      <span>An Sicherung erinnern</span>
      <span class="muted small sub">Ab und zu ein kleiner Hinweis auf der Startseite, wenn es etwas Neues zu sichern gibt.</span>
    </span>
    <input
      type="checkbox"
      class="switch"
      checked={app.settings.backupReminder}
      onchange={async (e) => {
        app.settings.backupReminder = e.currentTarget.checked
        await saveSettings()
      }}
    />
  </label>

  <p class="muted small tip">
    Tipp: Einzelne Decks teilst du im Deck über <Icon name="share" size={14} /> – ohne deinen Lernstand, z. B. für deinen Sprachkurs.
  </p>
</div>

<style>
  .explain h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    color: var(--good);
  }
  .explain p {
    margin: 0 0 8px;
  }
  .explain p:last-child {
    margin-bottom: 0;
  }
  .card:not(.explain) p {
    margin: 0;
  }
  .explain {
    font-size: 0.97rem;
  }
  .block {
    width: 100%;
  }
  .error {
    background: var(--bad-soft);
    color: var(--bad);
  }
  .reminder {
    cursor: pointer;
  }
  .sub {
    display: block;
  }
  .tip {
    margin: 0 4px;
  }
</style>
