<script lang="ts">
  // Popup (schwebendes Fenster) auf der Wortseite: das Wort selbst zeichnen, Zeichen für Zeichen – nur Übung,
  // ändert den Lernstand nicht (hier wird nichts bewertet oder gespeichert außer der Umriss-Einstellung).
  import { onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import WritingPad from './WritingPad.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import { displayPinyin } from '../lib/pinyin'
  import type { Word } from '../lib/types'

  let { word, onclose }: { word: Word; onclose: () => void } = $props()

  /** gleiche Einstellung wie im Zeichenmodus (views/Sketch.svelte) */
  const PREFS = 'momozi.zeichnen'

  const chars = $derived([...word.s])
  let idx = $state(0)
  /** je Durchgang neu, damit die Zeichenfläche frisch startet */
  let attempt = $state(0)
  let finished = $state(false)
  let noData = $state(false)
  // gleich beim Start lesen: die Zeichenfläche übernimmt den Umriss nur beim Erzeugen
  let outline = $state(prefs().outline === true)
  let mistakes = $state(0)
  let tips = $state(0)
  let hinted = $state(false)
  let pad: WritingPad | undefined = $state()
  let closeBtn: HTMLButtonElement | undefined = $state()

  const result = $derived(
    hinted
      ? 'mit Hilfe'
      : [mistakes && `${mistakes} Fehler`, tips && `${tips} ${tips === 1 ? 'Tipp' : 'Tipps'}`].filter(Boolean).join(' · ') ||
          'fehlerfrei',
  )

  function prefs(): Record<string, unknown> {
    try {
      return JSON.parse(localStorage.getItem(PREFS) ?? '{}')
    } catch {
      return {}
    }
  }

  onMount(() => {
    closeBtn?.focus()
    // Seite dahinter nicht mitscrollen
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = before
    }
  })

  function charDone(r: { mistakes: number; hinted: boolean; tips: number }) {
    mistakes += r.mistakes
    tips += r.tips
    if (r.hinted) hinted = true
    if (idx < chars.length - 1) setTimeout(() => idx++, 600)
    else setTimeout(() => (finished = true), 450)
  }

  /** von vorn: alle Zeichen neu, Ergebnis zurückgesetzt */
  function restart() {
    attempt++
    idx = 0
    finished = false
    mistakes = 0
    tips = 0
    hinted = false
  }

  function solve() {
    hinted = true
    pad?.reveal()
  }

  function toggleOutline() {
    outline = !outline
    try {
      localStorage.setItem(PREFS, JSON.stringify({ ...prefs(), outline }))
    } catch {
      /* egal */
    }
    restart()
  }

  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (!k) return
    if (k === 'Escape') {
      consume(e)
      onclose()
    } else if (k === 'u') {
      consume(e)
      toggleOutline()
    } else if (noData) {
      return
    } else if (finished && (isPrimary(k) || k === 'n')) {
      consume(e)
      restart()
    } else if (!finished && k === 't') {
      consume(e)
      pad?.hint()
    } else if (!finished && isPrimary(k)) {
      consume(e)
      solve()
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="backdrop fade-in" onclick={onclose} aria-hidden="true"></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Selbst zeichnen">
  <header class="head">
    <div class="info">
      <div class="pinyin">{displayPinyin(word.n)}</div>
      <div class="muted small meaning">{word.m}</div>
    </div>
    <button class="icon-btn" bind:this={closeBtn} onclick={onclose} aria-label="Schließen" title="Schließen (Esc)">
      <Icon name="close" />
    </button>
  </header>

  {#if chars.length > 1}
    <div class="slots zh" aria-hidden="true">
      {#each chars as c, i (i)}
        <span class="slot" class:current={i === idx && !finished} class:filled={i < idx || finished}>
          {i < idx || finished ? c : ''}
        </span>
      {/each}
    </div>
  {/if}

  <div class="stage">
    {#if noData}
      <p class="muted no-data">Für „<span class="zh">{word.s}</span>“ gibt es keine Strichdaten.</p>
    {:else}
      {#key `${attempt}-${idx}`}
        <WritingPad
          bind:this={pad}
          char={chars[idx]}
          mode="test"
          {outline}
          maxSize={340}
          reserve={330}
          oncomplete={charDone}
          onerror={() => (noData = true)}
        />
      {/key}
    {/if}
  </div>

  <p class="status small">
    {#if finished}
      <span class="badge" class:good={result === 'fehlerfrei'} class:accent={hinted}>{result}</span>
    {:else}
      <span class="muted">Übung – zählt nicht zum Lernplan</span>
    {/if}
  </p>

  <div class="tools">
    {#if finished}
      <button class="btn primary" onclick={restart}><Icon name="replay" size={20} /> Neu zeichnen <kbd class="key">↵</kbd></button>
    {:else if !noData}
      <button class="btn" onclick={() => pad?.hint()} title="Nächsten Strich zeigen (T)">
        <Icon name="bulb" size={20} /> Tipp <kbd class="key">T</kbd>
      </button>
      <button class="btn" onclick={solve} title="Strichfolge zeigen, dann nachzeichnen">Lösung <kbd class="key">↵</kbd></button>
    {/if}
    <label class="outline" title="Umriss zum Nachzeichnen (U)">
      <span class="small">Umriss</span>
      <input
        type="checkbox"
        class="switch"
        aria-label="Umriss zum Nachzeichnen"
        checked={outline}
        onchange={(e) => {
          toggleOutline()
          // Fokus lösen, sonst greifen die Tastenkürzel nicht (lib/keys.ts)
          e.currentTarget.blur()
        }}
      />
    </label>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.45);
    touch-action: none;
  }
  /* Schwebendes Fenster in der Mitte – auf dem Handy mit schmalem Rand ringsum */
  .sheet {
    position: fixed;
    z-index: 41;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(460px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px - var(--safe-top) - var(--safe-bottom));
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 12px 14px 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    box-shadow: 0 16px 48px rgb(0 0 0 / 0.35);
    animation: sheet-pop 0.18s ease;
  }
  /* eigene Animation: .fade-in verschiebt per transform und würde die Zentrierung stören */
  @keyframes sheet-pop {
    from {
      opacity: 0;
      transform: translate(-50%, -47%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }
  .head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .info {
    flex: 1;
    min-width: 0;
    text-align: center;
    padding-left: 44px; /* gleicht die Schließen-Taste rechts aus */
  }
  .pinyin {
    font-size: 1.25rem;
    font-weight: 650;
  }
  .meaning {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .slots {
    display: flex;
    gap: 6px;
  }
  .slot {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1.5px dashed var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.6rem;
  }
  .slot.current {
    border: 2px solid var(--accent);
  }
  .slot.filled {
    border-style: solid;
    background: var(--surface);
  }
  .stage {
    width: 100%;
  }
  .no-data {
    text-align: center;
    padding: 40px 0;
  }
  .status {
    margin: 0;
    min-height: 26px;
    display: flex;
    align-items: center;
  }
  .tools {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tools .btn {
    flex: 1;
    min-width: 0;
    padding: 0 12px;
    white-space: nowrap;
  }
  .outline {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    white-space: nowrap;
  }
  /* sehr schmale Handys (iPhone SE): Symbol im Tipp-Knopf weglassen, sonst wird es gequetscht */
  @media (max-width: 359px) {
    .tools .btn :global(svg) {
      display: none;
    }
  }
  /* Tablet und PC: etwas mehr Luft */
  @media (min-width: 700px) {
    .sheet {
      width: min(460px, calc(100vw - 48px));
      max-height: calc(100dvh - 48px);
      padding: 16px 20px 20px;
    }
  }
</style>
