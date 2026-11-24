<script lang="ts">
  // Erfolgsmeldung nach einem Import (lib/celebrate.svelte.ts): weichgezeichnete Seite wie beim Drag & Drop,
  // ein Kreis und dann ein Haken zeichnen sich, darunter Titel und Zahlen. Antippen oder Esc schließt sofort.
  import { celebration, finish } from '../lib/celebrate.svelte'

  function onKey(e: KeyboardEvent) {
    if (celebration.current && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      finish()
    }
  }
</script>

<svelte:window onpointerdown={() => celebration.current && finish()} onkeydown={onKey} />

{#if celebration.current}
  {#key celebration.current.id}
    <div class="celebrate" class:leaving={celebration.leaving} role="status" aria-live="polite">
      <div class="panel">
        <svg class="tick" viewBox="0 0 64 64" width="76" height="76" aria-hidden="true">
          <circle class="ring" cx="32" cy="32" r="28" />
          <path class="mark" d="M20 33.5l8 8 16-17" />
        </svg>
        <strong>{celebration.current.title}</strong>
        {#if celebration.current.detail}<span class="detail">{celebration.current.detail}</span>{/if}
      </div>
    </div>
  {/key}
{/if}

<style>
  /* wie die Ablagefläche beim Drag & Drop (components/DropImport.svelte) */
  .celebrate {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, var(--bg) 35%, transparent);
    -webkit-backdrop-filter: blur(7px);
    backdrop-filter: blur(7px);
    animation: in 0.18s ease;
    transition: opacity 0.28s ease;
  }
  .celebrate.leaving {
    opacity: 0;
  }
  .panel {
    width: min(360px, 100%);
    padding: 30px 28px 28px;
    border-radius: 28px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.14);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    animation: pop 0.38s cubic-bezier(0.2, 0.9, 0.3, 1.25);
    transition: transform 0.28s ease;
  }
  .leaving .panel {
    transform: scale(0.97);
  }
  .tick {
    color: var(--good);
    margin-bottom: 8px;
  }
  /* Kreis zeichnet sich (Umfang 2π·28 ≈ 176), dann der Haken */
  .ring {
    fill: var(--good-soft);
    fill-opacity: 0;
    stroke: currentColor;
    stroke-width: 3;
    stroke-dasharray: 176;
    stroke-dashoffset: 176;
    transform: rotate(-90deg);
    transform-origin: center;
    animation:
      draw 0.45s ease-out 0.05s forwards,
      fill 0.3s ease 0.3s forwards;
  }
  .mark {
    fill: none;
    stroke: currentColor;
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 36;
    stroke-dashoffset: 36;
    animation: draw 0.3s ease-out 0.42s forwards;
  }
  strong {
    font-size: 1.3rem;
  }
  .detail {
    color: var(--muted);
    font-size: 0.95rem;
  }
  @keyframes in {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
  }
  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes fill {
    to {
      fill-opacity: 1;
    }
  }
  /* ohne Animationen (Systemeinstellung „Bewegung reduzieren“): Haken gleich vollständig */
  @media (prefers-reduced-motion: reduce) {
    .ring,
    .mark {
      stroke-dashoffset: 0;
    }
    .ring {
      fill-opacity: 1;
    }
  }
</style>
