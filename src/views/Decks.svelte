<script lang="ts">
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import { go } from '../lib/router.svelte'
  import { app, createDeck, isActive, saveDeck, setActive } from '../lib/state.svelte'

  let creating = $state(false)
  let name = $state('')

  async function create(e: SubmitEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const d = createDeck(n)
    await saveDeck(d)
    await setActive(d.id, true)
    creating = false
    name = ''
    go(`/deck?id=${d.id}`)
  }
</script>

<Header title="Decks" />

<div class="page">
  <p class="section-title">Fertige Sets</p>
  <div class="list">
    {#each app.sets as s (s.id)}
      <div class="list-item">
        <button class="grow open" onclick={() => go(`/deck?id=${s.id}`)}>
          <div><strong>{s.name}</strong> <span class="muted small">· {s.count} Wörter</span></div>
          <div class="muted small ellipsis">{s.description}</div>
        </button>
        <input
          type="checkbox"
          class="switch"
          aria-label="{s.name} in Übungen aufnehmen"
          checked={isActive(s.id)}
          onchange={(e) => setActive(s.id, e.currentTarget.checked)}
        />
      </div>
    {/each}
  </div>

  <p class="section-title">Eigene Decks</p>
  <div class="list">
    {#each app.decks as d (d.id)}
      <div class="list-item">
        <button class="grow open" onclick={() => go(`/deck?id=${d.id}`)}>
          <div><strong>{d.name}</strong> <span class="muted small">· {d.words.length} {d.words.length === 1 ? 'Wort' : 'Wörter'}</span></div>
        </button>
        <input
          type="checkbox"
          class="switch"
          aria-label="{d.name} in Übungen aufnehmen"
          checked={isActive(d.id)}
          onchange={(e) => setActive(d.id, e.currentTarget.checked)}
        />
      </div>
    {:else}
      <div class="list-item muted">Noch keine eigenen Decks.</div>
    {/each}
  </div>
  <p class="muted small hint">Der Schalter legt fest, ob ein Deck in die Übungen kommt.</p>

  {#if creating}
    <form class="card stack fade-in" onsubmit={create}>
      <div class="field">
        <label for="deck-name">Name des neuen Decks</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="deck-name" class="input" bind:value={name} placeholder="z. B. Lektion 3" autofocus maxlength="60" />
      </div>
      <div class="row">
        <button type="button" class="btn" onclick={() => (creating = false)}>Abbrechen</button>
        <button type="submit" class="btn primary spacer" disabled={!name.trim()}>Anlegen</button>
      </div>
    </form>
  {/if}
</div>

{#if !creating}
  <div class="dock">
    <div class="dock-inner">
      <button class="btn primary" onclick={() => (creating = true)}><Icon name="plus" /> Neues Deck</button>
    </div>
  </div>
{/if}

<style>
  .open {
    border: none;
    background: transparent;
    text-align: left;
    padding: 4px 0;
    cursor: pointer;
    color: inherit;
  }
  .hint {
    margin: 8px 4px 16px;
  }
</style>
