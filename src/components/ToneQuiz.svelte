<script lang="ts">
  // Abfrage „Töne“: Zeichen sehen, Ton jeder Silbe angeben – per Taste oder Wischgeste
  // (waagerecht = 1, nach oben = 2, Haken ˇ = 3, nach unten = 4, Tippen = neutral).
  import SpeakButton from './SpeakButton.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import { displayPinyin, markedSyllables, tonesOf } from '../lib/pinyin'
  import type { Word } from '../lib/types'

  let { word, onrate }: { word: Word; onrate: (grade: 1 | 3) => void } = $props()

  const chars = $derived([...word.s])
  const tones = $derived(tonesOf(word.n))
  const syls = $derived(markedSyllables(word.n))
  /** Positionen, die abgefragt werden (Erhua-„r“ nicht) */
  const order = $derived(tones.map((t, i) => (t === null ? -1 : i)).filter((i) => i >= 0))

  let pos = $state(0)
  let answers = $state<(number | null)[]>([])
  let finished = $state(false)
  const current = $derived(finished ? -1 : order[pos])
  const wrongCount = $derived(order.filter((i) => answers[i] !== tones[i]).length)

  const BUTTONS = [
    { tone: 1, mark: 'ˉ', label: '1' },
    { tone: 2, mark: 'ˊ', label: '2' },
    { tone: 3, mark: 'ˇ', label: '3' },
    { tone: 4, mark: 'ˋ', label: '4' },
    { tone: 5, mark: '·', label: 'neutral' },
  ]

  function answer(t: number) {
    if (finished) return
    answers[order[pos]] = t
    if (pos < order.length - 1) pos++
    else finished = true
  }

  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (!k) return
    if (!finished && /^[0-5]$/.test(k)) {
      consume(e)
      answer(k === '0' ? 5 : Number(k))
    } else if (finished && isPrimary(k)) {
      consume(e)
      onrate(wrongCount === 0 ? 3 : 1)
    }
  }

  // ---------- Wischgeste ----------
  let area: HTMLDivElement
  let pts = $state<{ x: number; y: number }[]>([])

  function local(e: PointerEvent) {
    const r = area.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: PointerEvent) {
    if (finished) return
    area.setPointerCapture(e.pointerId)
    pts = [local(e)]
  }
  function move(e: PointerEvent) {
    if (pts.length) pts.push(local(e))
  }
  function up() {
    if (!pts.length) return
    const t = classify(pts)
    pts = []
    if (t) answer(t)
  }
  function classify(p: { x: number; y: number }[]): number | null {
    const a = p[0]
    const b = p[p.length - 1]
    const xs = p.map((q) => q.x)
    const ys = p.map((q) => q.y)
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    if (spanX < 14 && spanY < 14) return 5
    const dip = Math.max(...ys) - Math.max(a.y, b.y)
    if (dip > 16 && spanX > 16) return 3
    const dx = b.x - a.x
    const dy = b.y - a.y
    const angle = (Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI
    if (Math.abs(angle) < 20) return 1
    return angle > 0 ? 2 : 4
  }
  const pathD = $derived(pts.length > 1 ? 'M' + pts.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' L') : '')
</script>

<svelte:window onkeydown={onKey} />

<div class="quiz quiz-layout fade-in">
  <div class="q-side">
    <p class="label">Welcher Ton?</p>
  </div>

  <div class="q-stage">
    <div
      class="area"
      bind:this={area}
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={() => (pts = [])}
      role="application"
      aria-label="Fläche für Tonzeichen-Geste"
    >
      <div class="chars" lang="zh-Hans">
        {#each chars as c, i (i)}
          {@const answered = answers[i] != null}
          {@const ok = answers[i] === tones[i]}
          <div class="cell" class:current={i === current} class:skip={tones[i] === null}>
            <div class="syl" class:ok={answered && ok} class:wrong={answered && !ok}>
              {#if tones[i] === null}
                {finished ? syls[i] : ''}
              {:else if answered}
                {syls[i]}
              {:else}
                &nbsp;
              {/if}
            </div>
            <div class="zh char">{c}</div>
          </div>
        {/each}
      </div>
      {#if pathD}
        <svg class="trail" aria-hidden="true"><path d={pathD} /></svg>
      {/if}
    </div>
  </div>

  <div class="q-after">
    {#if finished}
      <div class="summary card">
        <div class="pinyin-row">
          <span class="pinyin">{displayPinyin(word.n)}</span>
          <SpeakButton {word} auto size={40} />
        </div>
        <div class="muted">{word.m}</div>
        <div class="verdict" class:ok={wrongCount === 0}>
          {wrongCount === 0 ? 'Alle Töne richtig' : `${wrongCount} von ${order.length} falsch`}
        </div>
      </div>
    {:else}
      <p class="muted small hint">
        Ton auf das Zeichen wischen oder unten tippen<span class="fine-only"> – oder Taste 1–5</span>.<br />Töne in Grundform (ohne Tonsandhi).
      </p>
    {/if}
  </div>
</div>

<div class="dock bottom">
  <div class="dock-inner">
    {#if finished}
      <button class="btn" class:good={wrongCount === 0} class:primary={wrongCount > 0} onclick={() => onrate(wrongCount === 0 ? 3 : 1)}>
        Weiter <kbd class="key">↵</kbd>
      </button>
    {:else}
      <div class="tones">
        {#each BUTTONS as b (b.tone)}
          <button class="btn tone" onclick={() => answer(b.tone)} aria-label={b.tone === 5 ? 'neutraler Ton' : `${b.tone}. Ton`}>
            <span class="mark">{b.mark}</span>
            <span class="num">{b.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    text-align: center;
    padding-top: 8px;
  }
  .label {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .area {
    position: relative;
    width: 100%;
    min-height: 220px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    padding: 12px;
  }
  .chars {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 8px;
    border-radius: 12px;
  }
  .cell.current {
    background: var(--accent-soft);
  }
  .cell.skip {
    opacity: 0.6;
  }
  .syl {
    font-size: 1.25rem;
    font-weight: 650;
    min-height: 1.6em;
  }
  .syl.ok {
    color: var(--good);
  }
  .syl.wrong {
    color: var(--bad);
  }
  .char {
    font-size: clamp(3rem, 16vw, 4.5rem);
    line-height: 1.1;
  }
  .trail {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .trail path {
    fill: none;
    stroke: var(--accent);
    stroke-width: 6;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.7;
  }
  .hint {
    margin: 0;
  }
  .summary {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pinyin-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }
  .pinyin {
    font-size: 1.4rem;
    font-weight: 650;
  }
  .verdict {
    margin-top: 6px;
    font-weight: 650;
    color: var(--bad);
  }
  .verdict.ok {
    color: var(--good);
  }
  .tones {
    display: flex;
    gap: 6px;
    width: 100%;
  }
  .btn.tone {
    flex: 1;
    min-width: 0;
    padding: 0;
    min-height: 64px;
    flex-direction: column;
    gap: 0;
  }
  .mark {
    font-size: 1.6rem;
    line-height: 1;
    height: 1.1em;
  }
  .num {
    font-size: 0.75rem;
    color: var(--muted);
  }
  /* Querformat: große Wischfläche rechts */
  @media (min-width: 900px) and (min-height: 560px) and (orientation: landscape) {
    .q-stage {
      width: 100%;
    }
    .area {
      min-height: calc(100dvh - 160px);
    }
    .char {
      font-size: clamp(5rem, 20vh, 10rem);
    }
    .syl {
      font-size: 1.6rem;
    }
  }
</style>
