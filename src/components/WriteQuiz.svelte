<script lang="ts">
  // Abfrage „Schreiben“: Bedeutung + Pinyin sehen, Zeichen für Zeichen aus dem Gedächtnis schreiben.
  import WritingPad from './WritingPad.svelte'
  import { displayPinyin } from '../lib/pinyin'
  import type { Word } from '../lib/types'

  let {
    word,
    startChar = 0,
    onrate,
    onprogress,
  }: {
    word: Word
    startChar?: number
    onrate: (grade: 1 | 3) => void
    onprogress?: (charIndex: number) => void
  } = $props()

  const chars = $derived([...word.s])
  // Startwert genügt: die Komponente wird für jede Karte neu erzeugt
  // svelte-ignore state_referenced_locally
  let idx = $state(Math.min(startChar, [...word.s].length - 1))
  let mistakes = $state(0)
  let hinted = $state(false)
  let finished = $state(false)
  let noData = $state(false)
  let paperRevealed = $state(false)
  let pad: WritingPad | undefined = $state()

  const suggested = $derived<1 | 3>(!hinted && mistakes <= 1 ? 3 : 1)

  function charDone(r: { mistakes: number; hinted: boolean }) {
    mistakes += r.mistakes
    if (r.hinted) hinted = true
    if (idx < chars.length - 1) {
      setTimeout(() => {
        idx++
        onprogress?.(idx)
      }, 600)
    } else {
      setTimeout(() => (finished = true), 450)
    }
  }

  function showSolution() {
    hinted = true
    pad?.reveal()
  }
</script>

<div class="quiz fade-in">
  <p class="label">Schreiben</p>
  <div class="prompt">
    <div class="meaning">{word.m}</div>
    {#if word.n}<div class="pinyin">{displayPinyin(word.n)}</div>{/if}
  </div>

  {#if chars.length > 1}
    <div class="slots zh" aria-hidden="true">
      {#each chars as c, i (i)}
        <span class="slot" class:current={i === idx && !finished} class:filled={i < idx || finished}>
          {i < idx || finished ? c : ''}
        </span>
      {/each}
    </div>
  {/if}

  {#if noData}
    <div class="card center">
      {#if paperRevealed}
        <div class="big zh">{word.s}</div>
      {:else}
        <p>Für dieses Wort gibt es keine Strichdaten. Schreib es auf Papier und deck dann auf.</p>
      {/if}
    </div>
  {:else}
    {#key idx}
      <WritingPad bind:this={pad} char={chars[idx]} mode="test" oncomplete={charDone} onerror={() => (noData = true)} />
    {/key}
  {/if}
  {#if finished}
    <div class="result fade-in">
      {#if hinted}
        <span class="badge accent">mit Hilfe</span>
      {:else if mistakes === 0}
        <span class="badge good">fehlerfrei</span>
      {:else}
        <span class="badge">{mistakes} {mistakes === 1 ? 'Fehler' : 'Fehler'}</span>
      {/if}
    </div>
  {/if}
</div>

<div class="dock bottom">
  <div class="dock-inner">
    {#if noData && !paperRevealed}
      <button class="btn primary" onclick={() => (paperRevealed = true)}>Aufdecken</button>
    {:else if !finished && !noData}
      <button class="btn" onclick={showSolution}>Lösung zeigen</button>
    {:else}
      <button class="btn" class:bad={finished && suggested === 1} onclick={() => onrate(1)}>Nochmal</button>
      <button class="btn" class:good={!finished || suggested === 3} onclick={() => onrate(3)}>Gewusst</button>
    {/if}
  </div>
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
  }
  .label {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .meaning {
    font-size: 1.35rem;
    font-weight: 650;
  }
  .pinyin {
    color: var(--muted);
    font-size: 1.1rem;
    margin-top: 2px;
  }
  .slots {
    display: flex;
    gap: 6px;
  }
  .slot {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    border: 1.5px dashed var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.8rem;
  }
  .slot.current {
    border: 2px solid var(--accent);
  }
  .slot.filled {
    border-style: solid;
    background: var(--surface);
  }
  .center {
    width: 100%;
    text-align: center;
  }
  .big {
    font-size: 5rem;
    line-height: 1.2;
  }
  .result {
    min-height: 40px;
    display: flex;
    align-items: center;
  }
</style>
