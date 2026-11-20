<script lang="ts">
  import { onMount } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import LearnCard from '../components/LearnCard.svelte'
  import RevealQuiz from '../components/RevealQuiz.svelte'
  import ToneQuiz from '../components/ToneQuiz.svelte'
  import WriteQuiz from '../components/WriteQuiz.svelte'
  import { back, route } from '../lib/router.svelte'
  import { deckName } from '../lib/state.svelte'
  import { buildSession, clearSession, markIntroduced, rateCard, resumableSession, saveSession } from '../lib/srs'
  import type { Session, SessionItem } from '../lib/types'

  let session = $state<Session | null>(null)
  let busy = false

  onMount(async () => {
    let s = route.query.get('fortsetzen') ? await resumableSession() : undefined
    s ??= await buildSession(route.query.get('deck') ?? undefined)
    session = s
    if (s.items.length) await persist()
  })

  const item = $derived(session && session.index < session.items.length ? session.items[session.index] : null)
  const total = $derived(session?.items.length ?? 0)
  const progress = $derived(session && total ? session.index / total : 0)

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
      await rateCard(item.word, item.type, grade)
      if (grade === 1) {
        session.stats.again++
        // später in dieser Sitzung noch einmal
        const at = Math.min(session.items.length, session.index + 5)
        session.items.splice(at, 0, $state.snapshot(item) as SessionItem)
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
      await markIntroduced(item.word)
      session.stats.learned++
      await advance()
    } finally {
      busy = false
    }
  }

  async function charProgress(i: number) {
    if (!session) return
    session.charIndex = i
    await persist()
  }
</script>

<div class="practice">
  <header class="bar">
    <button class="icon-btn" onclick={() => back('/')} aria-label="Übung beenden">
      <Icon name="close" />
    </button>
    <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={session?.index ?? 0}>
      <div class="fill" style:width="{progress * 100}%"></div>
    </div>
    <span class="count small muted">{Math.min(session?.index ?? 0, total)}/{total}</span>
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
      <div class="dock bottom">
        <div class="dock-inner">
          <button class="btn primary" onclick={() => back('/')}>Fertig</button>
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
</div>

<style>
  .practice {
    min-height: 100dvh;
  }
  .bar {
    position: sticky;
    top: 0;
    z-index: 6;
    background: var(--bg);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: calc(var(--safe-top) + 6px) 16px 6px 6px;
    max-width: 560px;
    margin: 0 auto;
  }
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
  .count {
    min-width: 3.5em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .body {
    max-width: 560px;
    margin: 0 auto;
    /* seitlicher Abstand: Rand bleibt frei für die Zurück-Geste */
    padding: 4px 24px calc(110px + var(--safe-bottom));
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
