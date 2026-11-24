<script lang="ts">
  // Zahl, die kurz vom alten zum neuen Wert zählt (mit Abbremsen am Ende); bei „Bewegung reduzieren“ sofort.
  import { untrack } from 'svelte'
  import { reducedMotion } from '../lib/motion'

  let {
    value,
    from,
    duration = 700,
    delay = 0,
  }: {
    value: number
    /** Startwert beim ersten Anzeigen (sonst steht die Zahl gleich da) */
    from?: number
    duration?: number
    delay?: number
  } = $props()

  let shown = $state(untrack(() => from ?? value))

  $effect(() => {
    const to = value
    const start = untrack(() => shown)
    if (start === to || reducedMotion()) {
      shown = to
      return
    }
    let raf = 0
    const timer = window.setTimeout(() => {
      let t0 = 0
      const step = (t: number) => {
        t0 ||= t
        const p = Math.min(1, (t - t0) / duration)
        shown = Math.round(start + (to - start) * (1 - Math.pow(1 - p, 3)))
        if (p < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  })
</script>

{shown}
