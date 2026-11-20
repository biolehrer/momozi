<script lang="ts">
  import { onMount } from 'svelte'
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import { loadSet } from '../lib/data'
  import { displayPinyin, searchKey } from '../lib/pinyin'
  import { back, go, route } from '../lib/router.svelte'
  import { introducedKeys, overview, type Overview } from '../lib/srs'
  import { deckFile, shareText } from '../lib/backup'
  import { app, isActive, removeDeck, saveDeck, setActive } from '../lib/state.svelte'
  import { wordKey, type Word } from '../lib/types'

  const id = route.query.get('id') ?? ''
  const set = app.sets.find((s) => s.id === id)
  const custom = $derived(app.decks.find((d) => d.id === id))

  let setWords = $state<Word[]>([])
  let known = $state(new Set<string>())
  let filter = $state('')
  let renaming = $state(false)
  let newName = $state('')

  let deckOv = $state<Overview | null>(null)

  onMount(async () => {
    if (set) setWords = (await loadSet(id)).words
    ;[known, deckOv] = await Promise.all([introducedKeys(), overview(id)])
  })

  const words = $derived(custom ? custom.words : setWords)
  const title = $derived(custom?.name ?? set?.name ?? 'Deck')
  const shown = $derived.by(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return words
    const pk = searchKey(q)
    return words.filter((w) => w.s.includes(q) || w.m.toLowerCase().includes(q) || (pk && searchKey(w.n).startsWith(pk)))
  })
  const learnedCount = $derived(words.filter((w) => known.has(wordKey(w))).length)

  async function rename(e: SubmitEvent) {
    e.preventDefault()
    if (!custom || !newName.trim()) return
    await saveDeck({ ...custom, name: newName.trim() })
    renaming = false
  }

  async function del() {
    if (!custom) return
    if (!confirm(`Deck „${custom.name}“ löschen? Der Lernfortschritt der Wörter bleibt erhalten.`)) return
    await removeDeck(custom.id)
    back('/decks')
  }

  let shareMsg = $state('')

  async function share() {
    if (!custom) return
    // Datei sofort bauen: das Teilen-Menü muss direkt aus dem Tippen heraus geöffnet werden
    const f = deckFile(custom)
    const r = await shareText(f.name, f.text, custom.name)
    if (r === 'downloaded') shareMsg = `Deck als „${f.name}“ heruntergeladen – die Datei kannst du jetzt verschicken.`
  }

  function openWord(w: Word) {
    go(`/wort?deck=${encodeURIComponent(id)}&k=${encodeURIComponent(wordKey(w))}`)
  }
</script>

<Header {title} backTo="/decks">
  {#snippet actions()}
    {#if custom}
      <button class="icon-btn" aria-label="Deck teilen" title="Deck teilen" disabled={!custom.words.length} onclick={share}>
        <Icon name="share" />
      </button>
      <button
        class="icon-btn"
        aria-label="Umbenennen"
        onclick={() => {
          newName = custom.name
          renaming = true
        }}><Icon name="edit" /></button
      >
      <button class="icon-btn" aria-label="Deck löschen" onclick={del}><Icon name="trash" /></button>
    {/if}
  {/snippet}
</Header>

<div class="page" class:no-dock={!custom}>
  {#if !custom && !set}
    <p>Dieses Deck gibt es nicht (mehr).</p>
  {:else}
    {#if renaming}
      <form class="card stack fade-in" onsubmit={rename}>
        <div class="field">
          <label for="rename">Neuer Name</label>
          <input id="rename" class="input" bind:value={newName} maxlength="60" />
        </div>
        <div class="row">
          <button type="button" class="btn" onclick={() => (renaming = false)}>Abbrechen</button>
          <button type="submit" class="btn primary spacer">Speichern</button>
        </div>
      </form>
    {/if}

    {#if shareMsg}<div class="notice fade-in share-msg">{shareMsg}</div>{/if}

    <div class="card stack">
      {#if set}<div class="muted small">{set.description}</div>{/if}
      <div class="row">
        <span>{words.length} {words.length === 1 ? 'Wort' : 'Wörter'} · {learnedCount} gelernt</span>
      </div>
      <label class="row">
        <span class="spacer">
          <span>In tägliche Übung aufnehmen</span>
          <span class="muted small sub">Gilt für „Üben starten“ auf der Startseite</span>
        </span>
        <input type="checkbox" class="switch" checked={isActive(id)} onchange={(e) => setActive(id, e.currentTarget.checked)} />
      </label>
      {#if words.length}
        {@const todo = deckOv ? deckOv.due + deckOv.newToday : 0}
        <button class="btn primary block" disabled={!deckOv || todo === 0} onclick={() => go(`/ueben?deck=${encodeURIComponent(id)}`)}>
          {#if !deckOv}
            Dieses Deck üben
          {:else if todo === 0}
            Dieses Deck: gerade nichts zu üben
          {:else}
            Dieses Deck üben · {deckOv.due} fällig, {deckOv.newToday} neu
          {/if}
        </button>
      {/if}
    </div>

    {#if words.length > 12}
      <input class="input filter" type="search" placeholder="Filtern: Zeichen, Pinyin, Deutsch" bind:value={filter} />
    {/if}

    {#if words.length}
      <div class="list words cols three">
        {#each shown as w (wordKey(w))}
          <button class="list-item" onclick={() => openWord(w)}>
            <span class="zh chars" lang="zh-Hans">{w.s}</span>
            <span class="grow">
              <span class="pinyin">{w.n ? displayPinyin(w.n) : ''}</span>
              <span class="muted small ellipsis meaning">{w.m}</span>
            </span>
            {#if known.has(wordKey(w))}<span class="dot learned" title="gelernt"></span>{/if}
          </button>
        {/each}
      </div>
    {:else}
      <div class="card empty">
        <p>Noch keine Wörter in diesem Deck.</p>
        <p class="muted small">
          Über „Wörter hinzufügen“ HSK-Vokabeln ankreuzen, im Wörterbuch suchen oder die Vokabelliste aus dem Kurs einfügen.
        </p>
      </div>
    {/if}
  {/if}
</div>

{#if custom}
  <div class="dock">
    <div class="dock-inner">
      <button class="btn" class:primary={!words.length} onclick={() => go(`/auswahl?deck=${encodeURIComponent(id)}`)}>
        Wörter hinzufügen
      </button>
      <button class="btn" onclick={() => go(`/neu?deck=${encodeURIComponent(id)}`)}>Selbst anlegen</button>
    </div>
  </div>
{/if}

<style>
  .filter {
    margin: 14px 0 10px;
  }
  .sub {
    display: block;
  }
  .share-msg {
    margin-bottom: 12px;
  }
  .words {
    margin-top: 14px;
  }
  .filter + .words {
    margin-top: 0;
  }
  .chars {
    font-size: 1.7rem;
    min-width: 2.2em;
  }
  .grow {
    display: flex;
    flex-direction: column;
  }
  .pinyin {
    font-weight: 600;
  }
  .meaning {
    display: block;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.learned {
    background: var(--good);
  }
  .empty {
    margin-top: 14px;
  }
  .empty p {
    margin: 0 0 6px;
  }
</style>
