<script lang="ts">
  // Abfragen „Pinyin“ und „Bedeutung“: Zeichen sehen, Antwort erinnern, aufdecken, selbst bewerten.
  import SpeakButton from './SpeakButton.svelte'
  import Hanzi from './Hanzi.svelte'
  import Pinyin from './Pinyin.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import { alsoPinyin } from '../lib/pinyin'
  import { alsoMeanings } from '../lib/meaning'
  import type { Word } from '../lib/types'

  let { word, type, onrate }: { word: Word; type: 'pinyin' | 'meaning'; onrate: (grade: 1 | 3) => void } = $props()

  let shown = $state(false)
  const size = $derived([...word.s].length > 3 ? 'm' : 'l')
  const also = $derived(alsoMeanings(word))

  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (!k) return
    if (!shown && isPrimary(k)) {
      consume(e)
      shown = true
    } else if (shown && (k === '1' || k === '2')) {
      consume(e)
      onrate(k === '1' ? 1 : 3)
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="quiz quiz-layout fade-in">
  <div class="q-side">
    <p class="label">{type === 'pinyin' ? 'Wie spricht man das aus?' : 'Was bedeutet das?'}</p>
  </div>
  <div class="q-stage">
    <div class="chars zh {size}" lang="zh-Hans"><Hanzi s={word.s} n={word.n} color={shown} /></div>
  </div>

  <div class="q-after">
    <!-- Bei der Pinyin-Abfrage erst nach dem Aufdecken – sonst wäre die Antwort hörbar -->
    <div class="speak-slot">
      {#if type === 'meaning' || shown}
        {#key shown}
          <SpeakButton {word} auto={shown} />
        {/key}
      {/if}
    </div>

    <div class="answer" class:shown>
      {#if shown}
        {#if type === 'pinyin'}
          <div class="main"><Pinyin n={word.n} /></div>
          {#if word.a?.length}<div class="sub">{alsoPinyin(word.a)}</div>{/if}
          <div class="sub">{word.m}</div>
          {#if also}<p class="also-line">{also}</p>{/if}
        {:else}
          <div class="main">{word.m}</div>
          {#if also}<p class="also-line">{also}</p>{/if}
          {#if word.n}<div class="sub"><Pinyin n={word.n} /></div>{/if}
        {/if}
      {:else}
        <div class="placeholder">Antwort im Kopf überlegen …</div>
      {/if}
    </div>
  </div>
</div>

<div class="dock bottom">
  <div class="dock-inner">
    {#if !shown}
      <button class="btn primary" onclick={() => (shown = true)}>Aufdecken <kbd class="key">↵</kbd></button>
    {:else}
      <button class="btn bad" onclick={() => onrate(1)}>Nochmal <kbd class="key">1</kbd></button>
      <button class="btn good" onclick={() => onrate(3)}>Gewusst <kbd class="key">2</kbd></button>
    {/if}
  </div>
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    padding-top: 12px;
  }
  .label {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .chars {
    line-height: 1.15;
    word-break: break-all;
  }
  .chars.l {
    font-size: clamp(4.5rem, 24vw, 7rem);
  }
  .chars.m {
    font-size: clamp(3rem, 15vw, 4.5rem);
  }
  .speak-slot {
    min-height: 48px;
    margin-top: -6px;
  }
  .answer {
    min-height: 120px;
    width: 100%;
    border-radius: var(--radius);
    border: 1.5px dashed var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    gap: 6px;
  }
  .answer.shown {
    border-style: solid;
    background: var(--surface);
  }
  .main {
    font-size: 1.6rem;
    font-weight: 650;
  }
  .sub {
    color: var(--muted);
  }
  .placeholder {
    color: var(--muted);
  }
  /* Querformat: Zeichen groß auf einer eigenen Fläche rechts */
  @media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) {
    .q-stage {
      width: 100%;
      min-height: calc(100dvh - 160px);
      justify-content: center;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 24px;
    }
    .chars.l {
      font-size: clamp(8rem, 28vh, 15rem);
    }
    .chars.m {
      font-size: clamp(5rem, 14vh, 8rem);
    }
  }
</style>
