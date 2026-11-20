<script lang="ts">
  // Abfragen „Pinyin“ und „Bedeutung“: Zeichen sehen, Antwort erinnern, aufdecken, selbst bewerten.
  import { displayPinyin } from '../lib/pinyin'
  import type { Word } from '../lib/types'

  let { word, type, onrate }: { word: Word; type: 'pinyin' | 'meaning'; onrate: (grade: 1 | 3) => void } = $props()

  let shown = $state(false)
  const size = $derived([...word.s].length > 3 ? 'm' : 'l')
</script>

<div class="quiz fade-in">
  <p class="label">{type === 'pinyin' ? 'Wie spricht man das aus?' : 'Was bedeutet das?'}</p>
  <div class="chars zh {size}" lang="zh-Hans">{word.s}</div>

  <div class="answer" class:shown>
    {#if shown}
      {#if type === 'pinyin'}
        <div class="main">{displayPinyin(word.n)}</div>
        <div class="sub">{word.m}</div>
      {:else}
        <div class="main">{word.m}</div>
        {#if word.n}<div class="sub">{displayPinyin(word.n)}</div>{/if}
      {/if}
    {:else}
      <div class="placeholder">Antwort im Kopf überlegen …</div>
    {/if}
  </div>
</div>

<div class="dock bottom">
  <div class="dock-inner">
    {#if !shown}
      <button class="btn primary" onclick={() => (shown = true)}>Aufdecken</button>
    {:else}
      <button class="btn bad" onclick={() => onrate(1)}>Nochmal</button>
      <button class="btn good" onclick={() => onrate(3)}>Gewusst</button>
    {/if}
  </div>
</div>

<style>
  .quiz {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    text-align: center;
    padding-top: 12px;
  }
  .label {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .chars {
    line-height: 1.15;
    word-break: break-all;
  }
  .chars.l {
    font-size: clamp(4.5rem, 24vw, 7rem);
  }
  .chars.m {
    font-size: clamp(3rem, 15vw, 4.5rem);
  }
  .answer {
    min-height: 120px;
    width: 100%;
    border-radius: var(--radius);
    border: 1.5px dashed var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    gap: 6px;
  }
  .answer.shown {
    border-style: solid;
    background: var(--surface);
  }
  .main {
    font-size: 1.6rem;
    font-weight: 650;
  }
  .sub {
    color: var(--muted);
  }
  .placeholder {
    color: var(--muted);
  }
</style>
