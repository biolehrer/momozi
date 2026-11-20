<script lang="ts">
  import { onMount } from 'svelte'
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import { loadDictionary, loadSet, searchDictionary, wordFromDict, type DictEntry } from '../lib/data'
  import { displayPinyin, normalizeNumeric } from '../lib/pinyin'
  import { go, route } from '../lib/router.svelte'
  import { app, createDeck, saveDeck, setActive } from '../lib/state.svelte'
  import { wordKey } from '../lib/types'

  const fromDeck = route.query.get('deck')
  let target = $state(fromDeck ?? app.decks[0]?.id ?? '')
  let query = $state('')
  let results = $state<DictEntry[]>([])
  let dict = $state.raw<DictEntry[] | null>(null)
  let loading = $state(false)
  let loadError = $state('')
  let expanded = $state<string | null>(null)
  let boost = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const targetDeck = $derived(app.decks.find((d) => d.id === target))
  const inDeck = $derived(new Set(targetDeck?.words.map(wordKey) ?? []))

  async function ensureDict() {
    if (dict || loading) return
    loading = true
    loadError = ''
    try {
      dict = await loadDictionary()
      for (const s of app.sets) for (const w of (await loadSet(s.id)).words) boost.add(w.s)
      run()
    } catch {
      loadError = 'Das Wörterbuch konnte nicht geladen werden. Besteht eine Internetverbindung?'
    } finally {
      loading = false
    }
  }

  function run() {
    if (!dict) return
    results = searchDictionary(dict, query, boost)
  }

  function onInput() {
    ensureDict()
    clearTimeout(timer)
    timer = setTimeout(run, 180)
  }

  onMount(() => {
    // Wörterbuch schon vorladen, sobald die Suche geöffnet wird
    ensureDict()
    return () => clearTimeout(timer)
  })

  async function add(e: DictEntry) {
    let deck = targetDeck
    if (!deck) {
      deck = createDeck('Mein Deck')
      await setActive(deck.id, true)
      target = deck.id
    }
    const w = wordFromDict(e)
    if (deck.words.some((x) => wordKey(x) === wordKey(w))) return
    await saveDeck({ ...deck, words: [...deck.words, w] })
  }

  function keyOf(e: DictEntry) {
    return `${e.s}|${normalizeNumeric(e.n)}`
  }
</script>

<Header title={fromDeck ? 'Wörter hinzufügen' : 'Suche'} backTo={fromDeck ? `/deck?id=${fromDeck}` : undefined} />

<div class="page no-dock">
  <div class="stack">
    <input
      class="input"
      type="search"
      enterkeyhint="search"
      placeholder="Zeichen, Pinyin oder Deutsch"
      autocomplete="off"
      autocapitalize="none"
      spellcheck="false"
      bind:value={query}
      oninput={onInput}
      aria-label="Wörterbuch durchsuchen"
    />
    {#if app.decks.length > 1}
      <label class="row small">
        <span class="muted">Hinzufügen zu</span>
        <select class="input select" bind:value={target}>
          {#each app.decks as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
        </select>
      </label>
    {:else if targetDeck}
      <p class="muted small target">Hinzufügen zu „{targetDeck.name}“</p>
    {/if}
  </div>

  {#if loading}
    <p class="muted">Wörterbuch wird geladen …</p>
  {:else if loadError}
    <p class="error">{loadError}</p>
  {/if}

  {#if results.length}
    <div class="list results">
      {#each results as e (keyOf(e))}
        {@const added = inDeck.has(keyOf(e))}
        <div class="list-item">
          <button class="grow entry" onclick={() => (expanded = expanded === keyOf(e) ? null : keyOf(e))}>
            <span class="row top">
              <span class="zh chars" lang="zh-Hans">{e.s}</span>
              <span class="pinyin">{displayPinyin(e.n)}</span>
            </span>
            <span class="meaning small" class:clamp={expanded !== keyOf(e)}>{e.m}</span>
          </button>
          <button
            class="icon-btn add"
            class:added
            disabled={added}
            onclick={() => add(e)}
            aria-label={added ? `${e.s} ist im Deck` : `${e.s} hinzufügen`}
          >
            <Icon name={added ? 'check' : 'plus'} />
          </button>
        </div>
      {/each}
    </div>
  {:else if query.trim() && !loading && dict}
    <p class="muted">Nichts gefunden.</p>
  {/if}

  {#if query.trim() && targetDeck}
    <button class="btn block notfound" onclick={() => go(`/neu?deck=${target}`)}>Nicht dabei? Selbst anlegen</button>
  {/if}

  <p class="muted small source">Wörterbuch: HanDeDict (CC BY-SA)</p>
</div>

<style>
  .target {
    margin: 0 4px;
  }
  .select {
    flex: 1;
    min-height: 44px;
  }
  .results {
    margin-top: 14px;
  }
  .entry {
    border: none;
    background: transparent;
    text-align: left;
    padding: 2px 0;
    cursor: pointer;
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .top {
    gap: 10px;
    align-items: baseline;
  }
  .chars {
    font-size: 1.6rem;
  }
  .pinyin {
    font-weight: 600;
  }
  .meaning {
    color: var(--muted);
  }
  .clamp {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .add {
    background: var(--accent-soft);
    color: var(--accent);
    flex-shrink: 0;
  }
  .add.added {
    background: var(--good-soft);
    color: var(--good);
    opacity: 1;
  }
  .notfound {
    margin-top: 14px;
  }
  .error {
    color: var(--bad);
  }
  .source {
    margin-top: 20px;
    text-align: center;
  }
</style>
