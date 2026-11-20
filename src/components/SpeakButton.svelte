<script lang="ts">
  // Lautsprecher-Taste. Erscheint nur, wenn es für das Wort eine Aufnahme gibt.
  // auto: beim Erscheinen einmal abspielen (wenn in den Optionen erlaubt).
  import { onMount } from 'svelte'
  import Icon from './Icon.svelte'
  import { audio, audioFor, playWord } from '../lib/audio.svelte'
  import { app } from '../lib/state.svelte'
  import { wordKey, type Word } from '../lib/types'

  let { word, auto = false, size = 48 }: { word: Word; auto?: boolean; size?: number } = $props()

  const entry = $derived(audioFor(word))
  const playing = $derived(audio.playing === wordKey(word))

  onMount(() => {
    if (auto && app.settings.autoplay && audioFor(word)) playWord(word)
  })
</script>

{#if entry}
  <button
    class="speak"
    class:playing
    style:width="{size}px"
    style:height="{size}px"
    onclick={() => playWord(word)}
    aria-label={entry.s === 'ai' ? 'Aussprache anhören (KI-Stimme)' : 'Aussprache anhören'}
    title={entry.s === 'ai' ? 'KI-Stimme – keine echte Aufnahme' : 'Aussprache anhören'}
  >
    <Icon name="speaker" size={Math.round(size * 0.5)} />
    {#if entry.s === 'ai'}<span class="ai">KI</span>{/if}
  </button>
{/if}

<style>
  .speak {
    position: relative;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--accent);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.08s ease;
  }
  .speak:active {
    transform: scale(0.94);
  }
  .speak.playing {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .ai {
    position: absolute;
    right: -6px;
    bottom: -4px;
    font-size: 0.6rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 6px;
    background: var(--hint);
    color: var(--bg);
  }
</style>
