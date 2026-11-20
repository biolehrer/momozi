<script lang="ts">
  import { onMount } from 'svelte'
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import { isIos, isStandalone } from '../lib/platform'
  import { cacheDictionary, offline, offlineStatus, storageUsageMB, type OfflineStatus } from '../lib/offline.svelte'
  import { serviceWorkerActive } from '../lib/pwa.svelte'
  import { go } from '../lib/router.svelte'
  import { app, saveSettings } from '../lib/state.svelte'
  import { QUIZ_HINT, QUIZ_LABEL, QUIZ_TYPES, type QuizType, type Theme } from '../lib/types'

  let persisted = $state<boolean | null>(null)
  const ios = isIos()
  const standalone = isStandalone()

  let ostatus = $state<OfflineStatus | null>(null)
  let usage = $state<number | null>(null)
  let dictBusy = $state(false)
  const swActive = serviceWorkerActive()

  async function refreshOffline() {
    ;[ostatus, usage] = await Promise.all([offlineStatus(), storageUsageMB()])
  }

  async function saveDict() {
    dictBusy = true
    try {
      await cacheDictionary()
    } catch {
      /* offline o. Ä. */
    }
    dictBusy = false
    await refreshOffline()
  }

  // nach dem Vorladen den Stand neu anzeigen
  $effect(() => {
    if (!offline.running) void refreshOffline()
  })

  onMount(async () => {
    persisted = (await navigator.storage?.persisted?.()) ?? null
  })

  async function changeNew(delta: number) {
    app.settings.newPerDay = Math.min(50, Math.max(0, app.settings.newPerDay + delta))
    await saveSettings()
  }

  async function toggleType(t: QuizType, on: boolean) {
    const active = QUIZ_TYPES.filter((x) => (x === t ? on : app.settings.types[x]))
    if (!active.length) return // mindestens eine Abfrageart
    app.settings.types[t] = on
    await saveSettings()
  }

  async function setTheme(t: Theme) {
    app.settings.theme = t
    await saveSettings()
  }

  const themes: { id: Theme; label: string }[] = [
    { id: 'auto', label: 'Automatisch' },
    { id: 'light', label: 'Hell' },
    { id: 'dark', label: 'Dunkel' },
  ]
</script>

<Header title="Optionen" />

<div class="page no-dock">
  <p class="section-title">Üben</p>
  <div class="card row">
    <div class="spacer">
      <div>Neue Wörter pro Tag</div>
      <div class="muted small">Wiederholungen sind nicht begrenzt</div>
    </div>
    <div class="stepper">
      <button class="icon-btn" onclick={() => changeNew(-1)} aria-label="Weniger">−</button>
      <span class="value">{app.settings.newPerDay}</span>
      <button class="icon-btn" onclick={() => changeNew(1)} aria-label="Mehr"><Icon name="plus" size={20} /></button>
    </div>
  </div>

  <label class="card row autoplay">
    <span class="spacer">
      <span>Aussprache automatisch abspielen</span>
      <span class="muted small block">Für Bus und Bahn ausschalten – die Lautsprecher-Taste funktioniert weiter.</span>
    </span>
    <input
      type="checkbox"
      class="switch"
      checked={app.settings.autoplay}
      onchange={async (e) => {
        app.settings.autoplay = e.currentTarget.checked
        await saveSettings()
      }}
    />
  </label>

  <p class="section-title">Abfragearten</p>
  <div class="list">
    {#each QUIZ_TYPES as t (t)}
      <label class="list-item">
        <span class="grow">
          <span>{QUIZ_LABEL[t]}</span>
          <span class="muted small block">{QUIZ_HINT[t]}</span>
        </span>
        <input type="checkbox" class="switch" checked={app.settings.types[t]} onchange={(e) => toggleType(t, e.currentTarget.checked)} />
      </label>
    {/each}
  </div>

  <p class="section-title">Darstellung</p>
  <div class="segmented" role="group" aria-label="Farbschema">
    {#each themes as th (th.id)}
      <button aria-pressed={app.settings.theme === th.id} onclick={() => setTheme(th.id)}>{th.label}</button>
    {/each}
  </div>

  <p class="section-title">Offline</p>
  <div class="card stack small offline">
    <div class="row">
      <span class="spacer">App ohne Internet nutzbar</span>
      {#if swActive}
        <span class="ok"><Icon name="check" size={18} stroke={3} /> bereit</span>
      {:else}
        <span class="muted">ab dem nächsten Öffnen</span>
      {/if}
    </div>
    <div class="row">
      <span class="spacer">Strichfolgen & Aussprache deiner Decks</span>
      {#if offline.running}
        <span class="muted">lädt {offline.done}/{offline.total}</span>
      {:else if ostatus}
        {#if ostatus.have >= ostatus.total}
          <span class="ok"><Icon name="check" size={18} stroke={3} /> gespeichert</span>
        {:else}
          <span class="muted">{ostatus.have}/{ostatus.total}</span>
        {/if}
      {/if}
    </div>
    {#if offline.running && offline.total}
      <div class="bar"><div class="fill" style:width="{(offline.done / offline.total) * 100}%"></div></div>
    {/if}
    <div class="row">
      <span class="spacer">
        <span>Wörterbuch für die Suche</span>
        <span class="muted sub">ca. 5 MB – wird sonst beim ersten Suchen gespeichert</span>
      </span>
      {#if ostatus?.dict}
        <span class="ok"><Icon name="check" size={18} stroke={3} /> gespeichert</span>
      {:else}
        <button class="btn small" disabled={dictBusy || !navigator.onLine} onclick={saveDict}>{dictBusy ? 'Lädt …' : 'Speichern'}</button>
      {/if}
    </div>
    {#if usage !== null}<p class="muted">Belegter Speicher insgesamt: {usage} MB</p>{/if}
  </div>

  <p class="section-title">App & Daten</p>
  <div class="card stack small">
    <p>Alle Daten bleiben auf diesem Gerät. Es gibt kein Konto und keine Übertragung an einen Server.</p>
    {#if persisted === true}
      <p class="muted">Der Browser hat dauerhaften Speicher zugesagt.</p>
    {:else if persisted === false}
      <p class="muted">Der Browser kann die Daten bei Speichermangel löschen. Als installierte App ist das unwahrscheinlicher.</p>
    {/if}
    {#if ios}
      <p>
        <strong>iPhone/iPad:</strong> In Safari „Teilen“ → „Zum Home-Bildschirm“. Safari und die installierte App haben getrennte
        Speicher – Fortschritt aus Safari erscheint nicht in der App.
      </p>
    {:else if !standalone}
      <p><strong>Android:</strong> Im Chrome-Menü (⋮) „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.</p>
    {/if}
  </div>
  <div class="list backup-link">
    <button class="list-item" onclick={() => go('/sicherung')}>
      <Icon name="shield" size={22} />
      <span class="grow">
        <span>Sicherung & Übertragen</span>
        <span class="muted small block">Lernstand als Datei speichern oder laden</span>
      </span>
      <Icon name="chevron" size={20} />
    </button>
  </div>

  <p class="section-title">Über</p>
  <div class="list">
    <button class="list-item" onclick={() => go('/lizenzen')}>
      <span class="grow">Quellen & Lizenzen</span>
      <Icon name="chevron" size={20} />
    </button>
    <div class="list-item">
      <span class="grow">Version</span>
      <span class="muted">{__APP_VERSION__}</span>
    </div>
  </div>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    background: var(--surface-2);
    border-radius: 14px;
  }
  .stepper .icon-btn {
    font-size: 1.5rem;
  }
  .value {
    min-width: 2em;
    text-align: center;
    font-weight: 700;
    font-size: 1.15rem;
    font-variant-numeric: tabular-nums;
  }
  .block {
    display: block;
  }
  .autoplay {
    margin-top: 12px;
    cursor: pointer;
  }
  .backup-link {
    margin-top: 12px;
  }
  .offline .row {
    gap: 10px;
  }
  .ok {
    color: var(--good);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    white-space: nowrap;
  }
  .sub {
    display: block;
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
  .card p {
    margin: 0;
  }
</style>
