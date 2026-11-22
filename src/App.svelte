<script lang="ts">
  import { onMount } from 'svelte'
  import TabBar from './components/TabBar.svelte'
  import Icon from './components/Icon.svelte'
  import { scheduleWarmUp } from './lib/offline.svelte'
  import { applyUpdate, pwa } from './lib/pwa.svelte'
  import { route } from './lib/router.svelte'
  import { app, initApp } from './lib/state.svelte'
  import Backup from './views/Backup.svelte'
  import Deck from './views/Deck.svelte'
  import Decks from './views/Decks.svelte'
  import Home from './views/Home.svelte'
  import Licenses from './views/Licenses.svelte'
  import Library from './views/Library.svelte'
  import Practice from './views/Practice.svelte'
  import Settings from './views/Settings.svelte'
  import WordForm from './views/WordForm.svelte'
  import WordView from './views/WordView.svelte'

  let error = $state('')

  onMount(() => {
    initApp().catch((e) => (error = e instanceof Error ? e.message : String(e)))
  })

  const viewKey = $derived(route.path + '?' + route.query.toString())
  const fullscreen = $derived(route.path === '/ueben')
  /** Formulare und Fließtext: auf großen Bildschirmen schmalere Spalte */
  const narrow = $derived(['/einstellungen', '/lizenzen', '/sicherung', '/bearbeiten'].includes(route.path))

  $effect(() => {
    void viewKey
    window.scrollTo(0, 0)
  })

  // Offline-Vorrat aktuell halten: nach dem Start und wenn sich Decks oder Auswahl ändern
  $effect(() => {
    if (!app.ready) return
    void app.decks.reduce((n, d) => n + d.words.length, 0)
    void app.settings.activeDecks.length
    scheduleWarmUp()
  })
</script>

{#if error}
  <div class="page">
    <h1>Hoppla</h1>
    <p>Die App konnte nicht starten: {error}</p>
    <button class="btn" onclick={() => location.reload()}>Neu laden</button>
  </div>
{:else if !app.ready}
  <div class="splash zh" aria-label="Lädt">字</div>
{:else}
  <div class="shell" class:nav={!fullscreen} class:narrow>
    {#key viewKey}
      {#if route.path === '/'}
        <Home />
      {:else if route.path === '/ueben'}
        <Practice />
      {:else if route.path === '/decks'}
        <Decks />
      {:else if route.path === '/deck'}
        <Deck />
      {:else if route.path === '/wort'}
        <WordView />
      {:else if route.path === '/bearbeiten'}
        <WordForm />
      {:else if route.path === '/suche' || route.path === '/auswahl'}
        <Library />
      {:else if route.path === '/einstellungen'}
        <Settings />
      {:else if route.path === '/lizenzen'}
        <Licenses />
      {:else if route.path === '/sicherung'}
        <Backup />
      {:else}
        <Home />
      {/if}
    {/key}
    {#if !fullscreen}<TabBar />{/if}
    {#if pwa.needRefresh && !fullscreen}
      <div class="update fade-in" role="status">
        <span class="grow">Neue Version verfügbar</span>
        <button class="btn small primary" onclick={applyUpdate}>Aktualisieren</button>
        <button class="icon-btn" aria-label="Später" onclick={() => (pwa.needRefresh = false)}><Icon name="close" size={18} /></button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .update {
    position: fixed;
    z-index: 20;
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
  .grow {
    flex: 1;
  }
  .splash {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4rem;
    color: var(--accent);
  }
</style>
