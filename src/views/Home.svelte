<script lang="ts">
  import { onMount } from 'svelte'
  import { go } from '../lib/router.svelte'
  import { app, deckName, install } from '../lib/state.svelte'
  import { introducedKeys, overview, resumableSession, type Overview } from '../lib/srs'
  import { isIos, isStandalone } from '../lib/platform'
  import Icon from '../components/Icon.svelte'
  import Logo from '../components/Logo.svelte'
  import { streak } from '../lib/streak.svelte'
  import { backupLevel, formatDate, shouldRemind, snoozeReminder, type BackupLevel, type BackupStatus } from '../lib/backup'

  let ov = $state<Overview | null>(null)
  let resumeLeft = $state(0)
  let resumeDeck = $state('')
  let remind = $state<BackupStatus | null>(null)
  /** roter Punkt am Sicherungs-Symbol: bleibt, auch wenn die Hinweiskarte weggetippt wurde */
  /** Schild oben rechts: grau, grün (frisch gesichert) oder rot (Sicherung empfohlen) – siehe backupLevel() */
  let shield = $state<BackupLevel>('idle')
  let lastBackup = $state<number | null>(null)
  /** schon kennengelernte Wörter (alle Decks) – erst dann gibt es etwas zum Zeichnen */
  let known = $state(0)

  async function snooze() {
    remind = null
    await snoozeReminder(7)
  }
  let showIosHint = $state(false)

  const HINT_KEY = 'zw-ios-hint-dismissed'

  onMount(async () => {
    const [o, s, r, b, k] = await Promise.all([overview(), resumableSession(), shouldRemind(), backupLevel(), introducedKeys()])
    known = k.size
    remind = r
    shield = b.level
    lastBackup = b.status.lastAt
    ov = o
    resumeLeft = s ? s.items.length - s.index : 0
    resumeDeck = s?.deckId ? deckName(s.deckId) : ''
    let dismissed = false
    try {
      dismissed = localStorage.getItem(HINT_KEY) === '1'
    } catch {
      /* privates Fenster o. Ä. */
    }
    showIosHint = isIos() && !isStandalone() && !dismissed
  })

  function dismissHint() {
    showIosHint = false
    try {
      localStorage.setItem(HINT_KEY, '1')
    } catch {
      /* egal */
    }
  }

  async function installApp() {
    const e = install.event
    if (!e) return
    install.event = null
    await e.prompt()
  }

  const todo = $derived(ov ? ov.due + ov.newToday : 0)
  const shieldLabel = $derived(
    shield === 'due'
      ? 'Sicherung – eine neue Sicherung wäre gut'
      : lastBackup
        ? `Sicherung – zuletzt gesichert am ${formatDate(lastBackup)}`
        : 'Sicherung',
  )
  const dateLabel = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
</script>

<header class="hero">
  <div class="inner">
    <div class="logo" aria-hidden="true"><Logo size={52} /></div>
    <div class="spacer">
      <!-- mit Seitenleiste steht der App-Name schon links -->
      <h1><span class="phone-title">Momozì</span><span class="wide-title">Heute</span></h1>
      <p class="muted small">{dateLabel}</p>
    </div>
    {#if streak.days > 0}
      <span
        class="streak"
        class:lit={streak.today}
        role="img"
        aria-label="Serie: {streak.days} {streak.days === 1 ? 'Tag' : 'Tage'} in Folge geübt{streak.today
          ? ''
          : ' – heute noch nicht'}"
        title="{streak.days} {streak.days === 1 ? 'Tag' : 'Tage'} in Folge geübt{streak.today ? '' : ' – heute noch nicht'}"
      >
        <Icon name="flame" size={18} />
        <span class="streak-num">{streak.days}</span>
        {#if streak.warn}<span class="dot" aria-hidden="true"></span>{/if}
      </span>
    {/if}
    <button class="icon-btn backup-btn {shield}" onclick={() => go('/sicherung')} aria-label={shieldLabel} title={shieldLabel}>
      <Icon name={shield === 'due' ? 'shieldAlert' : shield === 'fresh' ? 'shield' : 'shieldEmpty'} size={26} />
    </button>
  </div>
</header>

<!-- Handy: alles untereinander (Reihenfolge wie im Quelltext). Ab Tablet ein Raster: „Zeichnen“ rechts neben
     „Gelernt“ und dem Start-Knopf, ab 1100 px zusätzlich „Aktive Decks“ rechts neben den Zahlen (siehe Stil unten) -->
<div class="page home" class:with-sketch={known > 0}>
  <div class="tiles">
    <div class="tile">
      <span class="num">{ov ? ov.due : '–'}</span>
      <span class="lbl">fällig</span>
    </div>
    <div class="tile">
      <span class="num">{ov ? ov.newToday : '–'}</span>
      <span class="lbl">neue Wörter</span>
    </div>
  </div>

  {#if ov}
    <div class="card learned">
      <div class="row">
        <span>Gelernt</span>
        <span class="spacer"></span>
        <span class="muted">{ov.learned} von {ov.total} Wörtern</span>
      </div>
      <div class="bar"><div class="fill" style:width="{ov.total ? (ov.learned / ov.total) * 100 : 0}%"></div></div>
    </div>
  {/if}
  <div class="start-inline">{@render start()}</div>

  {#if known > 0}
    <button class="card sketch-card fade-in" onclick={() => go('/zeichnen')}>
      <span class="sketch-icon"><Icon name="brush" size={22} /></span>
      <span class="grow">
        <span class="sketch-title">Zeichnen</span>
        <span class="muted small">Gelernte Wörter frei schreiben – zählt nicht zum Lernplan</span>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  {/if}

  <div class="card decks">
    <div class="row">
      <span>Aktive Decks</span>
      <span class="spacer"></span>
      <button class="btn ghost small" onclick={() => go('/decks')}>Ändern</button>
    </div>
    <div class="chips">
      {#each app.settings.activeDecks as id (id)}
        <span class="badge">{deckName(id)}</span>
      {:else}
        <span class="muted small">Kein Deck aktiv</span>
      {/each}
    </div>
  </div>

  {#if remind || install.event || showIosHint}
    <div class="notes stack">
      {#if remind}
        <div class="remind fade-in">
          <button class="remind-open" onclick={() => go('/sicherung')}>
            <Icon name="shield" size={22} />
            <span class="grow">
              <span class="remind-title">Lernstand sichern?</span>
              <span class="muted small">
                {remind.lastAt ? `Letzte Sicherung: ${formatDate(remind.lastAt)}` : 'Noch keine Sicherung'} · kurz erklärt
              </span>
            </span>
          </button>
          <button class="icon-btn" aria-label="Später erinnern" title="Später erinnern" onclick={snooze}>
            <Icon name="close" size={18} />
          </button>
        </div>
      {/if}

      {#if install.event}
        <div class="notice row">
          <span class="spacer">Momozì als App installieren?</span>
          <button class="btn small primary" onclick={installApp}>Installieren</button>
        </div>
      {/if}

      {#if showIosHint}
        <div class="notice">
          <strong>Tipp fürs iPhone:</strong> In Safari auf „Teilen“ und dann „Zum Home-Bildschirm“ tippen.
          Achtung: Safari und die installierte App speichern den Fortschritt getrennt – am besten gleich die App nutzen.
          <div class="row" style="margin-top:8px">
            <span class="spacer"></span>
            <button class="btn small" onclick={dismissHint}>Verstanden</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#snippet start()}
  {#if resumeLeft > 0}
    <button class="btn primary" onclick={() => go('/ueben?fortsetzen=1')}>
      Weiter üben{resumeDeck ? `: ${resumeDeck}` : ''} ({resumeLeft})
    </button>
  {:else if todo > 0}
    <button class="btn primary" onclick={() => go('/ueben')}>Üben starten</button>
  {:else}
    <button class="btn" disabled>{ov ? 'Für heute erledigt' : 'Lädt …'}</button>
  {/if}
{/snippet}

<!-- Handy: im Daumenbereich unten; Tablet/PC: direkt unter den Zahlen (siehe .start-inline) -->
<div class="dock start-dock">
  <div class="dock-inner">
    {@render start()}
  </div>
</div>

<style>
  .hero {
    padding-top: var(--safe-top);
  }
  .hero .inner {
    max-width: var(--col);
    margin: 0 auto;
    padding: 18px 16px 6px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .hero .spacer {
    min-width: 0;
  }
  .hero p {
    margin: 2px 0 0;
    /* Datum einzeilig, auch mit Serien-Flamme daneben */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .logo {
    flex-shrink: 0;
  }
  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .tile {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
  }
  .num {
    font-size: 2.6rem;
    font-weight: 750;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .lbl {
    color: var(--muted);
    margin-top: 6px;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    margin-top: 10px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--good);
  }
  .streak {
    position: relative;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 4px 9px 4px 6px;
    border-radius: 999px;
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--line);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  /* heute schon geübt: Flamme leuchtet */
  .streak.lit {
    color: var(--accent);
    border-color: var(--accent-soft);
    background: var(--accent-soft);
  }
  /* gefüllt, die innere Flamme bleibt ausgespart */
  .streak.lit :global(svg path) {
    fill: currentColor;
    fill-rule: evenodd;
  }
  .streak .dot {
    top: -2px;
    right: -2px;
  }
  .backup-btn {
    position: relative;
    color: var(--muted);
    margin-right: -6px;
  }
  /* bewusst zurückhaltend: Pastellfläche, Symbol nur gedämpft eingefärbt; die Fläche bündig mit dem Inhalt */
  .backup-btn.fresh,
  .backup-btn.due {
    margin-right: 0;
  }
  .backup-btn.fresh {
    background: var(--good-soft);
    color: color-mix(in srgb, var(--good) 70%, var(--muted));
  }
  .backup-btn.due {
    background: var(--bad-soft);
    color: color-mix(in srgb, var(--bad) 65%, var(--muted));
  }
  .dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--bad);
    border: 2px solid var(--bg);
  }
  .remind {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    padding: 4px 4px 4px 0;
  }
  .remind-open {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    border: none;
    background: transparent;
    text-align: left;
    padding: 10px 4px 10px 14px;
    cursor: pointer;
    color: var(--good);
  }
  .remind-open .grow {
    display: flex;
    flex-direction: column;
    color: var(--ink);
  }
  .remind-title {
    font-weight: 600;
  }
  .sketch-card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    color: var(--ink);
    font: inherit;
  }
  .sketch-card .grow {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .sketch-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: var(--accent-soft);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .sketch-title {
    font-weight: 650;
  }
  @media (hover: hover) and (pointer: fine) {
    .sketch-card:hover {
      background: var(--surface-2);
    }
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .home {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wide-title,
  .start-inline {
    display: none;
  }
  .start-inline :global(.btn) {
    width: 100%;
  }
  .tiles {
    grid-area: tiles;
  }
  .learned {
    grid-area: learned;
  }
  .start-inline {
    grid-area: start;
  }
  .sketch-card {
    grid-area: sketch;
    align-self: stretch;
  }
  .decks {
    grid-area: decks;
  }
  .notes {
    grid-area: notes;
  }
  @media (min-width: 700px) {
    .logo,
    .phone-title,
    .start-dock {
      display: none;
    }
    .start-inline {
      display: block;
    }
    .wide-title {
      display: inline;
    }
    /* Tablet hochkant: Raster mit zwei Spalten, „Zeichnen“ so hoch wie „Gelernt“ und Start-Knopf zusammen */
    .home {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'tiles tiles'
        'learned learned'
        'start start'
        'decks decks'
        'notes notes';
      align-items: start;
    }
    .home.with-sketch {
      grid-template-areas:
        'tiles tiles'
        'learned sketch'
        'start sketch'
        'decks decks'
        'notes notes';
    }
  }
  /* iPad quer und Mac: „Aktive Decks“ rechts neben den Zahlen, Hinweise rechts darunter */
  @media (min-width: 1100px) {
    .home {
      grid-template-areas:
        'tiles decks'
        'learned notes'
        'start notes';
      gap: 12px 16px;
    }
    .home.with-sketch {
      grid-template-areas:
        'tiles decks'
        'learned sketch'
        'start sketch'
        '. notes';
    }
    /* so hoch wie die Zahlen daneben – gerade Kanten */
    .decks {
      align-self: stretch;
    }
    .num {
      font-size: 3.2rem;
    }
  }
</style>
