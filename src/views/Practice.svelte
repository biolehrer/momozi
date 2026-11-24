<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import LearnCard from '../components/LearnCard.svelte'
  import RevealQuiz from '../components/RevealQuiz.svelte'
  import ToneQuiz from '../components/ToneQuiz.svelte'
  import WriteQuiz from '../components/WriteQuiz.svelte'
  import { consume, isPrimary, shortcut } from '../lib/keys'
  import { back, route } from '../lib/router.svelte'
  import { deckName } from '../lib/state.svelte'
  import { requeue } from '../lib/order'
  import { isFlagged, setMark } from '../lib/marks.svelte'
  import { practicedNow, refreshStreak } from '../lib/streak.svelte'
  import {
    buildSession,
    clearSession,
    markIntroduced,
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

  onMount(async () => {
    let s = route.query.get('fortsetzen') ? await resumableSession() : undefined
    s ??= await buildSession(route.query.get('deck') ?? undefined)
    session = s
    if (s.items.length) await persist()
  })

  const item = $derived(session && session.index < session.items.length ? session.items[session.index] : null)
  const total = $derived(session?.items.length ?? 0)
  // Fester Fortschritt: jede Aufgabe zählt einmal und ist erst mit „Gewusst“ (bzw. nach dem Kennenlernen) erledigt.
  // Jedes „Nochmal“ hängt eine Kopie an – ohne sie bleibt die Zahl der Aufgaben gleich (gilt auch für alte Sitzungen).
  const goal = $derived(session ? session.items.length - session.stats.again : 0)
  const done = $derived(session ? session.stats.good + session.stats.learned : 0)
  const percent = $derived(goal ? Math.floor((done / goal) * 100) : 0)

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
    <span class="count small" aria-hidden="true">{percent}&#8239;%</span>
  </header>
  {#if session?.deckId}<p class="deck-label small muted">{deckName(session.deckId)}</p>{/if}

  <main class="body">
    {#if !session}
      <p class="muted center">Wird vorbereitet …</p>
    {:else if !item}
      <div class="done fade-in">
        {#if total === 0}
          <div class="seal zh">休</div>
          <h2>Gerade gibt es nichts zu üben</h2>
          {#if session.deckId}
            <p class="muted">In „{deckName(session.deckId)}“ ist gerade nichts fällig und alle Wörter sind schon eingeführt.</p>
          {:else}
            <p class="muted">Alle fälligen Karten sind erledigt und das Tageslimit für neue Wörter ist erreicht – oder es ist kein Deck aktiv.</p>
          {/if}
        {:else}
          <div class="seal zh">好</div>
          <h2>Geschafft!</h2>
          <div class="stats">
            <div><strong>{session.stats.learned}</strong><span>neu gelernt</span></div>
            <div><strong>{session.stats.good}</strong><span>gewusst</span></div>
            <div><strong>{session.stats.again}</strong><span>nochmal</span></div>
          </div>
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
    min-width: 3.5em;
    text-align: right;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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
  .seal {
    width: 96px;
    height: 96px;
    border-radius: 18px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 4rem;
    line-height: 96px;
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
