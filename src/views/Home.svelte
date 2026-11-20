<script lang="ts">
  import { onMount } from 'svelte'
  import { go } from '../lib/router.svelte'
  import { app, deckName, install } from '../lib/state.svelte'
  import { overview, resumableSession, type Overview } from '../lib/srs'
  import { isIos, isStandalone } from '../lib/platform'
  import Icon from '../components/Icon.svelte'
  import { formatDate, needsBackup, shouldRemind, snoozeReminder, type BackupStatus } from '../lib/backup'

  let ov = $state<Overview | null>(null)
  let resumeLeft = $state(0)
  let resumeDeck = $state('')
  let remind = $state<BackupStatus | null>(null)
  /** roter Punkt am Sicherungs-Symbol: bleibt, auch wenn die Hinweiskarte weggetippt wurde */
  let due = $state(false)

  async function snooze() {
    remind = null
    await snoozeReminder(7)
  }
  let showIosHint = $state(false)

  const HINT_KEY = 'zw-ios-hint-dismissed'

  onMount(async () => {
    const [o, s, r, n] = await Promise.all([overview(), resumableSession(), shouldRemind(), needsBackup()])
    remind = r
    due = !!n
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
  const dateLabel = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
</script>

<header class="hero">
  <div class="inner">
    <div class="logo zh" aria-hidden="true">字</div>
    <div class="spacer">
      <!-- mit Seitenleiste steht der App-Name schon links -->
      <h1><span class="phone-title">Zeichenweise</span><span class="wide-title">Heute</span></h1>
      <p class="muted small">{dateLabel}</p>
    </div>
    <button
      class="icon-btn backup-btn"
      onclick={() => go('/sicherung')}
      aria-label={due ? 'Sicherung – letzte Sicherung ist länger her' : 'Sicherung'}
      title="Sicherung"
    >
      <Icon name="shield" size={26} />
      {#if due}<span class="dot" aria-hidden="true"></span>{/if}
    </button>
  </div>
</header>

<div class="page home">
  <div class="col stack">
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
      <div class="card">
        <div class="row">
          <span>Gelernt</span>
          <span class="spacer"></span>
          <span class="muted">{ov.learned} von {ov.total} Wörtern</span>
        </div>
        <div class="bar"><div class="fill" style:width="{ov.total ? (ov.learned / ov.total) * 100 : 0}%"></div></div>
      </div>
    {/if}
    <div class="start-inline">{@render start()}</div>
  </div>

  <div class="col stack">
    <div class="card">
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
        <span class="spacer">Zeichenweise als App installieren?</span>
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
  .hero p {
    margin: 2px 0 0;
  }
  .logo {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 2.2rem;
    line-height: 52px;
    text-align: center;
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
  .backup-btn {
    position: relative;
    color: var(--muted);
    margin-right: -6px;
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
  @media (min-width: 700px) {
    .logo,
    .phone-title,
    .start-dock {
      display: none;
    }
    .start-inline {
      display: block;
      margin-top: 4px;
    }
    .wide-title {
      display: inline;
    }
  }
  @media (min-width: 1100px) {
    .home {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 16px;
    }
    .num {
      font-size: 3.2rem;
    }
  }
</style>
