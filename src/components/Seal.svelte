<script lang="ts">
  // Siegel auf dem Abschluss-Bildschirm: rote Kachel wie das App-Logo, das Zeichen schreibt sich Strich für Strich
  // in Pinselschrift. Die Strichdaten von 好 und 休 sind fest eingebaut (je ~2 KB) – offline sofort da.
  import HanziWriter from 'hanzi-writer'
  import { onMount } from 'svelte'
  import hao from 'hanzi-writer-data/好.json'
  import xiu from 'hanzi-writer-data/休.json'
  import { reducedMotion } from '../lib/motion'

  let { char, size = 104 }: { char: '好' | '休'; size?: number } = $props()

  const DATA = { 好: hao, 休: xiu }
  let host: HTMLDivElement

  onMount(() => {
    const still = reducedMotion()
    const inner = Math.round(size * 0.86)
    const writer = HanziWriter.create(host, char, {
      width: inner,
      height: inner,
      padding: Math.round(inner * 0.06),
      showOutline: false,
      showCharacter: still,
      strokeColor: '#fffdf8',
      strokeAnimationSpeed: 2.4,
      delayBetweenStrokes: 70,
      renderer: 'svg',
      charDataLoader: (_c, onLoad) => onLoad(DATA[char] as Parameters<typeof onLoad>[0]),
    })
    // kurz warten, bis die Kachel aufgeploppt ist
    const timer = still ? 0 : window.setTimeout(() => void writer.animateCharacter(), 260)
    return () => {
      clearTimeout(timer)
      host.innerHTML = ''
    }
  })
</script>

<div class="seal" style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <div class="host" bind:this={host}></div>
</div>

<style>
  /* Farben wie das Logo (scripts/make-icons.mjs): Verlauf um die Akzentfarbe, warmer Schimmer oben links */
  .seal {
    position: relative;
    border-radius: 23%;
    background:
      radial-gradient(circle at 30% 20%, rgb(255 210 184 / 0.12), transparent 60%),
      linear-gradient(135deg, #c04a30, #ad3c27 50%, #8a2b1b);
    box-shadow: 0 10px 28px rgb(138 43 27 / 0.28);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: seal-pop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.3);
  }
  .host {
    filter: drop-shadow(0 2px 3px rgb(63 15 7 / 0.35));
  }
  @keyframes seal-pop {
    from {
      opacity: 0;
      transform: scale(0.8) rotate(-6deg);
    }
  }
</style>
