<script lang="ts">
  // „Wörter auswählen“: HSK-Wörter durchstöbern oder suchen, mehrere ankreuzen und
  // gesammelt in ein eigenes Deck übernehmen – oder eine Vokabelliste einfügen.
  import { onMount } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import SpeakButton from '../components/SpeakButton.svelte'
  import { loadDictionary, searchDictionary, type DictEntry } from '../lib/data'
  import {
    groupBySimp,
    itemFromDict,
    loadHskItems,
    matchTokens,
    toEntries,
    tokenize,
    type LibEntry,
    type LibItem,
    type PasteEntry,
  } from '../lib/library'
  import { displayPinyin } from '../lib/pinyin'
  import { back, go, route } from '../lib/router.svelte'
  import { app, createDeck, saveDeck, setActive } from '../lib/state.svelte'
  import { wordKey } from '../lib/types'

  const fromDeck = route.query.get('deck')
  const PAGE = 80

  let target = $state(fromDeck ?? app.decks[0]?.id ?? '')
  let query = $state('')
  let q = $state('')
  /** 'all' | 'selected' | 'dict' | Name eines HSK-Sets */
  let filter = $state('all')
  let limit = $state(PAGE)
  let hsk = $state.raw<LibItem[]>([])
  let hskEntries = $state.raw<LibEntry[]>([])
  let dict = $state.raw<DictEntry[] | null>(null)
  let dictLoading = $state(false)
  let dictError = $state('')
  let pasteOpen = $state(false)
  let pasteText = $state('')
  let paste = $state<PasteEntry[] | null>(null)
  let message = $state('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let dictBySimp: Map<string, DictEntry[]> | null = null

  const selected = new SvelteMap<string, LibItem>()

  const targetDeck = $derived(app.decks.find((d) => d.id === target))
  const inDeck = $derived(new Set(targetDeck?.words.map(wordKey) ?? []))

  onMount(() => {
    loadHskItems().then((items) => {
      hsk = items
      hskEntries = toEntries(items)
    })
    return () => clearTimeout(timer)
  })

  async function ensureDict() {
    if (dict || dictLoading) return
    dictLoading = true
    dictError = ''
    try {
      dict = await loadDictionary()
    } catch {
      dictError = 'Das Wörterbuch konnte nicht geladen werden. Besteht eine Internetverbindung?'
    } finally {
      dictLoading = false
    }
  }

  function onInput() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      q = query.trim()
      limit = PAGE
    }, 160)
    if (query.trim() && (filter === 'all' || filter === 'dict')) ensureDict()
  }

  function setFilter(f: string) {
    filter = f
    limit = PAGE
    if (q && (f === 'all' || f === 'dict')) ensureDict()
  }

  const results = $derived.by((): LibItem[] => {
    if (filter === 'selected') return [...selected.values()]
    if (filter === 'dict') return q && dict ? searchDictionary(dict, q, undefined, 100).map(itemFromDict) : []
    const pool = filter === 'all' ? hskEntries : hskEntries.filter((e) => e.item.set === filter)
    if (!q) return pool.map((e) => e.item)
    const fromHsk = (searchDictionary(pool, q, undefined, 200) as LibEntry[]).map((e) => e.item)
    if (filter !== 'all' || !dict) return fromHsk
    const keys = new Set(fromHsk.map((i) => i.key))
    return [...fromHsk, ...searchDictionary(dict, q, undefined, 60).map(itemFromDict).filter((i) => !keys.has(i.key))]
  })

  function toggle(it: LibItem) {
    if (selected.has(it.key)) selected.delete(it.key)
    else selected.set(it.key, it)
    message = ''
  }

  async function runPaste() {
    await ensureDict()
    const hskBy = groupBySimp(hsk, (i) => i.word.s)
    if (dict && !dictBySimp) dictBySimp = groupBySimp(dict, (e) => e.s)
    const dictBy = dictBySimp ?? new Map<string, DictEntry[]>()
    const tokens = tokenize(
      pasteText,
      (s) => hskBy.has(s) || dictBy.has(s),
      (s) => hskBy.has(s),
    )
    paste = matchTokens(tokens, hskBy, dictBy)
    for (const p of paste) {
      const only = p.options.length === 1 ? p.options[0] : null
      if (only && !inDeck.has(only.key)) selected.set(only.key, only)
    }
    pasteOpen = false
    pasteText = ''
    message = ''
    setFilter('selected')
  }

  /** Bei mehreren Lesungen genau eine auswählen */
  function pick(p: PasteEntry, o: LibItem) {
    for (const other of p.options) if (other.key !== o.key) selected.delete(other.key)
    toggle(o)
  }

  async function addSelected() {
    let deck = targetDeck
    if (!deck) {
      deck = createDeck('Mein Deck')
      await setActive(deck.id, true)
      target = deck.id
    }
    const existing = new Set(deck.words.map(wordKey))
    const fresh = [...selected.values()].map((i) => i.word).filter((w) => !existing.has(wordKey(w)))
    await saveDeck({ ...deck, words: [...deck.words, ...fresh] })
    selected.clear()
    paste = null
    if (fromDeck) {
      back(`/deck?id=${fromDeck}`)
    } else {
      message = `${fresh.length} ${fresh.length === 1 ? 'Wort' : 'Wörter'} zu „${deck.name}“ hinzugefügt.`
      filter = 'all'
    }
  }

  const chips = $derived([
    { id: 'all', label: 'Alle' },
    ...(selected.size ? [{ id: 'selected', label: `Auswahl (${selected.size})` }] : []),
    ...app.sets.map((s) => ({ id: s.name, label: s.name })),
    { id: 'dict', label: 'Wörterbuch' },
  ])

  const pasteFound = $derived(paste?.filter((p) => p.options.length === 1).length ?? 0)
  const pasteChoose = $derived(paste?.filter((p) => p.options.length > 1) ?? [])
  const pasteMissing = $derived(paste?.filter((p) => p.options.length === 0) ?? [])
</script>

<Header title={fromDeck ? 'Wörter hinzufügen' : 'Suche'} backTo={fromDeck ? `/deck?id=${fromDeck}` : undefined}>
  {#snippet actions()}
    <button class="icon-btn" aria-label="Vokabelliste einfügen" title="Vokabelliste einfügen" onclick={() => (pasteOpen = true)}>
      <Icon name="clipboard" />
    </button>
  {/snippet}
</Header>

<div class="page">
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
      aria-label="Wörter suchen"
    />

    {#if !fromDeck}
      {#if app.decks.length > 1}
        <label class="row small target">
          <span class="muted">Hinzufügen zu</span>
          <select class="input select" bind:value={target}>
            {#each app.decks as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
          </select>
        </label>
      {:else if targetDeck}
        <p class="muted small target">Hinzufügen zu „{targetDeck.name}“</p>
      {/if}
    {/if}

    <div class="chips" role="tablist" aria-label="Filter">
      {#each chips as c (c.id)}
        <button class="chip" role="tab" aria-selected={filter === c.id} onclick={() => setFilter(c.id)}>{c.label}</button>
      {/each}
    </div>
  </div>

  {#if message}<div class="notice fade-in msg">{message}</div>{/if}

  {#if pasteOpen}
    <div class="card stack fade-in paste">
      <label for="paste-text"><strong>Vokabelliste einfügen</strong></label>
      <!-- svelte-ignore a11y_autofocus -->
      <textarea id="paste-text" class="input area zh-in" bind:value={pasteText} autofocus placeholder={'z. B. 老师 学生 谢谢\noder ein Wort pro Zeile'}
      ></textarea>
      <p class="muted small">Pinyin, Übersetzungen oder Nummern dürfen mit drinstehen – die App sucht sich die Schriftzeichen heraus.</p>
      <div class="row">
        <button class="btn" onclick={() => (pasteOpen = false)}>Abbrechen</button>
        <button class="btn primary spacer" onclick={runPaste} disabled={!pasteText.trim() || dictLoading}>
          {dictLoading ? 'Lädt …' : 'Wörter finden'}
        </button>
      </div>
    </div>
  {/if}

  {#if paste}
    <div class="card stack fade-in paste">
      <div class="row">
        <strong class="spacer">Aus deiner Liste</strong>
        <button class="icon-btn" aria-label="Schließen" onclick={() => (paste = null)}><Icon name="close" size={20} /></button>
      </div>
      <p class="small summary">
        {pasteFound} gefunden{#if pasteChoose.length}&nbsp;· {pasteChoose.length} mit mehreren Lesungen{/if}{#if pasteMissing.length}&nbsp;· {pasteMissing.length}
          nicht gefunden{/if}
      </p>
      {#each pasteChoose as p (p.token)}
        <div class="choose">
          <div><span class="zh tok">{p.token}</span> <span class="muted small">Welche Lesung ist gemeint?</span></div>
          <div class="options">
            {#each p.options as o (o.key)}
              <button class="opt" class:on={selected.has(o.key)} onclick={() => pick(p, o)}>
                <span class="pinyin">{displayPinyin(o.word.n)}</span>
                <span class="muted small ellipsis">{o.word.m}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
      {#each pasteMissing as p (p.token)}
        <div class="row small">
          <span class="zh tok">{p.token}</span>
          <span class="spacer muted">nicht gefunden</span>
          <button class="btn small" onclick={() => go(`/neu?deck=${encodeURIComponent(target)}&s=${encodeURIComponent(p.token)}`)}>
            Selbst anlegen
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if dictLoading && q}
    <p class="muted small">Wörterbuch wird geladen …</p>
  {:else if dictError && (filter === 'all' || filter === 'dict')}
    <p class="error small">{dictError}</p>
  {/if}

  {#if results.length}
    <div class="list results">
      {#each results.slice(0, limit) as it (it.key)}
        {@const isIn = inDeck.has(it.key)}
        {@const isSel = selected.has(it.key)}
        <div class="list-item item" class:sel={isSel}>
          <button class="pick" disabled={isIn} aria-pressed={isSel} onclick={() => toggle(it)}>
            <span class="check" class:on={isSel} class:in={isIn} aria-hidden="true">
              {#if isSel || isIn}<Icon name="check" size={16} stroke={3} />{/if}
            </span>
            <span class="zh chars" lang="zh-Hans">{it.word.s}</span>
            <span class="info">
              <span class="top">
                <span class="pinyin">{it.word.n ? displayPinyin(it.word.n) : ''}</span>
                {#if it.set}<span class="badge">{it.set}</span>{/if}
                {#if isIn}<span class="badge good">im Deck</span>{/if}
              </span>
              <span class="muted small meaning">{it.word.m}</span>
            </span>
          </button>
          <SpeakButton word={it.word} size={40} />
        </div>
      {/each}
    </div>
    {#if results.length > limit}
      <button class="btn block more" onclick={() => (limit += PAGE)}>Mehr anzeigen ({results.length - limit} weitere)</button>
    {/if}
  {:else if filter === 'dict' && !q}
    <p class="muted hint">Im Wörterbuch nach Zeichen, Pinyin oder Deutsch suchen – für Wörter, die in keiner HSK-Stufe vorkommen.</p>
  {:else if q && !dictLoading}
    <p class="muted hint">Nichts gefunden.</p>
  {/if}

  {#if q && targetDeck}
    <button class="btn block more" onclick={() => go(`/neu?deck=${encodeURIComponent(target)}`)}>Nicht dabei? Selbst anlegen</button>
  {/if}
</div>

<div class="dock">
  <div class="dock-inner">
    {#if selected.size}
      <button
        class="btn"
        onclick={() => {
          selected.clear()
          if (filter === 'selected') filter = 'all'
        }}>Leeren</button
      >
      <button class="btn primary grow2" onclick={addSelected}>
        <Icon name="plus" />
        {selected.size}
        {selected.size === 1 ? 'Wort' : 'Wörter'} hinzufügen
      </button>
    {:else}
      <button class="btn" onclick={() => (pasteOpen = true)}><Icon name="clipboard" size={20} /> Vokabelliste einfügen</button>
    {/if}
  </div>
</div>

<style>
  .target {
    margin: 0 4px;
  }
  .select {
    flex: 1;
    min-height: 44px;
  }
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }
  .chip {
    flex-shrink: 0;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--surface);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .chip[aria-selected='true'] {
    background: var(--ink);
    color: var(--bg);
    border-color: var(--ink);
  }
  .msg,
  .paste {
    margin-top: 14px;
  }
  .area {
    min-height: 120px;
    padding: 12px 14px;
    resize: vertical;
    line-height: 1.5;
  }
  .summary {
    margin: 0;
  }
  .choose {
    border-top: 1px solid var(--line);
    padding-top: 10px;
  }
  .tok {
    font-size: 1.4rem;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
  .opt {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    padding: 8px 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface);
    cursor: pointer;
    min-height: 48px;
  }
  .opt.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .results {
    margin-top: 14px;
  }
  .item {
    padding: 4px 10px 4px 4px;
    gap: 6px;
  }
  .item.sel {
    background: var(--accent-soft);
  }
  .pick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border: none;
    background: transparent;
    text-align: left;
    padding: 8px 6px;
    cursor: pointer;
    color: inherit;
  }
  .pick:disabled {
    cursor: default;
    opacity: 0.75;
  }
  .check {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    border: 2px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--accent-ink);
  }
  .check.on {
    background: var(--accent);
    border-color: var(--accent);
  }
  .check.in {
    background: var(--good);
    border-color: var(--good);
    color: var(--bg);
  }
  .chars {
    font-size: 1.6rem;
    min-width: 1.8em;
  }
  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .pinyin {
    font-weight: 600;
  }
  .meaning {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .more {
    margin-top: 12px;
  }
  .hint {
    margin-top: 16px;
  }
  .error {
    color: var(--bad);
  }
  .grow2 {
    flex: 2;
  }
</style>
