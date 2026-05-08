// The README screenshots (TODO.md LP-3), in light and dark: the sample family with the path from
// Ranbir to his cousin Kareena lit and the answer showing. Serves the production build (run
// `npm run build` first), captures it with Playwright 1.48, and writes docs/screenshot-light.png
// and docs/screenshot.png. Run with `npm run screens`; the files are committed.

import { chromium } from 'playwright'
import { preview } from 'vite'
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const server = await preview({ root: root.pathname, preview: { port: 5197, strictPort: true, open: false } })
const base = 'http://localhost:5197'
const browser = await chromium.launch()

for (const [scheme, file] of [['light', 'screenshot-light.png'], ['dark', 'screenshot.png']]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' })
  await page.goto(`${base}/?sample`)
  await page.locator('.tile[data-id="ranbir"]').waitFor()
  // The sample's photos load after the tree shows: the 13 faces in the first view (TODO.md F17)
  // (a locator, not waitForFunction, which the app's Content Security Policy blocks)
  await page.locator('.tile .pic img').nth(12).waitFor()
  await page.locator('.dock button', { hasText: 'Relate' }).click()
  const pick = page.getByLabel('Search the family')
  await pick.waitFor()
  await pick.fill('kareena')
  await pick.press('Enter')
  await page.locator('.answer').waitFor()
  // Kareena's branch opens for the path, and her photo follows once the browser is idle
  await page.locator('.tile[data-id="kareena"] .pic img').waitFor()
  await page.mouse.move(5, 500)
  await page.waitForTimeout(1200)
  // No toasts or hover tips in the picture
  await page.addStyleTag({ content: '.toast,.tip{display:none!important}' })
  const shot = await page.screenshot({ type: 'png' })
  await writeFile(new URL(`docs/${file}`, root), await sharp(shot).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer())
  console.log(`docs/${file}`)
  await page.close()
}
await browser.close()
await server.close()
