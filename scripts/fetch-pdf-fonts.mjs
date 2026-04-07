// Downloads the static TrueType fonts the PDF export embeds (PLAN 8.10). jsPDF can't read variable
// or WOFF2 fonts, so the PDF gets fixed weights of the same families: Source Sans 3 700 and 800
// for names and titles, Figtree 600 and 700 for everything else, and Noto Sans Gujarati 600.
// Run once with `node scripts/fetch-pdf-fonts.mjs`; the files are committed (all under the OFL).

import { writeFile } from 'node:fs/promises'

const WANT = [
  ['Source Sans 3', 700, 'source-sans-3-700.ttf'],
  ['Source Sans 3', 800, 'source-sans-3-800.ttf'],
  ['Figtree', 600, 'figtree-600.ttf'],
  ['Figtree', 700, 'figtree-700.ttf'],
  ['Noto Sans Gujarati', 600, 'noto-gujarati-600.ttf'],
]

for (const [family, weight, file] of WANT) {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}`, {
      headers: { 'User-Agent': 'Mozilla/4.0' }, // an old browser gets TrueType instead of WOFF2
    })
  ).text()
  const url = /url\((https:[^)]+\.ttf)\)/.exec(css)?.[1]
  if (!url) throw new Error(`No TrueType file for ${family} ${weight}`)
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
  await writeFile(new URL(`../src/features/export/fonts/${file}`, import.meta.url), buf)
  console.log(`${file}: ${(buf.length / 1024).toFixed(0)} KB`)
}
