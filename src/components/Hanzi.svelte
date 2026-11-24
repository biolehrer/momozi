<script lang="ts">
  // Zeichen eines Wortes; mit der Einstellung „Töne farbig“ jedes Zeichen in der Farbe seines Tons (wie Pleco).
  // Nur wenn Zeichen und Silben zusammenpassen. color={false}: ungefärbt – in Abfragen vor dem Aufdecken,
  // sonst würde die Farbe den gefragten Ton verraten.
  import { tonesOf } from '../lib/pinyin'
  import { app } from '../lib/state.svelte'

  let { s, n, color = true }: { s: string; n: string; color?: boolean } = $props()

  const chars = $derived([...s])
  const tones = $derived(n ? tonesOf(n) : [])
  const on = $derived(color && app.settings.toneColors && tones.length === chars.length)
</script>

{#if on}{#each chars as c, i (i)}<span class={tones[i] ? `tone${tones[i]}` : undefined}>{c}</span>{/each}{:else}{s}{/if}
