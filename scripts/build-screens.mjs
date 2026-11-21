// The README and WALKTHROUGH screenshots (TODO.md LP-3), in light and dark; the docs show the
// light ones, and the dark ones are kept alongside. The hero is the sample family with the path
// from Ranbir to his cousin Kareena lit and the answer showing; the rest show one feature each.
// Serves the production build (run `npm run build` first), captures it with
// Playwright 1.48, and writes docs/*.png. Run with `npm run screens`; the files are committed.
// `npm run screens -- fan ask` makes only the shots whose file names start with those words.

import { chromium } from 'playwright'
import { preview } from 'vite'
import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const server = await preview({ root: root.pathname, preview: { port: 5197, strictPort: true, open: false } })
const base = 'http://localhost:5197'
const browser = await chromium.launch()

const dock = (page, label) => page.locator('.dock button', { hasText: label }).click()
const tile = (page, id) => page.locator(`.tile[data-id="${id}"]`)

/** Kareena's fill-in link, made from her card */
async function askKareena(page) {
  await page.keyboard.press('/')
  await page.locator('.find-in').fill('kareena')
  await page.locator('.res').first().waitFor()
  await page.locator('.find-in').press('Enter')
  await page.waitForTimeout(900)
  await tile(page, 'kareena').click()
  await page.locator('.pop').getByRole('button', { name: 'Make a link' }).click()
  const msg = page.locator('.ask-sheet .ask-msg')
  await msg.waitFor()
  return (await msg.textContent()).match(/https?:\/\/\S+/)[0]
}

/** What Kareena types on the fill-in page: her birthplace's new name, where she lives, and her son */
async function fillIn(page) {
  const me = page.getByRole('region', { name: 'You', exact: true })
  await me.getByLabel('Born in').fill('Mumbai, India')
  await me.getByLabel('Lives in').fill('Mumbai')
  const saif = page.getByRole('region', { name: /You and Saif/ })
  await saif.getByRole('button', { name: 'Add a child' }).click()
  const kid = saif.locator('.add-kid').last()
  await kid.getByLabel('First name').fill('Taimur')
  await kid.getByLabel('Last name').fill('Ali Khan')
  await kid.getByLabel('Birthday: year').fill('2016')
}

// Each shot: [light file, dark file (none for paper, which always prints light), what to do once
// the sample is showing, and any page options that differ]
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
  ['ask-light.png', 'ask-dark.png', async (page) => {
    await askKareena(page)
    // The link as it reads on the real site, not this preview's localhost
    await page.locator('.ask-msg').evaluate((el, b) => (el.textContent = el.textContent.replace(b, 'https://www.jangaltree.com')), base)
    await page.mouse.move(5, 500)
  }],
  // The fill-in page on a phone, with Kareena's photo picked
  ['fill-in-light.png', 'fill-in-dark.png', async (page) => {
    const link = await askKareena(page)
    await page.setViewportSize({ width: 390, height: 640 })
    await page.goto(link)
    const me = page.getByRole('region', { name: 'You', exact: true })
    await me.getByLabel('Born in').fill('Mumbai, India')
    await me.getByLabel('Add your photo').setInputFiles(new URL('public/sample/kareena.webp', root).pathname)
    await page.getByRole('dialog', { name: 'Your photo' }).getByRole('button', { name: 'Use this photo' }).click()
    await me.locator('.add-face img').waitFor()
    await page.evaluate(() => scrollTo(0, 0))
  }, { deviceScaleFactor: 2 }],
  // Kareena's reply back in the app, in the review before it's combined
  ['reply-light.png', 'reply-dark.png', async (page) => {
    const link = await askKareena(page)
    const relative = await browser.newPage()
    // No share sheet, so Send downloads the reply
    await relative.addInitScript(() => {
      delete Navigator.prototype.share
      delete Navigator.prototype.canShare
    })
    await relative.goto(link)
    await fillIn(relative)
    const [download] = await Promise.all([relative.waitForEvent('download'), relative.getByRole('button', { name: 'Send to Ranbir' }).click()])
    const file = join(tmpdir(), download.suggestedFilename())
    await download.saveAs(file)
    await relative.close()
    await page.keyboard.press('Escape')
    await dock(page, 'Share')
    await page.getByRole('button', { name: 'Import a file' }).click()
    await page.locator('.sheet input[type=file]').setInputFiles(file)
    await page.locator('.report.merge').waitFor()
    await page.mouse.move(5, 500)
  }],
  // The Fan chart as it prints, on a page the size of Letter paper
  ['print-fan-light.png', null, async (page) => {
    await page.keyboard.press('3')
    await page.locator('.fan-svg').waitFor()
    await page.emulateMedia({ media: 'print' })
    // The print window's margins, and an edge so the page shows on white
    await page.addStyleTag({ content: 'body { padding: 0.4in } html { outline: 1px solid #d0d7de; outline-offset: -1px }' })
  }, { viewport: { width: 816, height: 1056 } }],
]

const only = process.argv.slice(2)
for (const [light, dark, setup, options] of shots.filter(([light]) => !only.length || only.some((w) => light.startsWith(w)))) {
  for (const [scheme, file] of [['light', light], ['dark', dark]]) {
    if (!file) continue
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce', ...options })
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
