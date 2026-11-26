<script module lang="ts">
  /** letzter Kontakt mit dem Apple Pencil (ms) – gilt für alle Zeichenflächen, siehe onTouch */
  let lastPen = 0
</script>

<script lang="ts">
  // Zeichenfläche auf Basis von Hanzi Writer.
  //  mode "learn": Strichfolge wird vorgeführt, danach mit Umriss nachzeichnen (Hinweis nach 1 Fehler)
  //  mode "test":  leeres Kästchen, aus dem Gedächtnis schreiben (Hinweis nach 3 Fehlern oder per Tipp, siehe hint())
  //  mode "view":  Zeichen anzeigen, Animation auf Wunsch
  import HanziWriter from 'hanzi-writer'
  import { onMount } from 'svelte'
  import { isTablet, isWidePractice } from '../lib/layout'
  import { loadStrokes } from '../lib/strokes'

  type Mode = 'learn' | 'test' | 'view'

  let {
    char,
    mode,
    outline = false,
    maxSize = 320,
    reserve = 330,
    fixedSize,
    oncomplete,
    onerror,
  }: {
    char: string
    mode: Mode
    /** nur mode "test": mit Umriss nachzeichnen statt aus dem Kopf (Zeichenmodus) */
    outline?: boolean
    maxSize?: number
    /** feste Kantenlänge in px (z. B. mehrere Zeichen nebeneinander) */
    fixedSize?: number
    /** Platz in px, der vertikal für den Rest der Ansicht frei bleiben soll */
    reserve?: number
    oncomplete?: (r: { mistakes: number; hinted: boolean; tips: number }) => void
    onerror?: () => void
  } = $props()

  let wrap: HTMLDivElement
  let padEl: HTMLDivElement
  let host: HTMLDivElement
  let size = $state(0)
  let status = $state<'loading' | 'ready' | 'error'>('loading')
  /** Zeichen fertig geschrieben: kurzer grüner Lichtring um die Fläche */
  let solved = $state(false)
  let writer: HanziWriter | null = null
  let mistakes = 0
  let hinted = false
  let destroyed = false
  /** läuft gerade eine Abfrage (nicht während der Vorführung)? */
  let quizzing = false
  /** nächster zu schreibender Strich der laufenden Abfrage */
  let stroke = 0
  /** Striche, für die ein Tipp angesehen wurde – mehrmals derselbe zählt einmal */
  const tipped = new Set<number>()

  // ---------- Berührungen: genau ein Kontakt zeichnet, der Handballen nie ----------
  // Hanzi Writer nimmt bei Berührungen immer evt.touches[0] – liegt der Handballen mit auf, springt der Strich
  // dorthin. Darum wertet die Fläche Berührungen selbst aus und reicht nur den zeichnenden Kontakt als
  // Mausereignisse weiter (Maus und Trackpad laufen unverändert direkt zu Hanzi Writer).
  // Safari meldet je Kontakt, ob es der Apple Pencil ist (touchType „stylus“): Der Stift zeichnet sofort und hat
  // immer Vorrang – ein Finger- bzw. Handballen-Strich, der schon läuft, verschwindet spurlos. Finger zeichnen,
  // sobald sie sich bewegen; kurz nach dem Stift erst ab etwas längerer Bewegung (ein aufliegender Handballen
  // rutscht selten so weit), und direkt nach einem Stift-Strich gar nicht.
  type PenTouch = Touch & { touchType?: string }
  /** so lange nach dem letzten Stift-Kontakt zeichnet ein neu aufgesetzter Finger bzw. Handballen gar nicht */
  const PEN_LOCK_MS = 1500
  /** so lange nach dem letzten Stift-Kontakt braucht ein Finger die längere Bewegung MOVE_NEAR_PEN_PX */
  const PEN_NEAR_MS = 2 * 60_000
  /** so weit muss sich ein Finger bewegen, bevor er zeichnet – ein aufliegender Handballen bewegt sich kaum */
  const MOVE_PX = 6
  const MOVE_NEAR_PEN_PX = 24
  let activeTouch: number | null = null
  /** zeichnet gerade der Stift (nicht ein Finger bzw. der Handballen)? */
  let activePen = false
  /** aufgesetzte Finger bzw. Handballen, die noch nicht zeichnen: Weg seit dem Aufsetzen, nötige Bewegung */
  const pending = new Map<number, { path: [number, number][]; need: number }>()
  /** gerade endender Strich zählt nicht als Fehler (siehe endStroke) */
  let voidStroke = false

  function sendMouse(type: 'mousedown' | 'mousemove' | 'mouseup', x = 0, y = 0) {
    const target: EventTarget | null = type === 'mouseup' ? document : host.querySelector('svg')
    target?.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }))
  }

  /** Strich beginnen – beim Finger samt dem Weg, den er schon zurückgelegt hat */
  function startStroke(id: number, pen: boolean, path: [number, number][]) {
    activeTouch = id
    activePen = pen
    pending.clear()
    const [[x, y], ...rest] = path
    sendMouse('mousedown', x, y)
    for (const [mx, my] of rest) sendMouse('mousemove', mx, my)
  }

  /**
   * Strich beenden – Hanzi Writer bewertet ihn wie gewohnt. discard: spurlos verwerfen, ohne Bewertung
   * (Handballen-Strich, den der Stift ablöst, oder eine vom System abgebrochene Berührung).
   */
  function endStroke(discard: boolean) {
    if (discard) {
      // Hanzi Writer überspringt Striche aus einem einzigen Punkt: den laufenden Strich darauf kürzen (internes
      // Feld von Hanzi Writer 3.x). Gäbe es das Feld einmal nicht mehr, würde der Strich bewertet, zählte dank
      // voidStroke aber trotzdem nicht als Fehler.
      const quiz = (writer as unknown as { _quiz?: { _userStroke?: { points?: unknown[] } } } | null)?._quiz
      const points = quiz?._userStroke?.points
      if (Array.isArray(points) && points.length > 1) points.length = 1
    }
    voidStroke = discard
    sendMouse('mouseup')
    voidStroke = false
    activeTouch = null
    activePen = false
  }

  function onTouch(e: TouchEvent) {
    if (mode === 'view' || destroyed) return
    const now = Date.now()
    const changed = Array.from(e.changedTouches) as PenTouch[]
    if (changed.some((t) => t.touchType === 'stylus')) lastPen = now
    const inPad = padEl.contains(e.target as Node)
    if (!inPad && activeTouch === null && pending.size === 0) return
    // Hanzi Writer bekommt die Berührung nicht selbst zu sehen; während eines Strichs löst der Handballen
    // auch außerhalb der Fläche nichts aus (kein Tippen auf Knöpfe, kein Scrollen)
    e.stopPropagation()
    if (e.cancelable) e.preventDefault()
    for (const t of changed) {
      const pen = t.touchType === 'stylus'
      if (e.type === 'touchstart') {
        if (!inPad) continue
        if (pen) {
          if (activePen) continue
          if (activeTouch !== null) endStroke(true)
          startStroke(t.identifier, true, [[t.clientX, t.clientY]])
        } else if (activeTouch === null && now - lastPen > PEN_LOCK_MS) {
          pending.set(t.identifier, { path: [[t.clientX, t.clientY]], need: now - lastPen < PEN_NEAR_MS ? MOVE_NEAR_PEN_PX : MOVE_PX })
        }
      } else if (e.type === 'touchmove') {
        const wait = pending.get(t.identifier)
        if (t.identifier === activeTouch) {
          sendMouse('mousemove', t.clientX, t.clientY)
        } else if (wait) {
          const { path, need } = wait
          if (path.length < 300) path.push([t.clientX, t.clientY])
          else path[path.length - 1] = [t.clientX, t.clientY]
          // weit genug bewegt: zeichnen, ab dem ersten Aufsetzpunkt – wer zuerst so weit kommt, zeichnet
          if (Math.hypot(t.clientX - path[0][0], t.clientY - path[0][1]) >= need) startStroke(t.identifier, false, path)
        }
      } else if (t.identifier === activeTouch) {
        endStroke(e.type === 'touchcancel')
      } else {
        // Tupfer ohne (genug) Bewegung, meist der Handballen: kein Strich
        pending.delete(t.identifier)
      }
    }
  }

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
    stroke = 0
    quizzing = true
    writer.quiz({
      leniency: 1.3,
      showHintAfterMisses: withOutline ? 1 : 3,
      markStrokeCorrectAfterMisses: withOutline ? 3 : 5,
      highlightOnComplete: true,
      onMistake: () => {
        if (!voidStroke) mistakes++
      },
      onCorrectStroke: (d) => {
        stroke = d.strokeNum + 1
      },
      onComplete: () => {
        quizzing = false
        solved = true
        if (!destroyed) oncomplete?.({ mistakes, hinted, tips: tipped.size })
      },
    })
  }

  /**
   * Tipp: den nächsten Strich kurz aufleuchten lassen – dieselbe Animation wie der Hinweis nach Fehlern.
   * Zählt einmal je Strich (siehe tips in oncomplete).
   */
  export function hint() {
    if (!writer || status !== 'ready' || !quizzing) return
    tipped.add(stroke)
    writer.highlightStroke(stroke)
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
    quizzing = false
    writer.cancelQuiz()
    demoThenTrace()
  }

  /** Nur Animation abspielen (Ansicht-Modus) – erfüllt sich, wenn sie fertig ist (true) oder abgebrochen wurde */
  export function animate(): Promise<boolean> {
    const w = writer
    if (!w || status !== 'ready') return Promise.resolve(false)
    return new Promise((resolve) => {
      void w.animateCharacter({ onComplete: (r) => resolve(!r?.canceled) })
    })
  }

  /** Zeichen sofort ausblenden (vor dem Abspielen mehrerer Zeichen) – bricht eine laufende Animation ab */
  export function blank() {
    if (writer && status === 'ready') void writer.hideCharacter({ duration: 0 })
  }

  /** Zeichen sofort vollständig zeigen – bricht eine laufende Animation ab */
  export function show() {
    if (writer && status === 'ready') void writer.showCharacter({ duration: 0 })
  }

  /** Kantenlänge: so groß wie möglich, ohne dass die Ansicht scrollen muss */
  function computeSize(): number {
    if (fixedSize !== undefined) return fixedSize
    if (mode !== 'view' && isWidePractice()) {
      // zweispaltiges Üben (iPad quer, PC): Spalte rechts, volle Höhe abzüglich Kopfzeile
      return Math.round(Math.max(240, Math.min(680, wrap.clientWidth, window.innerHeight - 150)))
    }
    const max = isTablet() ? Math.max(maxSize, 600) : maxSize
    return Math.round(Math.max(200, Math.min(max, wrap.clientWidth, window.innerHeight - reserve)))
  }

  // Drehen des Tablets / Fenstergröße ändern: Fläche mitwachsen lassen
  let frame = 0
  function onResize() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (!writer || destroyed || fixedSize !== undefined) return
      const next = computeSize()
      if (Math.abs(next - size) < 4) return
      size = next
      writer.updateDimensions({ width: next, height: next, padding: Math.round(next * 0.07) })
    })
  }

  onMount(() => {
    size = computeSize()
    writer = HanziWriter.create(host, char, {
      width: size,
      height: size,
      padding: Math.round(size * 0.07),
      showCharacter: mode === 'view',
      showOutline: mode !== 'test' || outline,
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
    else if (mode === 'test') startQuiz(outline)
    // vor Hanzi Writer an die Berührungen kommen: Erfassungsphase am Fenster (nur, wo gezeichnet wird)
    const touchOpts: AddEventListenerOptions = { capture: true, passive: false }
    const touchTypes = mode === 'view' ? [] : (['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const)
    for (const t of touchTypes) window.addEventListener(t, onTouch, touchOpts)
    return () => {
      for (const t of touchTypes) window.removeEventListener(t, onTouch, touchOpts)
      destroyed = true
      cancelAnimationFrame(frame)
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

<svelte:window onresize={onResize} />

<div class="pad-wrap" class:inline={fixedSize !== undefined} bind:this={wrap}>
  <div class="pad" bind:this={padEl} style:width="{size}px" style:height="{size}px" class:interactive={mode !== 'view'} class:solved>
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
  .pad.solved {
    animation: solved 0.7s ease-out;
  }
  @keyframes solved {
    from {
      box-shadow:
        0 0 0 0 color-mix(in srgb, var(--good) 45%, transparent),
        0 1px 0 var(--line);
    }
    to {
      box-shadow:
        0 0 0 14px color-mix(in srgb, var(--good) 0%, transparent),
        0 1px 0 var(--line);
    }
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
