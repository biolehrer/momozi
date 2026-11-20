<script lang="ts">
  import Icon from './Icon.svelte'
  import { goTab, route } from '../lib/router.svelte'

  const tabs = [
    { path: '/', label: 'Start', icon: 'home' },
    { path: '/decks', label: 'Decks', icon: 'decks' },
    { path: '/suche', label: 'Suche', icon: 'search' },
    { path: '/einstellungen', label: 'Optionen', icon: 'settings' },
  ] as const

  function isCurrent(path: string) {
    if (path === '/decks') return ['/decks', '/deck', '/wort', '/neu', '/bearbeiten'].includes(route.path)
    if (path === '/einstellungen') return ['/einstellungen', '/lizenzen'].includes(route.path)
    return route.path === path
  }
</script>

<nav class="tabbar" aria-label="Hauptnavigation">
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
</style>
