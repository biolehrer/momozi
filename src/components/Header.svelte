<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from './Icon.svelte'
  import { back } from '../lib/router.svelte'

  let {
    title,
    backTo,
    actions,
  }: {
    title: string
    /** Rückfall-Adresse; wenn gesetzt, wird ein Zurück-Button gezeigt */
    backTo?: string
    actions?: Snippet
  } = $props()
</script>

<header class="header">
  <div class="inner">
    {#if backTo !== undefined}
      <button class="icon-btn" onclick={() => back(backTo)} aria-label="Zurück">
        <Icon name="back" />
      </button>
    {/if}
    <h1 class="title ellipsis" class:with-back={backTo !== undefined}>{title}</h1>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 6;
    background: var(--bg);
    padding-top: var(--safe-top);
  }
  .inner {
    max-width: var(--col);
    margin: 0 auto;
    min-height: 60px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 4px 16px;
  }
  .title {
    flex: 1;
    font-size: 1.35rem;
  }
  .title.with-back {
    font-size: 1.2rem;
  }
  .inner:has(.icon-btn:first-child) {
    padding-left: 4px;
  }
  .actions {
    display: flex;
    gap: 2px;
  }
</style>
