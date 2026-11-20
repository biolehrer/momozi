<script lang="ts">
  // Zeichenfläche auf Basis von Hanzi Writer.
  //  mode "learn": Strichfolge wird vorgeführt, danach mit Umriss nachzeichnen (Hinweis nach 1 Fehler)
  //  mode "test":  leeres Kästchen, aus dem Gedächtnis schreiben (Hinweis nach 3 Fehlern)
  //  mode "view":  Zeichen anzeigen, Animation auf Wunsch
  import HanziWriter from 'hanzi-writer'
  import { onMount } from 'svelte'
  import { loadStrokes } from '../lib/strokes'

  type Mode = 'learn' | 'test' | 'view'

  let {
    char,
    mode,
    maxSize = 320,
    reserve = 330,
    fixedSize,
    oncomplete,
    onerror,
  }: {
    char: string
    mode: Mode
    maxSize?: number
    /** feste Kantenlänge in px (z. B. mehrere Zeichen nebeneinander) */
    fixedSize?: number
    /** Platz in px, der vertikal für den Rest der Ansicht frei bleiben soll */
    reserve?: number
    oncomplete?: (r: { mistakes: number; hinted: boolean }) => void
    onerror?: () => void
  } = $props()

  let wrap: HTMLDivElement
  let host: HTMLDivElement
  let size = $state(0)
  let status = $state<'loading' | 'ready' | 'error'>('loading')
  let writer: HanziWriter | null = null
  let mistakes = 0
  let hinted = false
  let destroyed = false

  function colors() {
    const cs = getComputedStyle(document.documentElement)
    const v = (n: string) => cs.getPropertyValue(n).trim()
    return {
      strokeColor: v('--ink'),
      outlineColor: v('--outline'),
      drawingColor: v('--accent'),
      highlightColor: v('--hint'),
      highlightCompleteColor: v('--good'),
    }
  }

  function startQuiz(withOutline: boolean) {
    if (!writer || destroyed) return
    if (withOutline) writer.showOutline()
    else writer.hideOutline()
    writer.quiz({
      leniency: 1.3,
      showHintAfterMisses: withOutline ? 1 : 3,
      markStrokeCorrectAfterMisses: withOutline ? 3 : 5,
      highlightOnComplete: true,
      onMistake: () => {
        mistakes++
      },
      onComplete: () => {
        if (!destroyed) oncomplete?.({ mistakes, hinted })
      },
    })
  }

  /** Strichfolge vorführen, danach mit Umriss nachzeichnen */
  function demoThenTrace() {
    if (!writer) return
    writer.showOutline()
    writer.animateCharacter({
      onComplete: () => {
        setTimeout(() => {
          if (destroyed || !writer) return
          writer.hideCharacter()
          startQuiz(true)
        }, 450)
      },
    })
  }

  /** Lösung zeigen (zählt als Hilfe), danach nachzeichnen */
  export function reveal() {
    if (!writer || status !== 'ready') return
    hinted = true
    writer.cancelQuiz()
    demoThenTrace()
  }

  /** Nur Animation abspielen (Ansicht-Modus) */
  export function animate() {
    if (!writer || status !== 'ready') return
    writer.animateCharacter()
  }

  onMount(() => {
    size = fixedSize ?? Math.round(Math.max(200, Math.min(maxSize, wrap.clientWidth, window.innerHeight - reserve)))
    writer = HanziWriter.create(host, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.07),
      showCharacter: mode === 'view',
      showOutline: mode !== 'test',
      strokeAnimationSpeed: 1.1,
      delayBetweenStrokes: 220,
      drawingWidth: 26,
      ...colors(),
      charDataLoader: (c, onLoad, onError) => {
        loadStrokes(c).then((d) => onLoad(d as Parameters<typeof onLoad>[0]), onError)
      },
      onLoadCharDataSuccess: () => {
        status = 'ready'
      },
      onLoadCharDataError: () => {
        status = 'error'
        onerror?.()
      },
    })
    if (mode === 'learn') demoThenTrace()
    else if (mode === 'test') startQuiz(false)
    return () => {
      destroyed = true
      try {
        writer?.cancelQuiz()
      } catch {
        /* egal */
      }
      writer = null
      host.innerHTML = ''
    }
  })
</script>

<div class="pad-wrap" class:inline={fixedSize !== undefined} bind:this={wrap}>
  <div class="pad" style:width="{size}px" style:height="{size}px" class:interactive={mode !== 'view'}>
    <svg class="grid" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
      <rect x="0.5" y="0.5" width="99" height="99" rx="3" class="frame" />
      <line x1="1.5" y1="1.5" x2="98.5" y2="98.5" />
      <line x1="98.5" y1="1.5" x2="1.5" y2="98.5" />
      <line x1="50" y1="0.5" x2="50" y2="99.5" />
      <line x1="0.5" y1="50" x2="99.5" y2="50" />
    </svg>
    <div class="host" bind:this={host}></div>
    {#if status === 'loading'}
      <div class="overlay muted small">Lade Strichfolge …</div>
    {:else if status === 'error'}
      <div class="overlay small">Für „<span class="zh">{char}</span>“ gibt es keine Strichdaten.</div>
    {/if}
  </div>
</div>

<style>
  .pad-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .pad-wrap.inline {
    width: auto;
  }
  .pad {
    position: relative;
    background: var(--surface);
    border-radius: 14px;
    box-shadow: 0 1px 0 var(--line);
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  .pad.interactive {
    /* Finger zeichnet, Seite scrollt/zoomt dabei nicht */
    touch-action: none;
  }
  .grid {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--grid);
    stroke-width: 0.45;
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
  }
  .grid .frame {
    stroke-dasharray: none;
    stroke-width: 0.8;
  }
  .host {
    position: absolute;
    inset: 0;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
  }
</style>
