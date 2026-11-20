<script lang="ts">
  // Wort selbst anlegen oder bearbeiten (nur eigene Decks)
  import Header from '../components/Header.svelte'
  import { displayPinyin, inputToNumeric, splitNumeric } from '../lib/pinyin'
  import { back, route } from '../lib/router.svelte'
  import { app, saveDeck } from '../lib/state.svelte'
  import { wordKey, type Word } from '../lib/types'

  const deckId = route.query.get('deck') ?? ''
  const editKey = route.query.get('k')
  const deck = app.decks.find((d) => d.id === deckId)
  const original = editKey ? deck?.words.find((w) => wordKey(w) === editKey) : undefined

  let chars = $state(original?.s ?? '')
  let pinyin = $state(original?.n ? displayPinyin(original.n) : '')
  let meaning = $state(original?.m ?? '')
  let error = $state('')

  const CJK_ONLY = /^[㐀-鿿豈-﫿]+$/

  const parsed = $derived(pinyin.trim() ? inputToNumeric(pinyin) : null)
  const charCount = $derived([...chars.trim()].length)
  const sylCount = $derived(parsed ? splitNumeric(parsed.numeric).length : 0)
  const warning = $derived.by(() => {
    if (!parsed || !charCount) return ''
    if (sylCount !== charCount) return `${sylCount} Silben, aber ${charCount} Zeichen – die Ton-Abfrage entfällt für dieses Wort.`
    if (!parsed.hasTones) return 'Ohne Töne – die Ton-Abfrage entfällt für dieses Wort.'
    return ''
  })

  async function save(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    if (!deck) return
    const s = chars.trim()
    if (!CJK_ONLY.test(s)) {
      error = 'Bitte nur chinesische Schriftzeichen eingeben.'
      return
    }
    if (!meaning.trim()) {
      error = 'Bitte eine Bedeutung angeben.'
      return
    }
    const w: Word = { s, n: parsed?.numeric ?? '', m: meaning.trim() }
    if (parsed && !parsed.hasTones) w.noTones = true
    if (original?.x) w.x = original.x
    const key = wordKey(w)
    const others = deck.words.filter((x) => wordKey(x) !== editKey)
    if (others.some((x) => wordKey(x) === key)) {
      error = 'Dieses Wort ist schon im Deck.'
      return
    }
    const words = editKey ? deck.words.map((x) => (wordKey(x) === editKey ? w : x)) : [...deck.words, w]
    await saveDeck({ ...deck, words })
    back(`/deck?id=${deckId}`)
  }
</script>

<Header title={original ? 'Wort bearbeiten' : 'Wort anlegen'} backTo={`/deck?id=${deckId}`} />

<div class="page no-dock">
  {#if !deck}
    <p>Deck nicht gefunden.</p>
  {:else}
    <form class="stack" onsubmit={save}>
      <p class="muted small">Neues Wort für „{deck.name}“.</p>
      <div class="field">
        <label for="f-chars">Schriftzeichen (vereinfacht)</label>
        <input id="f-chars" class="input zh big" lang="zh-Hans" bind:value={chars} maxlength="12" autocomplete="off" required />
      </div>
      <div class="field">
        <label for="f-pinyin">Pinyin <span class="muted small">(optional)</span></label>
        <input
          id="f-pinyin"
          class="input"
          bind:value={pinyin}
          placeholder="nǐ hǎo oder ni3 hao3"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
        />
        {#if parsed && sylCount}
          <span class="small muted">Vorschau: {displayPinyin(parsed.numeric)}</span>
        {/if}
        {#if warning}<span class="small warn">{warning}</span>{/if}
        <span class="small muted">Silben mit Leerzeichen trennen, Töne als Zahl (1–4, 5 = neutral) oder Tonzeichen.</span>
      </div>
      <div class="field">
        <label for="f-meaning">Deutsche Bedeutung</label>
        <input id="f-meaning" class="input" bind:value={meaning} maxlength="80" placeholder="z. B. Hallo; Guten Tag" required />
      </div>
      {#if error}<p class="error">{error}</p>{/if}
      {#if original && editKey && wordKey({ s: chars.trim(), n: parsed?.numeric ?? '', m: '' }) !== editKey}
        <p class="small muted">Hinweis: Wenn Zeichen oder Pinyin geändert werden, beginnt der Lernfortschritt für dieses Wort neu.</p>
      {/if}
      <button type="submit" class="btn primary block">Speichern</button>
    </form>
  {/if}
</div>

<style>
  .big {
    font-size: 1.6rem;
  }
  .warn {
    color: var(--hint);
  }
  .error {
    color: var(--bad);
    margin: 0;
  }
</style>
