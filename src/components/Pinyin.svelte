<script lang="ts">
  // Pinyin mit Tonzeichen; mit der Einstellung „Töne farbig“ jede Silbe in ihrer Tonfarbe (wie Pleco).
  // color={false}: ungefärbt, z. B. solange eine Abfrage den Ton noch nicht aufgedeckt hat.
  import { displayPinyin, markedSyllables, tonesOf } from '../lib/pinyin'
  import { app } from '../lib/state.svelte'

  let { n, color = true }: { n: string; color?: boolean } = $props()

  /** Silben mit Ton; Erhua-„r“ hängt an der Silbe davor (wie in displayPinyin) */
  const parts = $derived.by(() => {
    const syls = markedSyllables(n)
    const tones = tonesOf(n)
    const out: { text: string; tone: number | null }[] = []
    syls.forEach((text, i) => {
      if (tones[i] === null && out.length) out[out.length - 1].text += 'r'
      else out.push({ text, tone: tones[i] })
    })
    return out
  })
</script>

{#if color && app.settings.toneColors && n}{#each parts as p, i (i)}{#if i}{' '}{/if}<span class={p.tone ? `tone${p.tone}` : undefined}
      >{p.text}</span
    >{/each}{:else}{n ? displayPinyin(n) : ''}{/if}
