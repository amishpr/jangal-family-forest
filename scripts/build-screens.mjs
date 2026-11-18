// The README and WALKTHROUGH screenshots (TODO.md LP-3), in light and dark; the docs show the
// light ones, and the dark ones are kept alongside. The hero is the sample family with the path
// from Ranbir to his cousin Kareena lit and the answer showing; the rest show one feature each.
// Serves the production build (run `npm run build` first), captures it with
// Playwright 1.48, and writes docs/*.png. Run with `npm run screens`; the files are committed.

import { chromium } from 'playwright'
import { preview } from 'vite'
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const server = await preview({ root: root.pathname, preview: { port: 5197, strictPort: true, open: false } })
const base = 'http://localhost:5197'
const browser = await chromium.launch()

const dock = (page, label) => page.locator('.dock button', { hasText: label }).click()
const tile = (page, id) => page.locator(`.tile[data-id="${id}"]`)

// Each shot: [light file, dark file, what to do once the sample is showing]
const shots = [
  ['screenshot-light.png', 'screenshot.png', async (page) => {
    await dock(page, 'Relate')
    const pick = page.getByLabel('Search the family')
    await pick.waitFor()
    await pick.fill('kareena')
    await pick.press('Enter')
    await page.locator('.answer').waitFor()
    // Kareena's branch opens for the path, and her photo follows once the browser is idle
    await tile(page, 'kareena').locator('.pic img').waitFor()
    await page.mouse.move(5, 500)
  }],
  ['hover-light.png', 'hover-dark.png', async (page) => {
    await tile(page, 'rishi').hover()
  }],
  ['card-light.png', 'card-dark.png', async (page) => {
    await tile(page, 'ranbir').click()
    await page.locator('.pop').waitFor()
    await page.mouse.move(5, 500)
  }],
  ['trait-light.png', 'trait-dark.png', async (page) => {
    await page.keyboard.press('/')
    await page.locator('.trait-find .trait-chip', { hasText: 'Actor' }).click()
    await page.locator('.trait-bar').waitFor()
    await page.mouse.move(5, 500)
  }],
  ['timeline-light.png', 'timeline-dark.png', async (page) => {
    await page.keyboard.press('2')
  }],
  ['fan-light.png', 'fan-dark.png', async (page) => {
    await page.keyboard.press('3')
  }],
  ['birthdays-light.png', 'birthdays-dark.png', async (page) => {
    await dock(page, 'Birthdays')
  }],
  ['titles-light.png', 'titles-dark.png', async (page) => {
    await page.getByRole('button', { name: 'Family titles' }).click()
    await page.locator('.sheet label', { hasText: 'Gujarati' }).click()
  }],
  ['share-light.png', 'share-dark.png', async (page) => {
    await dock(page, 'Share')
  }],
]

for (const [light, dark, setup] of shots) {
  for (const [scheme, file] of [['light', light], ['dark', dark]]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' })
    // The site is light unless dark was picked
    await page.addInitScript((t) => localStorage.setItem('jangal:theme', t), scheme)
    await page.goto(`${base}/?sample`)
    await tile(page, 'ranbir').waitFor()
    // The sample's photos load after the tree shows: the 13 faces in the first view (TODO.md F17)
    // (a locator, not waitForFunction, which the app's Content Security Policy blocks)
    await page.locator('.tile .pic img').nth(12).waitFor()
    await setup(page)
    await page.waitForTimeout(1200)
    // No toasts or hover tips in the picture
    await page.addStyleTag({ content: '.toast,.tip{display:none!important}' })
    const shot = await page.screenshot({ type: 'png' })
    await writeFile(new URL(`docs/${file}`, root), await sharp(shot).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer())
    console.log(`docs/${file}`)
    await page.close()
  }
}
await browser.close()
await server.close()
