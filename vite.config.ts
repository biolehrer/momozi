import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'node:fs'
import path from 'node:path'

const STROKE_DIR = path.resolve('node_modules/hanzi-writer-data')

/** Dateiname einer Strichdaten-Datei: Unicode-Codepunkt in Hex, z. B. 我 -> 6211.json */
function strokeFileName(ch: string): string {
  return ch.codePointAt(0)!.toString(16) + '.json'
}

/**
 * Stellt die Strichdaten aus hanzi-writer-data unter ./strokes/<hex>.json bereit:
 * im Entwicklungsserver direkt aus node_modules, beim Build als Kopie in dist/strokes.
 * So liegen alle Daten auf der eigenen Seite (kein fremdes CDN) und werden nur bei Bedarf geladen.
 */
function strokes(): Plugin {
  return {
    name: 'zeichenweise-strokes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/strokes\/([0-9a-f]+)\.json(?:\?.*)?$/)
        if (!m) return next()
        const ch = String.fromCodePoint(parseInt(m[1], 16))
        const file = path.join(STROKE_DIR, `${ch}.json`)
        if (!fs.existsSync(file)) {
          res.statusCode = 404
          return res.end()
        }
        res.setHeader('Content-Type', 'application/json')
        fs.createReadStream(file).pipe(res)
      })
    },
    writeBundle(options) {
      const out = path.join(options.dir ?? 'dist', 'strokes')
      fs.mkdirSync(out, { recursive: true })
      let count = 0
      for (const f of fs.readdirSync(STROKE_DIR)) {
        if (!f.endsWith('.json') || f === 'package.json') continue
        const ch = f.slice(0, -5)
        if ([...ch].length !== 1) continue
        fs.copyFileSync(path.join(STROKE_DIR, f), path.join(out, strokeFileName(ch)))
        count++
      }
      fs.copyFileSync(path.join(STROKE_DIR, 'ARPHICPL.TXT'), path.join(out, 'ARPHICPL.TXT'))
      this.info(`${count} Strichdaten-Dateien kopiert`)
    },
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  // relative Pfade: funktioniert unter https://<name>.github.io/<repo>/ unabhängig vom Repo-Namen
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [svelte(), strokes()],
  server: { host: true },
})
