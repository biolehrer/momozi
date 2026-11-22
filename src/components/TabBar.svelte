<script lang="ts">
  // Hauptnavigation – je nach Bildschirm:
  //  Handy (< 700 px): Leiste unten
  //  Tablet hochkant (≥ 700 px): schmale Icon-Leiste links
  //  Tablet quer / PC (≥ 1100 px): Seitenleiste links mit Namen
  import Icon from './Icon.svelte'
  import { goTab, route } from '../lib/router.svelte'

  const tabs = [
    { path: '/', label: 'Start', icon: 'home' },
    { path: '/decks', label: 'Decks', icon: 'decks' },
    { path: '/suche', label: 'Suche', icon: 'search' },
    { path: '/einstellungen', label: 'Optionen', icon: 'settings' },
  ] as const

  function isCurrent(path: string) {
    const fromSearch = route.path === '/wort' && route.query.get('from') === 'suche'
    if (path === '/decks') return !fromSearch && ['/decks', '/deck', '/wort', '/bearbeiten', '/auswahl'].includes(route.path)
    if (path === '/suche') return route.path === '/suche' || fromSearch
    if (path === '/einstellungen') return ['/einstellungen', '/lizenzen', '/sicherung'].includes(route.path)
    return route.path === path
  }
</script>

<nav class="tabbar" aria-label="Hauptnavigation">
  <div class="brand" aria-hidden="true">
    <span class="logo zh">字</span>
    <span class="name">Zeichenweise</span>
  </div>
  <div class="inner">
    {#each tabs as t (t.path)}
      <button class="tab" class:current={isCurrent(t.path)} aria-current={isCurrent(t.path) ? 'page' : undefined} onclick={() => goTab(t.path)}>
        <Icon name={t.icon} size={24} />
        <span>{t.label}</span>
      </button>
    {/each}
  </div>
</nav>

<style>
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    background: var(--surface);
    border-top: 1px solid var(--line);
    padding-bottom: var(--safe-bottom);
  }
  .brand {
    display: none;
  }
  .inner {
    max-width: 560px;
    margin: 0 auto;
    display: flex;
    height: var(--tabbar-h);
  }
  .tab {
    flex: 1;
    border: none;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    touch-action: manipulation;
  }
  .tab.current {
    color: var(--accent);
  }
  .tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .logo {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 1.85rem;
    line-height: 44px;
    text-align: center;
    flex-shrink: 0;
  }

  /* ---------- Rail: schmale Leiste links ---------- */
  @media (min-width: 700px) {
    .tabbar {
      top: 0;
      right: auto;
      width: var(--nav-w);
      border-top: none;
      border-right: 1px solid var(--line);
      padding: calc(var(--safe-top) + 16px) 0 calc(var(--safe-bottom) + 16px) var(--safe-left);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .brand {
      display: flex;
      justify-content: center;
    }
    .name {
      display: none;
    }
    .inner {
      flex-direction: column;
      height: auto;
      max-width: none;
      margin: 0;
      padding: 0 10px;
      gap: 6px;
    }
    .tab {
      flex: none;
      height: 64px;
      border-radius: 14px;
      gap: 4px;
    }
    .tab.current {
      background: var(--accent-soft);
    }
  }

  /* ---------- Seitenleiste mit Namen ---------- */
  @media (min-width: 1100px) {
    .tabbar {
      gap: 24px;
    }
    .brand {
      justify-content: flex-start;
      align-items: center;
      gap: 12px;
      padding: 0 20px;
    }
    .name {
      display: block;
      font-size: 1.2rem;
      font-weight: 750;
    }
    .inner {
      padding: 0 12px;
      gap: 4px;
    }
    .tab {
      height: 48px;
      flex-direction: row;
      justify-content: flex-start;
      gap: 14px;
      padding: 0 14px;
      border-radius: 12px;
      font-size: 1rem;
      color: var(--ink);
    }
    .tab :global(svg) {
      color: var(--muted);
    }
    .tab.current,
    .tab.current :global(svg) {
      color: var(--accent);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .tab:not(.current):hover {
      background: var(--surface-2);
    }
  }
</style>
