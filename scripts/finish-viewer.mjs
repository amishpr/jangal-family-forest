// Finishes the family page template (PLAN 8.10). Adds a Content Security Policy that allows the
// page's own inline scripts (by their hash) and data: images and fonts, and nothing else, so an
// exported page can't make a single network request. Then writes public/viewer-template.html.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const src = new URL('dist-viewer/viewer.html', root)
const out = new URL('public/viewer-template.html', root)

let html = await readFile(src, 'utf8')

// Every executable inline script, hashed exactly as it appears in the file
const hashes = []
for (const m of html.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) {
  hashes.push(`'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`)
}
if (!hashes.length) throw new Error('No inline scripts found in the viewer build')

const csp = [
  "default-src 'none'",
  `script-src ${hashes.join(' ')}`,
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

if (!html.includes('<!--jangal:csp-->')) throw new Error('The viewer template lost its CSP placeholder')
if (!html.includes('<script type="application/json" id="jangal-data">{}</script>')) throw new Error('The viewer template lost its data block')
html = html.replace('<!--jangal:csp-->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
await writeFile(out, html)
console.log(`Wrote public/viewer-template.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${hashes.length} scripts allowed by hash)`)
