<script lang="ts">
  // Neues Wort kennenlernen: Wort, Pinyin, Bedeutung; je Zeichen Strichfolge ansehen und nachzeichnen.
  import WritingPad from './WritingPad.svelte'
  import { displayPinyin } from '../lib/pinyin'
  import type { Word } from '../lib/types'

  let { word, ondone }: { word: Word; ondone: () => void } = $props()

  const chars = $derived([...word.s])
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
</script>

<div class="learn fade-in">
  <span class="badge accent">Neues Wort</span>
  <div class="head">
    <div class="word zh" lang="zh-Hans">{word.s}</div>
    <div class="info">
      {#if word.n}<div class="pinyin">{displayPinyin(word.n)}</div>{/if}
      <div class="meaning">{word.m}</div>
    </div>
  </div>

  {#if chars.length > 1}
    <p class="muted small step">Zeichen {idx + 1} von {chars.length}: <span class="zh">{chars[idx]}</span></p>
  {/if}

  {#key `${idx}-${run}`}
    <WritingPad char={chars[idx]} mode="learn" reserve={360} oncomplete={charDone} onerror={() => (traced = true)} />
  {/key}
  <p class="muted small hint">Erst zuschauen, dann nachzeichnen.</p>
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
    {#if last}
      <button class="btn" class:primary={traced} onclick={ondone}>Weiter</button>
    {:else}
      <button
        class="btn"
        onclick={() => {
          idx++
          traced = false
        }}>Nächstes Zeichen</button
      >
    {/if}
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
</style>
