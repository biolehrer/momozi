// Erzeugt die App-Symbole aus den Strichdaten von 墨 (hanzi-writer-data, Arphic PL – Kai-Schrift, wie mit dem Pinsel).
// public/icons/icon.svg ist zugleich das Logo in der App (Components/Logo.svelte), damit es überall gleich aussieht.
// Auf dem Mac entstehen die PNG-Fassungen gleich mit: Quick Look (qlmanage) rendert das SVG, sips skaliert.
//   node scripts/make-icons.mjs            -> public/icons/
//   ICON_OUT=ordner node scripts/make-icons.mjs   (zum Ausprobieren)
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.resolve(process.env.ICON_OUT ?? path.join(ROOT, 'public', 'icons'))
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'hanzi-writer-data', '墨.json'), 'utf8'))

// Grund: um die Akzentfarbe #b8432c herum, ein Hauch dunkler, mit leichtem Verlauf von oben links nach unten rechts –
// so setzt sich das cremeweiße Zeichen überall kräftig ab (Kontrast oben links ≈ 5 : 1, in der Mitte ≈ 6 : 1).
const BG = ['#c04a30', '#ad3c27', '#8a2b1b']
// Zeichen: oben Cremeweiß, unten etwas wärmer (wie Papier)
const INK = ['#fffdf8', '#f2e0c6']

// Umriss der Glyphe (Glyphen-Koordinaten, y nach oben): x 97..937, y -41..836 -> Mitte
const CX = 517
const CY = 397.5

const PATHS = data.strokes.map((d) => `<path d="${d.replace(/ ?([MQLCZ]) ?/g, '$1')}"/>`).join('')

/**
 * rounded: abgerundete Ecken (Browser, Android „any“, Logo in der App); iOS und Android-„maskable“ runden selbst.
 * scale: Größe der Glyphe; 0.88 füllt das Symbol, „maskable“ braucht Rand für die runde Maske (sichere Zone 80 %).
 * rich: Papierkörnung und weicher Schatten als SVG-Filter – nur für die PNG-Vorlagen. Safari berechnet Filter in
 *   <img>-SVGs nur in einfacher Auflösung und vergrößert sie dann (WebKit-Fehler), das Logo wirkte dort verpixelt.
 *   Ohne „rich“: keine Filter, der Schatten entsteht aus drei versetzten, durchscheinenden Kopien des Zeichens.
 */
function svg({ rounded, scale, rich }) {
  const s = scale
  const tx = (512 - CX * s).toFixed(1)
  const ty = 508 + CY * s // 4 Einheiten über der Mitte: optisch mittig mit dem Schatten darunter
  const at = (dy = 0) => `translate(${tx} ${(ty + dy).toFixed(1)}) scale(${s} -${s})`
  const defs = [
    rounded ? '<clipPath id="r"><rect width="1024" height="1024" rx="224"/></clipPath>' : '',
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BG[0]}"/><stop offset=".5" stop-color="${BG[1]}"/><stop offset="1" stop-color="${BG[2]}"/></linearGradient>`,
    // warmer Schimmer oben links statt weißem Licht (das ließ das Rot milchig wirken)
    '<radialGradient id="glow" cx=".3" cy=".2" r=".75"><stop offset="0" stop-color="#ffd2b8" stop-opacity=".1"/><stop offset="1" stop-color="#ffd2b8" stop-opacity="0"/></radialGradient>',
    `<linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="0" y1="836" x2="0" y2="-41"><stop offset="0" stop-color="${INK[0]}"/><stop offset="1" stop-color="${INK[1]}"/></linearGradient>`,
    rich
      ? // feine Papierkörnung, nur in großen Darstellungen sichtbar
        '<filter id="grain" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer></filter>' +
        '<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#3f0f07" flood-opacity=".4"/></filter>'
      : '',
    `<g id="m">${PATHS}</g>`,
  ].join('')
  let ground = '<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#glow)"/>'
  if (rich) ground += '<rect width="1024" height="1024" filter="url(#grain)" opacity=".1" style="mix-blend-mode:overlay"/>'
  const glyph = rich
    ? `<g filter="url(#shadow)"><use href="#m" transform="${at()}" fill="url(#ink)"/></g>`
    : [
        [6, 0.1],
        [12, 0.08],
        [18, 0.05],
      ]
        .map(([dy, o]) => `<use href="#m" transform="${at(dy)}" fill="#3f0f07" opacity="${o}"/>`)
        .join('') + `<use href="#m" transform="${at()}" fill="url(#ink)"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${defs}</defs>` +
    (rounded ? `<g clip-path="url(#r)">${ground}</g>` : ground) +
    `${glyph}</svg>\n`
  )
}

// Für den Browser (Logo in der App, Browser-Tab, Manifest): ohne Filter, damit es überall scharf ist
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg({ rounded: true, scale: 0.88 }))
console.log(`icon.svg geschrieben nach ${path.relative(ROOT, OUT) || OUT}`)

// PNG-Fassungen (nur Mac) aus den Vorlagen mit Körnung und Schatten – groß gerendert, dann verkleinert
if (process.platform === 'darwin') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'momozi-icons-'))
  const png = (name, options, target, size) => {
    const src = path.join(tmp, `${name}.svg`)
    fs.writeFileSync(src, svg({ ...options, rich: true }))
    execFileSync('qlmanage', ['-t', '-s', '1024', '-o', tmp, src], { stdio: 'ignore' })
    execFileSync('sips', ['-z', String(size), String(size), `${src}.png`, '--out', path.join(OUT, target)], { stdio: 'ignore' })
  }
  const rounded = { rounded: true, scale: 0.88 }
  png('rounded', rounded, 'icon-512.png', 512)
  png('rounded', rounded, 'icon-192.png', 192)
  png('full', { rounded: false, scale: 0.88 }, 'apple-touch-icon.png', 180) // iOS rundet selbst
  png('maskable', { rounded: false, scale: 0.7 }, 'icon-maskable-512.png', 512) // Android schneidet rund zu
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('PNG-Symbole erzeugt (qlmanage + sips)')
} else {
  console.log('PNG-Symbole bitte auf dem Mac erzeugen (qlmanage + sips)')
}
