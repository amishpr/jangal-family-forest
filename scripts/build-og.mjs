// Renders the link preview image (PLAN 10.3) from og/template.html with Playwright 1.48. A real
// browser draws the Gujarati in the wordmark correctly. The file name carries a short hash of the
// image, so chat apps that keep old previews fetch the new one. Writes public/og/jangal-og-<hash>.png
// and src/site/og.json (which the pages read). Run with `npm run og` after changing the design.

import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises'
import sharp from 'sharp'

const root = new URL('..', import.meta.url)
const gen = await readFile(new URL('src/ui/wordmark.gen.ts', root), 'utf8')
const viewBox = /viewBox: '([^']+)'/.exec(gen)[1]
const d = /d: '([^']+)'/.exec(gen)[1]
const [h, desc] = [/height: ([\d.]+)/.exec(gen)[1], /descent: ([\d.]+)/.exec(gen)[1]]
const wordmark = `<svg viewBox="${viewBox}" style="height:${h}em;vertical-align:-${desc}em" role="img" aria-label="Jangal (જંગલ)"><path d="${d}"/></svg>`
const leaf = (c) =>
  `<svg viewBox="0 0 64 64"><rect width="64" height="64" fill="color-mix(in srgb, ${c} 15%, #fdfffd)"/><g transform="rotate(38 32 34)"><path d="M32 47V57" stroke="${c}" stroke-width="2.8" stroke-linecap="round" fill="none"/><path fill="${c}" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z"/><path d="M32 46V19M32 40.5L37.6 35M32 40.5L26.4 35M32 32L36.4 27.6M32 32L27.6 27.6" stroke="color-mix(in srgb, ${c} 15%, #fdfffd)" stroke-width="2" stroke-linecap="round" fill="none"/></g></svg>`

let html = await readFile(new URL('og/template.html', root), 'utf8')
html = html.replace('<!--wordmark-->', wordmark).replace(/<!--leaf:(#[0-9A-Fa-f]{6})-->/g, (_, c) => leaf(c))
const page = new URL('og/rendered.html', root)
await writeFile(page, html)

const browser = await chromium.launch()
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await tab.goto(page.href)
await tab.evaluate(() => document.fonts.ready)
const shot = await tab.screenshot({ type: 'png' })
await browser.close()
await unlink(page)

// Palette PNG keeps it small, well under WhatsApp's 300 KB
const png = await sharp(shot).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer()
const hash = createHash('sha256').update(png).digest('hex').slice(0, 8)
const name = `jangal-og-${hash}.png`
const dir = new URL('public/og/', root)
await mkdir(dir, { recursive: true })
for (const f of await readdir(dir)) if (f.startsWith('jangal-og-') && f !== name) await unlink(new URL(f, dir))
await writeFile(new URL(name, dir), png)
await writeFile(new URL('src/site/og.json', root), JSON.stringify({ file: name }, null, 2) + '\n')
console.log(`public/og/${name}: ${(png.length / 1024).toFixed(0)} KB`)
