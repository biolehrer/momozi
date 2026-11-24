<script lang="ts">
  // Zeichenmodus: gelernte Wörter frei schreiben, ohne Bewertung – der Lernplan bleibt unberührt (lib/sketch.ts).
  import { onMount } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import Logo from '../components/Logo.svelte'
  import WriteQuiz from '../components/WriteQuiz.svelte'
  import { consume, shortcut } from '../lib/keys'
  import { back } from '../lib/router.svelte'
  import { learnedGroups, pickNext, unite, writeWeights, type SketchGroup } from '../lib/sketch'
  import { wordKey, type Word } from '../lib/types'

  /** zuletzt gewählte Wörter und Umriss – nur Bequemlichkeit, darf fehlen */
  const PREFS = 'momozi.zeichnen'
  const ALL = 'alle'

  let groups = $state<SketchGroup[] | null>(null)
  let source = $state(ALL)
  let outline = $state(false)
  let word = $state<Word | null>(null)
  /** zählt jede gezeigte Karte – neuer Schlüssel auch für dasselbe Wort */
  let turn = $state(0)
  let drawn = $state(0)
  let weights = new Map<string, number>()
  const recent: string[] = []

  const all = $derived(groups ? unite(groups) : [])
  const pool = $derived(source === ALL ? all : (groups?.find((g) => g.id === source)?.words ?? []))

  function loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) ?? '{}')
      if (typeof p.outline === 'boolean') outline = p.outline
      if (typeof p.source === 'string') source = p.source
    } catch {
      /* ohne gespeicherte Auswahl */
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS, JSON.stringify({ source, outline }))
    } catch {
      /* egal */
    }
  }

  onMount(async () => {
    loadPrefs()
    const g = await learnedGroups()
    if (source !== ALL && !g.some((x) => x.id === source)) source = ALL
    weights = await writeWeights(unite(g))
    groups = g
    next()
  })

  function next() {
    word = pickNext(pool, weights, recent)
    if (word) {
      recent.push(wordKey(word))
      if (recent.length > 20) recent.shift()
    }
    turn++
  }

  function changeSource(id: string) {
    source = id
    savePrefs()
    recent.length = 0
    next()
  }

  function toggleOutline() {
    outline = !outline
    savePrefs()
    // dieselbe Karte noch einmal, jetzt mit bzw. ohne Umriss
    turn++
  }

  function onKey(e: KeyboardEvent) {
    const k = shortcut(e)
    if (!k) return
    if (k === 'Escape') {
      consume(e)
      back('/')
    } else if (k === 'u' && word) {
      consume(e)
      toggleOutline()
    } else if (k === 'p') {
      const btn = document.querySelector<HTMLButtonElement>('.practice .body .speak')
      if (btn) {
        consume(e)
        btn.click()
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="practice sketch">
  <header class="bar">
    <button class="icon-btn" onclick={() => back('/')} aria-label="Zeichnen beenden" title="Zeichnen beenden (Esc)">
      <Icon name="close" />
    </button>
    {#if groups?.length}
      <!-- nach der Wahl Fokus lösen: in Feldern greifen die Tastenkürzel sonst nicht (siehe lib/keys.ts) -->
      <select
        class="source"
        value={source}
        onchange={(e) => {
          changeSource(e.currentTarget.value)
          e.currentTarget.blur()
        }}
        aria-label="Welche Wörter"
      >
        <option value={ALL}>Alle gelernten ({all.length})</option>
        {#each groups as g (g.id)}
          <option value={g.id}>{g.name} ({g.words.length})</option>
        {/each}
      </select>
      <label class="outline" title="Umriss zum Nachzeichnen (U)">
        <span class="small">Umriss</span>
        <input
          type="checkbox"
          class="switch"
          aria-label="Umriss zum Nachzeichnen"
          checked={outline}
          onchange={(e) => {
            toggleOutline()
            e.currentTarget.blur()
          }}
        />
      </label>
    {:else}
      <span class="title">Zeichnen</span>
    {/if}
  </header>
  {#if groups?.length}
    <p class="sub small muted">{drawn} gezeichnet · zählt nicht zum Lernplan</p>
  {/if}

  <main class="body">
    {#if !groups}
      <p class="muted center">Wird vorbereitet …</p>
    {:else if !word}
      <div class="empty fade-in">
        <Logo size={96} />
        <h2>Noch nichts zum Zeichnen</h2>
        <p class="muted">
          Hier schreibst du Wörter, die du schon kennengelernt hast – so oft du magst, ohne Wertung. Lerne zuerst ein paar
          Wörter mit „Üben“, dann tauchen sie hier auf.
        </p>
      </div>
      <div class="dock bottom solo">
        <div class="dock-inner">
          <button class="btn primary" onclick={() => back('/')}>Zurück</button>
        </div>
      </div>
    {:else}
      {#key turn}
        <WriteQuiz {word} free {outline} onnext={next} onfinish={() => drawn++} />
      {/key}
    {/if}
  </main>
  {#if word}
    <p class="keys-help small muted" aria-hidden="true">
      <kbd>↵</kbd> weiter · <kbd>T</kbd> Tipp · <kbd>N</kbd> neu zeichnen · <kbd>→</kbd> überspringen · <kbd>U</kbd> Umriss ·
      <kbd>P</kbd> anhören · <kbd>Esc</kbd> beenden
    </p>
  {/if}
</div>

<style>
  .source {
    flex: 1;
    min-width: 0;
    max-width: 340px;
    height: 40px;
    padding: 0 10px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 600;
  }
  .outline {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    white-space: nowrap;
  }
  .title {
    font-weight: 650;
  }
  .sub {
    text-align: center;
    margin: -2px 0 0;
  }
  .center {
    text-align: center;
    margin-top: 30vh;
  }
  .empty {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding-top: 10vh;
  }
  .empty p {
    max-width: 26em;
  }
</style>
