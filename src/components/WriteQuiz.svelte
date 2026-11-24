<script lang="ts">
  // Abfrage „Schreiben“: Bedeutung + Pinyin sehen, Zeichen für Zeichen aus dem Gedächtnis schreiben.
  // Auch für den Zeichenmodus (free): ohne Bewertung, mit „Weiter“, wahlweise mit Umriss zum Nachzeichnen.
  import Icon from './Icon.svelte'
  import SpeakButton from './SpeakButton.svelte'
  import Hanzi from './Hanzi.svelte'
  import Pinyin from './Pinyin.svelte'
  import WritingPad from './WritingPad.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import type { Word } from '../lib/types'

  let {
    word,
    startChar = 0,
    free = false,
    outline = false,
    onrate,
    onnext,
    onfinish,
    onprogress,
  }: {
    word: Word
    startChar?: number
    /** Zeichenmodus: keine Bewertung, stattdessen „Weiter“ (onnext) */
    free?: boolean
    /** Umriss zeigen – nachzeichnen statt aus dem Kopf schreiben */
    outline?: boolean
    onrate?: (grade: 1 | 3) => void
    onnext?: () => void
    /** ein Durchgang ist fertig geschrieben (auch nach „Neu zeichnen“) */
    onfinish?: () => void
    onprogress?: (charIndex: number) => void
  } = $props()

  interface Result {
    mistakes: number
    /** angesehene Tipps (nächster Strich), zählen wie Fehler */
    tips: number
    /** „Lösung zeigen“ benutzt */
    hinted: boolean
  }
  const blank = (): Result => ({ mistakes: 0, tips: 0, hinted: false })

  const chars = $derived([...word.s])
  // Startwert genügt: die Komponente wird für jede Karte neu erzeugt
  // svelte-ignore state_referenced_locally
  let idx = $state(Math.min(startChar, [...word.s].length - 1))
  /** laufender Durchgang */
  let cur = $state<Result>(blank())
  /** erster Durchgang – nur er zählt für die Bewertung */
  let first = $state<Result | null>(null)
  /** 0 = erster Durchgang, danach je „Neu zeichnen“ eins mehr */
  let attempt = $state(0)
  let finished = $state(false)
  let noData = $state(false)
  let paperRevealed = $state(false)
  /** Zeichen, bei dem „Lösung zeigen“ gedrückt wurde */
  let revealedAt = $state(-1)
  let pad: WritingPad | undefined = $state()

  const rated = $derived(first ?? cur)
  const suggested = $derived<1 | 3>(!rated.hinted && rated.mistakes + rated.tips <= 1 ? 3 : 1)
  // Druckschrift vor dem Pinyin erst, wenn das ganze Wort bekannt ist – vorher würde man es nur abschreiben.
  // Mit Umriss ist das Zeichen ohnehin zu sehen.
  const showWord = $derived(outline || finished || paperRevealed || revealedAt === chars.length - 1)

  function resultLabel(r: Result): string {
    if (r.hinted) return 'mit Hilfe'
    const parts = [r.mistakes && `${r.mistakes} Fehler`, r.tips && `${r.tips} ${r.tips === 1 ? 'Tipp' : 'Tipps'}`]
    return parts.filter(Boolean).join(' · ') || 'fehlerfrei'
  }
  const resultClass = (r: Result) => (r.hinted ? 'accent' : !r.mistakes && !r.tips ? 'good' : '')

  function charDone(r: Result) {
    cur.mistakes += r.mistakes
    cur.tips += r.tips
    if (r.hinted) cur.hinted = true
    if (idx < chars.length - 1) {
      setTimeout(() => {
        idx++
        if (attempt === 0) onprogress?.(idx)
      }, 600)
    } else {
      setTimeout(() => {
        finished = true
        if (attempt === 0) first = $state.snapshot(cur)
        onfinish?.()
      }, 450)
    }
  }

  function showSolution() {
    cur.hinted = true
    revealedAt = idx
    pad?.reveal()
  }

  function tip() {
    pad?.hint()
  }

  /** Noch einmal von vorn und aus dem Kopf schreiben – ändert die Bewertung nicht */
  function redraw() {
    attempt++
    cur = blank()
    idx = 0
    revealedAt = -1
    finished = false
  }

  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (!k) return
    if (free && k === 'ArrowRight') {
      consume(e)
      onnext?.()
    } else if (noData && !paperRevealed) {
      if (isPrimary(k)) {
        consume(e)
        paperRevealed = true
      }
    } else if (!finished && !noData) {
      if (isPrimary(k)) {
        consume(e)
        showSolution()
      } else if (k === 't') {
        consume(e)
        tip()
      }
    } else if (k === 'n' && finished && !noData) {
      consume(e)
      redraw()
    } else if (free) {
      if (isPrimary(k)) {
        consume(e)
        onnext?.()
      }
    } else if (k === '1' || k === '2') {
      consume(e)
      onrate?.(k === '1' ? 1 : 3)
    } else if (finished && isPrimary(k)) {
      consume(e)
      onrate?.(suggested)
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="quiz quiz-layout fade-in">
  <div class="q-side">
    <p class="label">{free ? (outline ? 'Nachzeichnen' : 'Zeichnen') : 'Schreiben'}</p>
    <div class="prompt">
      <div class="meaning">{word.m}</div>
      <div class="pinyin-row">
        {#if showWord}<span class="hanzi zh fade-in" lang="zh-Hans"><Hanzi s={word.s} n={word.n} /></span>{/if}
        {#if word.n}<span class="pinyin"><Pinyin n={word.n} /></span>{/if}
        <SpeakButton {word} auto size={40} />
      </div>
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
  </div>

  <div class="q-stage">
    {#if noData}
      <div class="card center">
        {#if paperRevealed}
          <div class="big zh">{word.s}</div>
        {:else}
          <p>Für dieses Wort gibt es keine Strichdaten. Schreib es auf Papier und deck dann auf.</p>
        {/if}
      </div>
    {:else}
      {#key `${attempt}-${idx}`}
        <WritingPad bind:this={pad} char={chars[idx]} mode="test" {outline} oncomplete={charDone} onerror={() => (noData = true)} />
      {/key}
    {/if}
  </div>

  <div class="q-after">
    {#if finished}
      <div class="result fade-in">
        {#if free || !first}
          <span class="badge {resultClass(cur)}">{resultLabel(cur)}</span>
        {:else}
          <span class="badge {resultClass(first)}">{resultLabel(first)}</span>
          {#if attempt > 0}<span class="badge {resultClass(cur)}">neu: {resultLabel(cur)}</span>{/if}
        {/if}
        {#if !noData}
          <button class="btn ghost small redo" onclick={redraw} title="Noch einmal aus dem Kopf schreiben (N)">
            <Icon name="replay" size={18} /> Neu zeichnen <kbd class="key">N</kbd>
          </button>
        {/if}
      </div>
    {:else if free && !noData}
      <div class="result">
        <button class="btn ghost small" onclick={() => onnext?.()}>Überspringen <kbd class="key">→</kbd></button>
      </div>
    {/if}
  </div>
</div>

<div class="dock bottom">
  <div class="dock-inner">
    {#if noData && !paperRevealed}
      <button class="btn primary" onclick={() => (paperRevealed = true)}>Aufdecken <kbd class="key">↵</kbd></button>
    {:else if !finished && !noData}
      <button class="btn tip" onclick={tip} aria-label="Tipp: nächsten Strich zeigen" title="Nächsten Strich zeigen (T)">
        <Icon name="bulb" size={22} /> Tipp <kbd class="key">T</kbd>
      </button>
      <button class="btn" onclick={showSolution}>Lösung zeigen <kbd class="key">↵</kbd></button>
    {:else if free}
      <button class="btn primary" onclick={() => onnext?.()}>Weiter <kbd class="key">↵</kbd></button>
    {:else}
      <button class="btn" class:bad={finished && suggested === 1} onclick={() => onrate?.(1)}>Nochmal <kbd class="key">1</kbd></button>
      <button class="btn" class:good={!finished || suggested === 3} onclick={() => onrate?.(3)}>Gewusst <kbd class="key">2</kbd></button>
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
  .pinyin-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 4px;
    min-height: 40px;
  }
  .pinyin,
  .hanzi {
    color: var(--muted);
    font-size: 1.1rem;
  }
  .hanzi {
    color: var(--ink);
  }
  /* Tipp-Taste schmal, „Lösung zeigen“ nimmt den Rest */
  .dock-inner > .tip {
    flex: 0 0 auto;
    padding: 0 18px;
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
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .redo {
    min-height: 40px;
  }
  /* Querformat: linke Spalte mit größerer Schrift */
  @media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) {
    .meaning {
      font-size: 1.9rem;
    }
    .pinyin,
    .hanzi {
      font-size: 1.35rem;
    }
    .slot {
      width: 56px;
      height: 56px;
      font-size: 2.3rem;
    }
  }
</style>
