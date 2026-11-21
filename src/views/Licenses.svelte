<script lang="ts">
  import { onMount } from 'svelte'
  import Header from '../components/Header.svelte'
  import { audio } from '../lib/audio.svelte'
  import { loadSources, type Sources } from '../lib/data'

  let sources = $state<Sources | null>(null)

  const llSpeakers = $derived.by(() => {
    const m = new Map<string, { name: string; license: string; count: number }>()
    for (const e of Object.values(audio.index?.words ?? {})) {
      if (e.s !== 'll' || !e.a) continue
      const k = `${e.a}|${e.l}`
      const cur = m.get(k) ?? { name: e.a, license: e.l ?? '', count: 0 }
      cur.count++
      m.set(k, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count)
  })
  const aiCount = $derived(Object.values(audio.index?.words ?? {}).filter((e) => e.s === 'ai').length)
  onMount(async () => {
    try {
      sources = await loadSources()
    } catch {
      /* optional */
    }
  })
</script>

<Header title="Quellen & Lizenzen" backTo="/einstellungen" />

<div class="page no-dock stack">
  <p>
    Zeichenweise ist ein privates Open-Source-Projekt. Der eigene Programmcode steht unter der <strong>MIT-Lizenz</strong>. Die
    verwendeten Daten und Bibliotheken haben eigene Lizenzen:
  </p>

  <section class="card">
    <h2>Wörterbuch: HanDeDict</h2>
    <p>
      Kollaborativ entwickeltes chinesisch-deutsches Wörterbuch, veröffentlicht von Gábor L. Ugray; ursprünglich erstellt mit
      Unterstützung der Chinesisch-Deutschen Gesellschaft e. V. Hamburg.
    </p>
    <p>
      Lizenz: <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.de" target="_blank" rel="noopener">CC BY-SA 3.0</a>
      (laut Datenkopf; die Projektbeschreibung nennt CC BY-SA 2.0).
      {#if sources}Datenstand {sources.handedictDate.slice(0, 10)}.{/if}
    </p>
    <p>
      Für die App gekürzt (ohne Beispielsätze und Wortart-Kürzel); für HSK-Wörter wurden Lesungen ausgewählt und Kurzbedeutungen
      von Hand überarbeitet. Diese bearbeiteten Daten stehen ebenfalls unter CC BY-SA.
    </p>
    <p><a href="https://github.com/gugray/HanDeDict" target="_blank" rel="noopener">github.com/gugray/HanDeDict</a></p>
  </section>

  <section class="card">
    <h2>Strichfolgen: Make Me a Hanzi / hanzi-writer-data</h2>
    <p>
      Die Strichdaten stammen aus dem Projekt Make Me a Hanzi und wurden aus Schriften von Arphic Technology gewonnen. Lizenz:
      <a href="strokes/ARPHICPL.TXT" target="_blank" rel="noopener">Arphic Public License</a>.
    </p>
    <p><a href="https://github.com/chanind/hanzi-writer-data" target="_blank" rel="noopener">github.com/chanind/hanzi-writer-data</a></p>
  </section>

  <section class="card">
    <h2>Aussprache</h2>
    <p>
      Die Aussprachen sind echte Aufnahmen – bis auf wenige Wörter, für die es keine freie Aufnahme gibt. Diese spricht eine
      KI-Stimme; sie sind an der Taste mit „KI“ gekennzeichnet.
    </p>
    <p>
      <strong>Yue Tan</strong> (Universität Caen, Shtooka-Projekt), © 2009, Lizenz
      <a href="https://creativecommons.org/licenses/by-sa/3.0/us/" target="_blank" rel="noopener">CC BY-SA 3.0 US</a>. In MP3
      umgewandelt vom Projekt
      <a href="https://github.com/hugolpz/audio-cmn" target="_blank" rel="noopener">audio-cmn</a>.
    </p>
    {#if llSpeakers.length}
      <p>
        Ergänzt durch Aufnahmen von <a href="https://lingualibre.org" target="_blank" rel="noopener">Lingua Libre</a> (Wikimedia
        Commons), MP3-Fassung von Commons:
      </p>
      <ul>
        {#each llSpeakers as sp (sp.name + sp.license)}
          <li>{sp.name} – {sp.license} ({sp.count} {sp.count === 1 ? 'Wort' : 'Wörter'})</li>
        {/each}
      </ul>
    {/if}
    {#if aiCount}
      <p>
        <strong>KI-Stimme</strong> ({aiCount} {aiCount === 1 ? 'Wort' : 'Wörter'}): synthetisch erzeugt mit
        <a href="https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh" target="_blank" rel="noopener">Kokoro v1.1-zh</a> (Hauptstimme
        zf_001, einzelne Wörter mit weiteren Stimmen des Modells), Lizenz <a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noopener">Apache 2.0</a>. Die
        chinesischen Trainingsdaten stellte die Firma LongMaoData frei zur Verfügung. Die Lesung jedes Wortes ist aus unserem Pinyin
        vorgegeben. Keine echte Aufnahme.
      </p>
    {/if}
    <p class="muted small">Die Zuordnung jeder Datei steht in <a href="audio/CREDITS.txt" target="_blank" rel="noopener">audio/CREDITS.txt</a>.</p>
  </section>

  <section class="card">
    <h2>HSK-Wortliste</h2>
    <p>
      HSK 3.0 (Prüfungsfassung 2026) aus „complete-hsk-vocabulary“ von Yanis Zafirópulos, MIT-Lizenz. Die Lesungen dort stammen
      ursprünglich aus CC-CEDICT (CC BY-SA 4.0); die englischen Bedeutungen werden nicht verwendet.
    </p>
    <p>
      Fehlende Wörter, zweite Lesungen und die Schreibweise der Töne sind mit der offiziellen HSK-Wortliste 2025/2026 (Chinese
      Testing International) abgeglichen und von Hand ergänzt; als Abschrift der Liste diente „HSK-3.0-words-list“ von krmanik.
    </p>
    <p>
      <a href="https://github.com/drkameleon/complete-hsk-vocabulary" target="_blank" rel="noopener"
        >github.com/drkameleon/complete-hsk-vocabulary</a
      >
    </p>
  </section>

  <section class="card">
    <h2>Software</h2>
    <ul>
      <li>Hanzi Writer – © David Chanin, MIT-Lizenz</li>
      <li>ts-fsrs (FSRS-Algorithmus) – © Open Spaced Repetition, MIT-Lizenz</li>
      <li>idb – © Jake Archibald, ISC-Lizenz</li>
      <li>Workbox (Offline-Modus) – © Google, MIT-Lizenz</li>
      <li>Svelte – MIT-Lizenz</li>
      <li>Vite (nur zum Bauen) – MIT-Lizenz</li>
    </ul>
  </section>

  <p class="muted small">
    Die vollständigen Lizenztexte stehen in der Datei LICENSES.md im Quellcode-Repository. Zeichenweise steht in keiner Verbindung
    zu den Herausgebern der HSK-Prüfung.
  </p>
</div>

<style>
  section h2 {
    margin-bottom: 8px;
  }
  section p {
    margin: 0 0 8px;
  }
  section p:last-child {
    margin-bottom: 0;
  }
  ul {
    margin: 0;
    padding-left: 20px;
  }
  .page > p {
    margin: 0;
  }
</style>
