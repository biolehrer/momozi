<script lang="ts">
  // Neues Wort kennenlernen: Wort, Pinyin, Bedeutung; je Zeichen Strichfolge ansehen und nachzeichnen.
  import SpeakButton from './SpeakButton.svelte'
  import Hanzi from './Hanzi.svelte'
  import Pinyin from './Pinyin.svelte'
  import WritingPad from './WritingPad.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import { alsoPinyin } from '../lib/pinyin'
  import { alsoMeanings } from '../lib/meaning'
  import type { Word } from '../lib/types'

  let { word, ondone }: { word: Word; ondone: () => void } = $props()

  const chars = $derived([...word.s])
  const also = $derived(alsoMeanings(word))
  let idx = $state(0)
  let traced = $state(false)
  let run = $state(0)

  function charDone() {
    traced = true
    if (idx < chars.length - 1) {
      setTimeout(() => {
        idx++
        traced = false
      }, 700)
    }
  }

  const last = $derived(idx === chars.length - 1)

  function next() {
    if (last) {
      ondone()
    } else {
      idx++
      traced = false
    }
  }

  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (k && isPrimary(k)) {
      consume(e)
      next()
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="learn quiz-layout fade-in">
  <div class="q-side">
    <span class="badge accent">Neues Wort</span>
    <div class="head">
      <div class="word zh" lang="zh-Hans"><Hanzi s={word.s} n={word.n} /></div>
      <div class="info">
        {#if word.n}<div class="pinyin"><Pinyin n={word.n} /></div>{/if}
        {#if word.a?.length}<div class="muted small">{alsoPinyin(word.a)}</div>{/if}
        <div class="meaning">{word.m}</div>
      </div>
      <SpeakButton {word} auto />
    </div>
    {#if also}<p class="also-line">{also}</p>{/if}

    {#if chars.length > 1}
      <p class="muted small step">Zeichen {idx + 1} von {chars.length}: <span class="zh">{chars[idx]}</span></p>
    {/if}
  </div>

  <div class="q-stage">
    {#key `${idx}-${run}`}
      <WritingPad char={chars[idx]} mode="learn" reserve={360} oncomplete={charDone} onerror={() => (traced = true)} />
    {/key}
  </div>
  <div class="q-after">
    <p class="muted small hint">Erst zuschauen, dann nachzeichnen.</p>
  </div>
</div>

<div class="dock bottom">
  <div class="dock-inner">
    <button
      class="btn"
      onclick={() => {
        traced = false
        run++
      }}>Nochmal zeigen</button
    >
    <button class="btn" class:primary={last && traced} onclick={next}>
      {last ? 'Weiter' : 'Nächstes Zeichen'} <kbd class="key">↵</kbd>
    </button>
  </div>
</div>

<style>
  .learn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .word {
    font-size: 3.2rem;
    line-height: 1.1;
  }
  .info {
    text-align: left;
  }
  .pinyin {
    font-size: 1.25rem;
    font-weight: 650;
  }
  .meaning {
    color: var(--muted);
    max-width: 16em;
  }
  .step,
  .hint {
    margin: 0;
  }
  /* Querformat: Wort groß in der linken Spalte, Zeichenfläche rechts */
  @media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) {
    .head {
      flex-direction: column;
      gap: 10px;
    }
    .word {
      font-size: 5rem;
    }
    .info {
      text-align: center;
    }
    .pinyin {
      font-size: 1.5rem;
    }
    .meaning {
      max-width: none;
      font-size: 1.15rem;
    }
  }
</style>
