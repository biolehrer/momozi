<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import CountUp from '../components/CountUp.svelte'
  import Icon from '../components/Icon.svelte'
  import LearnCard from '../components/LearnCard.svelte'
  import RevealQuiz from '../components/RevealQuiz.svelte'
  import Seal from '../components/Seal.svelte'
  import ToneQuiz from '../components/ToneQuiz.svelte'
  import WriteQuiz from '../components/WriteQuiz.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import { back, route } from '../lib/router.svelte'
  import { deckName } from '../lib/state.svelte'
  import { requeue } from '../lib/order'
  import { preloadStrokes } from '../lib/strokes'
  import { preloadAudio } from '../lib/audio.svelte'
  import { FLAGGED, isFlagged, setMark } from '../lib/marks.svelte'
  import { flameShownToday, markFlameShown, milestones } from '../lib/motion'
  import { practicedNow, refreshStreak, streak } from '../lib/streak.svelte'
  import {
    buildSession,
    clearSession,
    introducedKeys,
    markIntroduced,
    overview,
    rateCard,
    resumableSession,
    saveSession,
    undoIntroduced,
    undoRating,
    type RatingUndo,
  } from '../lib/srs'
  import type { Session, SessionItem } from '../lib/types'

  let session = $state<Session | null>(null)
  let busy = false

  /** Rückgängig: je Schritt der Stand der Sitzung davor und was in der Datenbank zurückzunehmen ist */
  type Step = { before: Session } & ({ kind: 'rate'; undo: RatingUndo } | { kind: 'learn'; created: string[] })
  const steps: Step[] = []
  let canUndo = $state(false)

  /** Stand vor der Übung – für „+1“ bei der Serie und Meilensteine auf dem Abschluss-Bildschirm */
  let before = { known: 0, days: 0, today: false }

  /** Abschluss-Bildschirm: ehrlich unterscheiden, ob für heute alles erledigt ist oder noch etwas ansteht */
  type Finale = { title: string; zh?: string; sub: string; streakUp: boolean; marks: string[] }
  let finale = $state<Finale | null>(null)
  let finishing = false

  onMount(async () => {
    before = { known: (await introducedKeys()).size, days: streak.days, today: streak.today }
    let s = route.query.get('fortsetzen') ? await resumableSession() : undefined
    s ??= await buildSession(route.query.get('deck') ?? undefined)
    session = s
    if (s.items.length) await persist()
  })

  const item = $derived(session && session.index < session.items.length ? session.items[session.index] : null)

  // Strichdaten für die aktuelle und die nächsten Karten mit Zeichenfläche schon laden (Kennenlernen, Schreiben),
  // die Aussprache der aktuellen und der nächsten drei Karten schon dekodieren – spielt dann ohne Verzögerung ab
  $effect(() => {
    if (!session) return
    const upcoming = session.items.slice(session.index, session.index + 8)
    upcoming
      .filter((it) => it.kind === 'learn' || it.type === 'write')
      .slice(0, 3)
      .forEach((it) => preloadStrokes(it.word.s))
    upcoming.slice(0, 4).forEach((it) => preloadAudio(it.word))
  })
  const total = $derived(session?.items.length ?? 0)
  // Fester Fortschritt: jede Aufgabe zählt einmal und ist erst mit „Gewusst“ (bzw. nach dem Kennenlernen) erledigt.
  // Jedes „Nochmal“ hängt eine Kopie an – ohne sie bleibt die Zahl der Aufgaben gleich (gilt auch für alte Sitzungen).
  const goal = $derived(session ? session.items.length - session.stats.again : 0)
  const done = $derived(session ? session.stats.good + session.stats.learned : 0)
  const percent = $derived(goal ? Math.floor((done / goal) * 100) : 0)

  // Ende erreicht: Abschluss vorbereiten (nach „Rückgängig“ zurück zur Karte: wieder weg)
  $effect(() => {
    if (!session) return
    if (item) {
      finale = null
      return
    }
    if (total > 0 && !finishing && untrack(() => !finale)) {
      finishing = true
      void prepareFinale().finally(() => (finishing = false))
    }
  })

  async function prepareFinale() {
    const s = session
    if (!s) return
    const deckId = s.deckId
    const [ov, keys] = await Promise.all([deckId === FLAGGED ? null : overview(deckId), introducedKeys()])
    const name = deckId ? deckName(deckId) : ''
    const left = ov ? ov.due + ov.newToday : 0
    let f: Pick<Finale, 'title' | 'zh' | 'sub'>
    if (deckId === FLAGGED) f = { title: 'Runde geschafft!', sub: 'Alle markierten Wörter geübt.' }
    else if (left === 0)
      f = deckId
        ? { title: `„${name}“ erledigt!`, sub: 'Für heute ist hier nichts mehr fällig.' }
        : { title: 'Alles für heute erledigt!', zh: '明天见', sub: 'bis morgen!' }
    else {
      const rest = [ov!.due ? `${ov!.due} fällig` : '', ov!.newToday ? `${ov!.newToday} neu` : ''].filter(Boolean).join(' · ')
      f = { title: 'Runde geschafft!', sub: `${deckId ? `In „${name}“ heute noch` : 'Für heute noch'}: ${rest}` }
    }
    // die Serie ist mit dieser Übung gewachsen – einmal am Tag sichtbar aufflammen (sonst auf der Startseite)
    const streakUp = !before.today && streak.today && !flameShownToday()
    if (streakUp) markFlameShown()
    finale = { ...f, streakUp, marks: milestones([before.known, keys.size], [before.days, streak.days]) }
  }

  async function persist() {
    if (session) await saveSession($state.snapshot(session) as Session)
  }

  async function advance() {
    if (!session) return
    session.index++
    session.charIndex = 0
    if (session.index >= session.items.length) await clearSession()
    else await persist()
  }

  async function rate(grade: 1 | 3) {
    if (busy || !session || !item || item.kind !== 'quiz') return
    busy = true
    try {
      const before = $state.snapshot(session) as Session
      const undo = await rateCard(item.word, item.type, grade)
      steps.push({ before, kind: 'rate', undo })
      canUndo = true
      practicedNow()
      if (grade === 1) {
        session.stats.again++
        // später in dieser Sitzung noch einmal – mit Abstand zu den anderen Karten desselben Wortes
        session.items = requeue($state.snapshot(session.items) as SessionItem[], session.index)
      } else {
        session.stats.good++
      }
      await advance()
    } finally {
      busy = false
    }
  }

  async function learned() {
    if (busy || !session || !item) return
    busy = true
    try {
      const before = $state.snapshot(session) as Session
      const created = await markIntroduced(item.word)
      steps.push({ before, kind: 'learn', created })
      canUndo = true
      session.stats.learned++
      await advance()
    } finally {
      busy = false
    }
  }

  /** Wort der aktuellen Karte markieren (⚑) bzw. Markierung aufheben – landet im Deck „Markiert“ */
  function toggleFlag() {
    if (item) void setMark(item.word, { flag: !isFlagged(item.word) })
  }

  /** Letzten Schritt zurücknehmen: Karte und Sitzung genau wie vorher, die Karte kommt noch einmal */
  async function undo() {
    if (busy || !steps.length) return
    busy = true
    try {
      const step = steps.pop()!
      if (step.kind === 'rate') await undoRating(step.undo)
      else await undoIntroduced(step.created)
      session = step.before
      await persist()
      canUndo = steps.length > 0
      await refreshStreak()
    } finally {
      busy = false
    }
  }

  // Kürzel für die ganze Übung; die einzelnen Abfragen haben ihre eigenen (siehe lib/keys.ts)
  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (!k) return
    if (k === 'Escape') {
      consume(e)
      back('/')
    } else if (k === 'p') {
      // nur wenn die Aussprache gerade sichtbar ist (bei Pinyin-Abfragen erst nach dem Aufdecken)
      const btn = document.querySelector<HTMLButtonElement>('.practice .body .speak')
      if (btn) {
        consume(e)
        btn.click()
      }
    } else if (k === 'm' && item) {
      consume(e)
      toggleFlag()
    } else if (k === 'z' || k === 'Backspace') {
      if (!canUndo) return
      consume(e)
      void undo()
    } else if (session && !item && isPrimary(k)) {
      consume(e)
      back('/')
    }
  }

  async function charProgress(i: number) {
    if (!session) return
    session.charIndex = i
    await persist()
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="practice">
  <header class="bar">
    <button class="icon-btn" onclick={() => back('/')} aria-label="Übung beenden" title="Übung beenden (Esc)">
      <Icon name="close" />
    </button>
    <div
      class="progress"
      role="progressbar"
      aria-label="Fortschritt"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext="{percent} Prozent, {done} von {goal} Karten erledigt"
      title="{done} von {goal} Karten erledigt"
    >
      <div class="fill" style:width="{goal ? (done / goal) * 100 : 0}%"></div>
    </div>
    <button
      class="icon-btn small-icon"
      class:flag-on={!!item && isFlagged(item.word)}
      disabled={!item}
      aria-pressed={!!item && isFlagged(item.word)}
      onclick={toggleFlag}
      aria-label="Wort markieren"
      title="Wort markieren – landet im Deck „Markiert“ (M)"
    >
      <Icon name="flag" size={22} />
    </button>
    <button class="icon-btn small-icon" disabled={!canUndo} onclick={undo} aria-label="Rückgängig" title="Letzten Schritt rückgängig machen (Z)">
      <Icon name="undo" size={22} />
    </button>
    <!-- bei jedem Fortschritt kurz grün aufpulsieren -->
    {#key done}
      <span class="count small" class:pop={done > 0} aria-hidden="true">{percent}&#8239;%</span>
    {/key}
  </header>
  {#if session?.deckId}<p class="deck-label small muted">{deckName(session.deckId)}</p>{/if}

  <main class="body">
    {#if !session}
      <p class="muted center">Wird vorbereitet …</p>
    {:else if !item}
      <div class="done">
        {#if total === 0}
          <Seal char="休" />
          <h2 class="rise" style:--d="0.3s">Gerade gibt es nichts zu üben</h2>
          {#if session.deckId}
            <p class="muted">In „{deckName(session.deckId)}“ ist gerade nichts fällig und alle Wörter sind schon eingeführt.</p>
          {:else}
            <p class="muted">Alle fälligen Karten sind erledigt und das Tageslimit für neue Wörter ist erreicht – oder es ist kein Deck aktiv.</p>
          {/if}
        {:else}
          <!-- Abschluss: 好 schreibt sich, dann Titel, Zahlen, Serie und Meilensteine nacheinander -->
          <Seal char="好" />
          {#if finale}
            <h2 class="rise" style:--d="0.25s">{finale.title}</h2>
            <p class="muted sub rise" style:--d="0.35s">
              {#if finale.zh}<span class="zh">{finale.zh}</span> – {/if}{finale.sub}
            </p>
            <div class="stats rise" style:--d="0.45s">
              <div><strong><CountUp value={session.stats.learned} from={0} delay={550} /></strong><span>neu gelernt</span></div>
              <div><strong><CountUp value={session.stats.good} from={0} delay={650} /></strong><span>gewusst</span></div>
              <div><strong><CountUp value={session.stats.again} from={0} delay={750} /></strong><span>nochmal</span></div>
            </div>
            {#if streak.days > 0}
              <div class="streak-row rise" class:ignite={finale.streakUp} style:--d="0.8s">
                <span class="flame"><Icon name="flame" size={20} /></span>
                <span>
                  <strong><CountUp value={streak.days} from={finale.streakUp ? streak.days - 1 : streak.days} delay={1100} /></strong>
                  {streak.days === 1 ? 'Tag' : 'Tage'} in Folge
                </span>
                {#if finale.streakUp}<span class="plus">+1</span>{/if}
              </div>
            {/if}
            {#each finale.marks as m, i (m)}
              <div class="milestone" style:--d="{1.3 + i * 0.15}s"><Icon name="star" size={18} /> {m}</div>
            {/each}
          {/if}
        {/if}
      </div>
      <div class="dock bottom solo">
        <div class="dock-inner">
          <button class="btn primary" onclick={() => back('/')}>Fertig <kbd class="key">↵</kbd></button>
        </div>
      </div>
    {:else}
      {#key session.index}
        {#if item.kind === 'learn'}
          <LearnCard word={item.word} ondone={learned} />
        {:else if item.type === 'write'}
          <WriteQuiz word={item.word} startChar={session.charIndex} onrate={rate} onprogress={charProgress} />
        {:else if item.type === 'tone'}
          <ToneQuiz word={item.word} onrate={rate} />
        {:else}
          <RevealQuiz word={item.word} type={item.type} onrate={rate} />
        {/if}
      {/key}
    {/if}
  </main>
  {#if item}
    <p class="keys-help small muted" aria-hidden="true">
      <kbd>↵</kbd> weiter · <kbd>1</kbd> <kbd>2</kbd> bewerten · <kbd>1</kbd>–<kbd>5</kbd> Töne · <kbd>T</kbd> Tipp · <kbd>N</kbd> neu zeichnen · <kbd>M</kbd> markieren · <kbd>Z</kbd> rückgängig · <kbd>P</kbd> anhören · <kbd>Esc</kbd> beenden
    </p>
  {/if}
</div>

<style>
  /* Rahmen und Abfrage-Layout (.practice, .bar, .body, .q-*, Kürzel-Übersicht) stehen in app.css –
     gemeinsam mit dem Zeichenmodus (views/Sketch.svelte) */
  .progress {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
    transition: width 0.25s ease;
  }
  .deck-label {
    text-align: center;
    margin: -2px 0 0;
  }
  .flag-on {
    color: var(--accent);
  }
  .flag-on :global(svg) {
    fill: currentColor;
  }
  .small-icon:disabled {
    opacity: 0.3;
  }
  .count {
    display: inline-block;
    transform-origin: right center;
    min-width: 3.5em;
    text-align: right;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .count.pop {
    animation: count-pop 0.4s ease-out;
  }
  @keyframes count-pop {
    from {
      color: var(--good);
      transform: scale(1.22);
    }
  }
  .center {
    text-align: center;
    margin-top: 30vh;
  }
  .done {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 10vh;
  }
  .done h2 {
    margin: 6px 0 0;
  }
  .done .sub {
    margin: -6px 0 0;
  }
  /* nacheinander von unten einblenden; die Verzögerung steht je Element in --d */
  .rise {
    animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: var(--d, 0s);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
  .streak-row,
  .milestone {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 999px;
    font-weight: 650;
  }
  .streak-row {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .flame {
    display: inline-flex;
  }
  .flame :global(svg path) {
    fill: currentColor;
    fill-rule: evenodd;
  }
  /* Serie gerade gewachsen: Flamme zündet, „+1“ steigt auf */
  .streak-row.ignite .flame {
    animation: ignite 0.7s ease-out both;
    animation-delay: calc(var(--d) + 0.15s);
  }
  @keyframes ignite {
    0% {
      opacity: 0;
      transform: scale(0.4);
    }
    55% {
      opacity: 1;
      transform: scale(1.35) rotate(-8deg);
    }
    75% {
      transform: scale(0.92) rotate(4deg);
    }
  }
  .plus {
    font-size: 0.85rem;
    color: var(--good);
    animation: plus 0.6s ease-out both;
    animation-delay: calc(var(--d) + 0.5s);
  }
  @keyframes plus {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  .milestone {
    background: var(--good-soft);
    color: var(--good);
    animation: milestone 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
    animation-delay: var(--d);
  }
  .milestone :global(svg path) {
    fill: currentColor;
  }
  @keyframes milestone {
    from {
      opacity: 0;
      transform: scale(0.7);
    }
  }
  .stats {
    display: flex;
    gap: 12px;
    width: 100%;
    margin-top: 8px;
  }
  .stats div {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 14px 6px;
    display: flex;
    flex-direction: column;
  }
  .stats strong {
    font-size: 1.8rem;
  }
  .stats span {
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
