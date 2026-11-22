// Erzeugt die App-Symbole als SVG aus den Strichdaten von 墨 (hanzi-writer-data, Arphic PL).
// PNG-Versionen werden daraus einmalig gerendert (siehe README) und liegen in public/icons/.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public', 'icons')
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'hanzi-writer-data', '墨.json'), 'utf8'))

const BG = '#b8432c'
const FG = '#fffcf5'

function svg({ rounded, scale }) {
  // Glyphen-Koordinaten: x 0..1024, y -124..900 (y nach oben) -> zentriert in 1024er Kasten
  const t = 512 - 512 * scale
  const ty = 512 + 388 * scale
  const rect = rounded
    ? `<rect width="1024" height="1024" rx="224" fill="${BG}"/>`
    : `<rect width="1024" height="1024" fill="${BG}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${rect}<g transform="translate(${t.toFixed(1)} ${ty.toFixed(1)}) scale(${scale} -${scale})" fill="${FG}">${data.strokes
    .map((d) => `<path d="${d}"/>`)
    .join('')}</g></svg>\n`
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg({ rounded: true, scale: 0.74 }))
fs.writeFileSync(path.join(OUT, 'icon-full.svg'), svg({ rounded: false, scale: 0.7 }))
fs.writeFileSync(path.join(OUT, 'icon-maskable.svg'), svg({ rounded: false, scale: 0.56 }))
console.log('SVG-Symbole geschrieben nach public/icons/')
