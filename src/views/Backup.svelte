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
    type BackupFile,
    type BackupStatus,
    type ImportSummary,
  } from '../lib/backup'
  import { go } from '../lib/router.svelte'
  import { app, saveSettings } from '../lib/state.svelte'

  let status = $state<BackupStatus | null>(null)
  let counts = $state({ decks: 0, cards: 0 })
  let prepared: { name: string; text: string } | null = null
  let ready = $state(false)
  let message = $state('')
  let error = $state('')
  let pending = $state<BackupFile | null>(null)
  let summary = $state<ImportSummary | null>(null)
  let fileInput: HTMLInputElement

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
    const r = await shareText(prepared.name, prepared.text, 'Zeichenweise-Sicherung')
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
        const deck = await importDeck(data)
        go(`/deck?id=${deck.id}`)
        return
      }
      pending = data
    } catch (x) {
      error = (x as Error).message
    }
  }

  async function doImport(mode: 'merge' | 'replace') {
    if (!pending) return
    if (mode === 'replace' && !confirm('Wirklich alles auf diesem Gerät durch die Sicherung ersetzen? Der jetzige Lernstand geht dabei verloren.')) return
    summary = await importBackup(pending, mode)
    pending = null
    await refresh()
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
    <div class="card stack fade-in">
      <h2>Sicherung vom {pendingInfo.date}</h2>
      <p class="small muted">{pendingInfo.decks} eigene Decks · {pendingInfo.cards} geübte Karten</p>
      <button class="btn primary block" onclick={() => doImport('merge')}>Zusammenführen</button>
      <p class="small muted">Empfohlen. Für jede Karte zählt der neuere Lernstand; nichts auf diesem Gerät geht verloren.</p>
      <button class="btn bad block" onclick={() => doImport('replace')}>Ersetzen</button>
      <p class="small muted">Dieses Gerät übernimmt genau den Stand der Sicherung.</p>
      <button class="btn ghost block" onclick={() => (pending = null)}>Abbrechen</button>
    </div>
  {/if}

  {#if summary}
    <div class="notice fade-in">
      Fertig: {summary.cardsAdded + summary.cardsUpdated} Karten übernommen{#if summary.decksAdded}, {summary.decksAdded}
        {summary.decksAdded === 1 ? 'Deck' : 'Decks'} hinzugefügt{/if}{#if summary.decksUpdated}, {summary.decksUpdated}
        {summary.decksUpdated === 1 ? 'Deck' : 'Decks'} ergänzt{/if}.
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
