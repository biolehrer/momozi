<script lang="ts">
  import { onMount } from 'svelte'
  import Header from '../components/Header.svelte'
  import Icon from '../components/Icon.svelte'
  import SpeakButton from '../components/SpeakButton.svelte'
  import WritingPad from '../components/WritingPad.svelte'
  import { loadSet } from '../lib/data'
  import { SENSE_SEP } from '../lib/meaning'
  import { displayPinyin } from '../lib/pinyin'
  import { back, go, route } from '../lib/router.svelte'
  import { typesFor, wordProgress } from '../lib/srs'
  import { app, saveDeck } from '../lib/state.svelte'
  import { QUIZ_LABEL, wordKey, type CardRecord, type QuizType, type Word } from '../lib/types'

  const deckId = route.query.get('deck') ?? ''
  const key = route.query.get('k') ?? ''
  const custom = app.decks.find((d) => d.id === deckId)

  let word = $state<Word | null>(null)
  let progress = $state(new Map<QuizType, CardRecord>())
  let loaded = $state(false)
  let pads: (WritingPad | undefined)[] = $state([])

  onMount(async () => {
    const words = custom ? custom.words : app.sets.some((s) => s.id === deckId) ? (await loadSet(deckId)).words : []
    word = words.find((w) => wordKey(w) === key) ?? null
    if (word) progress = await wordProgress(word)
    loaded = true
  })

  const chars = $derived(word ? [...word.s] : [])
  const padSize = $derived(
    Math.max(72, Math.min(170, Math.floor((Math.min(window.innerWidth, 560) - 72) / Math.max(1, chars.length)) - 8)),
  )

  function status(t: QuizType): string {
    const c = progress.get(t)
    if (!c || c.fsrs.reps === 0) return 'neu'
    const days = Math.round((c.fsrs.due.getTime() - Date.now()) / 86400000)
    if (days <= 0) return 'fällig'
    if (days === 1) return 'morgen'
    if (days < 31) return `in ${days} Tagen`
    return `in ${Math.round(days / 30)} Monaten`
  }

  async function removeFromDeck() {
    if (!custom || !word) return
    if (!confirm(`„${word.s}“ aus „${custom.name}“ entfernen?`)) return
    await saveDeck({ ...custom, words: custom.words.filter((w) => wordKey(w) !== key) })
    back(`/deck?id=${deckId}`)
  }

  function playAll() {
    pads.forEach((p, i) => setTimeout(() => p?.animate(), i * 1600))
  }
</script>

<Header title={word?.s ?? 'Wort'} backTo={`/deck?id=${deckId}`}>
  {#snippet actions()}
    {#if custom && word}
      <button
        class="icon-btn"
        aria-label="Bearbeiten"
        onclick={() => go(`/bearbeiten?deck=${encodeURIComponent(deckId)}&k=${encodeURIComponent(key)}`)}><Icon name="edit" /></button
      >
    {/if}
  {/snippet}
</Header>

<div class="page no-dock stack">
  {#if !loaded}
    <p class="muted">Lädt …</p>
  {:else if !word}
    <p>Wort nicht gefunden.</p>
  {:else}
    <div class="card stack center">
      <div class="pads">
        {#each chars as c, i (i)}
          <button class="pad-btn" onclick={() => pads[i]?.animate()} aria-label="Strichfolge von {c} abspielen">
            <WritingPad bind:this={pads[i]} char={c} mode="view" fixedSize={padSize} />
          </button>
        {/each}
      </div>
      <button class="btn small" onclick={playAll}><Icon name="play" size={18} /> Strichfolge abspielen</button>
      <div class="pinyin-row">
        {#if word.n}<span class="pinyin">{displayPinyin(word.n)}</span>{/if}
        <SpeakButton {word} size={44} />
      </div>
      <div class="meaning">{word.m}</div>
    </div>

    {#if word.x && word.x !== word.m}
      <p class="section-title">Weitere Bedeutungen</p>
      <ul class="card senses">
        {#each word.x.split(SENSE_SEP) as sense, i (i)}
          <li>{sense}</li>
        {/each}
      </ul>
    {/if}

    <p class="section-title">Lernstand</p>
    <div class="list">
      {#each typesFor(word) as t (t)}
        <div class="list-item">
          <span class="grow">{QUIZ_LABEL[t]}</span>
          <span class="badge" class:good={status(t).startsWith('in') || status(t) === 'morgen'}>{status(t)}</span>
        </div>
      {/each}
    </div>

    {#if custom}
      <button class="btn bad block" onclick={removeFromDeck}><Icon name="trash" size={20} /> Aus „{custom.name}“ entfernen</button>
    {/if}
  {/if}
</div>

<style>
  .center {
    align-items: center;
    text-align: center;
  }
  .pads {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .pad-btn {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .pinyin-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pinyin {
    font-size: 1.4rem;
    font-weight: 650;
  }
  .meaning {
    font-size: 1.1rem;
  }
  .senses {
    margin: 0;
    padding: 12px 16px 12px 34px;
  }
  .senses li + li {
    margin-top: 6px;
  }
</style>
