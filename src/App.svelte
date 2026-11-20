<script lang="ts">
  import { onMount } from 'svelte'
  import TabBar from './components/TabBar.svelte'
  import { route } from './lib/router.svelte'
  import { app, initApp } from './lib/state.svelte'
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

  $effect(() => {
    void viewKey
    window.scrollTo(0, 0)
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
    {:else if route.path === '/neu' || route.path === '/bearbeiten'}
      <WordForm />
    {:else if route.path === '/suche' || route.path === '/auswahl'}
      <Library />
    {:else if route.path === '/einstellungen'}
      <Settings />
    {:else if route.path === '/lizenzen'}
      <Licenses />
    {:else}
      <Home />
    {/if}
  {/key}
  {#if !fullscreen}<TabBar />{/if}
{/if}

<style>
  .splash {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4rem;
    color: var(--accent);
  }
</style>
