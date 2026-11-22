<script lang="ts">
  // Suche: HSK-Wörter durchstöbern oder suchen und zum Ansehen öffnen. Mit „Auswählen“
  // mehrere ankreuzen und gesammelt in ein eigenes Deck übernehmen – oder eine Vokabelliste einfügen.
  import { onMount, tick } from 'svelte'
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
  import { rememberSearch, restoreSearch } from '../lib/search.svelte'
  import { app, createDeck, saveDeck, setActive } from '../lib/state.svelte'
  import { wordKey } from '../lib/types'

  const fromDeck = route.query.get('deck')
  const PAGE = 80
  const context = fromDeck ? `/auswahl?deck=${fromDeck}` : '/suche'
  const prev = restoreSearch(context)

  let target = $state(fromDeck ?? (prev && app.decks.some((d) => d.id === prev.target) ? prev.target : app.decks[0]?.id) ?? '')
  let query = $state(prev?.query ?? '')
  let q = $state(prev?.query.trim() ?? '')
  /** 'all' | 'selected' | Name eines HSK-Sets */
  let filter = $state(prev?.filter ?? 'all')
  /** Auch im Wörterbuch suchen – standardmäßig nur in den HSK-Wörtern (geprüfte Bedeutungen, Aussprache) */
  let withDict = $state(prev?.withDict ?? false)
  /** Auswählen-Modus: Antippen kreuzt an statt das Wort zu öffnen. Aus einem Deck heraus von Anfang an an. */
  let select = $state(prev?.select ?? !!fromDeck)
  let limit = $state(prev?.limit ?? PAGE)
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

  const selected = new SvelteMap<string, LibItem>(prev?.selected)

  const targetDeck = $derived(app.decks.find((d) => d.id === target))
  const inDeck = $derived(new Set(targetDeck?.words.map(wordKey) ?? []))

  onMount(() => {
    if (prev?.withDict && prev.query.trim()) ensureDict()
    loadHskItems().then(async (items) => {
      hsk = items
      hskEntries = toEntries(items)
      // zurück aus einem geöffneten Wort: an dieselbe Stelle der Liste
      if (prev?.scrollY) {
        await tick()
        requestAnimationFrame(() => window.scrollTo(0, prev.scrollY))
      }
    })
    return () => clearTimeout(timer)
  })

  function remember() {
    rememberSearch({ context, query, filter, withDict, select, limit, target, selected: [...selected.entries()], scrollY: window.scrollY })
  }

  function setSelect(on: boolean) {
    select = on
    if (!on && filter === 'selected') setFilter('all')
    message = ''
  }

  /** Wort zum Ansehen öffnen (Schreibweise, Strichfolge, Aussprache) */
  function openItem(it: LibItem) {
    remember()
    const set = app.sets.find((s) => s.name === it.set)
    const src = set ? `set=${encodeURIComponent(set.id)}&k=${encodeURIComponent(it.key)}` : `w=${encodeURIComponent(JSON.stringify(it.word))}`
    const ctx = fromDeck ? `&from=auswahl&deck=${encodeURIComponent(fromDeck)}` : `&from=suche&ziel=${encodeURIComponent(target)}`
    go(`/wort?${src}${ctx}`)
  }

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
    if (query.trim() && withDict) ensureDict()
  }

  function setFilter(f: string) {
    filter = f
    limit = PAGE
  }

  function setWithDict(on: boolean) {
    withDict = on
    limit = PAGE
    // query statt q: q wird erst 160 ms nach dem Tippen gesetzt
    if (on && query.trim()) ensureDict()
  }

  const hskKeys = $derived(new Set(hsk.map((i) => i.key)))

  /** Treffer getrennt nach Herkunft: HSK-Wörter (bzw. die Auswahl) zuerst, Wörterbuch-Treffer nur mit Schalter */
  const found = $derived.by((): { main: LibItem[]; dict: LibItem[] } => {
    if (filter === 'selected') return { main: [...selected.values()], dict: [] }
    const pool = filter === 'all' ? hskEntries : hskEntries.filter((e) => e.item.set === filter)
    if (!q) return { main: pool.map((e) => e.item), dict: [] }
    const main = (searchDictionary(pool, q, undefined, 200) as LibEntry[]).map((e) => e.item)
    const fromDict = withDict && dict ? searchDictionary(dict, q, undefined, 60).map(itemFromDict).filter((i) => !hskKeys.has(i.key)) : []
    return { main, dict: fromDict }
  })
  const total = $derived(found.main.length + found.dict.length)
  const shownMain = $derived(found.main.slice(0, limit))
  const shownDict = $derived(found.dict.slice(0, Math.max(0, limit - found.main.length)))

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
    select = true
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
    ...(select && selected.size ? [{ id: 'selected', label: `Auswahl (${selected.size})` }] : []),
    ...app.sets.map((s) => ({ id: s.name, label: s.name })),
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

    <label class="dict-switch">
      <span class="grow">
        <span>Auswählen</span>
        <span class="muted small block">
          {select ? 'Wörter antippen zum Ankreuzen, dann gesammelt hinzufügen' : 'Aus: Antippen öffnet das Wort mit Strichfolge und Aussprache'}
        </span>
      </span>
      <input type="checkbox" class="switch" checked={select} onchange={(e) => setSelect(e.currentTarget.checked)} />
    </label>
    {#if !fromDeck && select}
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

    {#if filter !== 'selected'}
      <label class="dict-switch">
        <span class="grow">
          <span>Auch im Wörterbuch suchen</span>
          <span class="muted small block">Rund 160.000 weitere Wörter aus HanDeDict, Bedeutungen nicht von Hand geprüft</span>
        </span>
        <input type="checkbox" class="switch" checked={withDict} onchange={(e) => setWithDict(e.currentTarget.checked)} />
      </label>
    {/if}
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
                <span class="pinyin">{displayPinyin(o.word.n)} {#if !o.set}<span class="badge dict">Wörterbuch</span>{/if}</span>
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
        </div>
      {/each}
    </div>
  {/if}

  {#snippet row(it: LibItem)}
    {@const isIn = select && inDeck.has(it.key)}
    {@const isSel = select && selected.has(it.key)}
    <div class="list-item item" class:sel={isSel} class:dict={!it.set}>
      <button
        class="pick"
        disabled={isIn}
        aria-pressed={select ? isSel : undefined}
        onclick={() => (select ? toggle(it) : openItem(it))}
      >
        {#if select}
          <span class="check" class:on={isSel} class:in={isIn} aria-hidden="true">
            {#if isSel || isIn}<Icon name="check" size={16} stroke={3} />{/if}
          </span>
        {/if}
        <span class="zh chars" lang="zh-Hans">{it.word.s}</span>
        <span class="info">
          <span class="top">
            <span class="pinyin">{it.word.n ? displayPinyin(it.word.n) : ''}</span>
            {#if it.set}<span class="badge">{it.set}</span>{:else}<span class="badge dict">Wörterbuch</span>{/if}
            {#if isIn}<span class="badge good">im Deck</span>{/if}
          </span>
          <span class="muted small meaning">{it.word.m}</span>
        </span>
      </button>
      <SpeakButton word={it.word} size={40} />
    </div>
  {/snippet}

  {#if total}
    {#if shownMain.length}
      <div class="list results cols">
        {#each shownMain as it (it.key)}{@render row(it)}{/each}
      </div>
    {/if}
    {#if shownDict.length}
      <p class="dict-head">
        <span class="badge dict">Wörterbuch</span>
        <span>
          {found.main.length ? 'Weitere Treffer, Bedeutungen nicht von Hand geprüft' : 'Kein HSK-Wort gefunden. Bedeutungen hier nicht von Hand geprüft'}
        </span>
      </p>
      <div class="list results cols dict-list">
        {#each shownDict as it (it.key)}{@render row(it)}{/each}
      </div>
    {/if}
    {#if total > limit}
      <button class="btn block more" onclick={() => (limit += PAGE)}>Mehr anzeigen ({total - limit} weitere)</button>
    {/if}
  {/if}

  {#if withDict && q && filter !== 'selected'}
    {#if dictLoading}
      <p class="muted small hint">Wörterbuch wird geladen …</p>
    {:else if dictError}
      <p class="error small hint">{dictError}</p>
    {/if}
  {/if}

  {#if q && !total && !dictLoading}
    <p class="muted hint">
      {#if withDict || filter === 'selected'}
        Nichts gefunden.
      {:else}
        In den HSK-Wörtern nichts gefunden. Mit „Auch im Wörterbuch suchen“ durchsuchst du alle Wörter.
      {/if}
    </p>
  {/if}

</div>

<div class="dock">
  <div class="dock-inner">
    {#if select && selected.size}
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
  /* Wörterbuch-Treffer: blau getönt mit Randstreifen, damit sie sich von den geprüften HSK-Wörtern abheben */
  .item.dict {
    background: var(--dict-soft);
    box-shadow: inset 4px 0 0 var(--dict);
  }
  .item.sel {
    background: var(--accent-soft);
  }
  .dict-switch {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px;
    cursor: pointer;
  }
  .dict-switch .grow {
    flex: 1;
    min-width: 0;
  }
  .block {
    display: block;
  }
  .dict-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 20px 4px 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
  .dict-list {
    margin-top: 8px;
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
    flex-shrink: 0;
    white-space: nowrap;
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
