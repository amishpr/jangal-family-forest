// The README and WALKTHROUGH screenshots (TODO.md LP-3), in light and dark; the docs show the
// light ones, and the dark ones are kept alongside. The hero is the sample family with the path
// from Ranbir to his cousin Kareena lit and the answer showing; the rest show one feature each.
// Serves the production build (run `npm run build` first), captures it with
// Playwright 1.48, and writes docs/*.png. Run with `npm run screens`; the files are committed.
// `npm run screens -- fan ask` makes only the shots whose file names start with those words.

import { chromium } from 'playwright'
import { preview } from 'vite'
import sharp from 'sharp'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const server = await preview({ root: root.pathname, preview: { port: 5197, strictPort: true, open: false } })
const base = 'http://localhost:5197'
const browser = await chromium.launch()

const dock = (page, label) => page.locator('.dock button', { hasText: label }).click()
const tile = (page, id) => page.locator(`.tile[data-id="${id}"]`)

/** Finds someone, flies to them, and opens their card */
async function openCard(page, query, id) {
  await page.keyboard.press('/')
  await page.locator('.find-in').fill(query)
  await page.locator('.res').first().waitFor()
  await page.locator('.find-in').press('Enter')
  await page.waitForTimeout(900)
  await tile(page, id).click()
  await page.locator('.pop').waitFor()
}

/** Kareena's fill-in link, made from her card */
async function askKareena(page) {
  await openCard(page, 'kareena', 'kareena')
  await page.locator('.pop').getByRole('button', { name: 'Make a link' }).click()
  // The link is deflated a moment after the sheet opens
  const msg = page.locator('.ask-sheet .ask-msg', { hasText: '/add/#' })
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

// ---- The wireflows in WALKTHROUGH.md: each step's screen, captured as the flow really runs, then
// laid out by scripts/wireflow.html. Light only, like the screenshots the docs show.

/** A light page at twice the pixels, so the small pictures stay sharp */
async function lightPage(viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('jangal:theme', 'light'))
  return page
}

const quiet = (page) => page.addStyleTag({ content: '.toast,.tip{display:none!important}' })

/** A picture of the part of the page these locators cover, with room around them */
async function around(page, locators, pad = 28) {
  const b = await Promise.all(locators.map((l) => l.boundingBox()))
  const x = Math.max(0, Math.min(...b.map((r) => r.x)) - pad)
  const y = Math.max(0, Math.min(...b.map((r) => r.y)) - pad)
  const right = Math.max(...b.map((r) => r.x + r.width)) + pad
  const bottom = Math.max(...b.map((r) => r.y + r.height)) + pad
  return page.screenshot({ clip: { x, y, width: right - x, height: bottom - y } })
}

/** Hovers a tile until its + button shows, then presses it (the camera can move the tile) */
async function sproutOn(t, type) {
  for (let i = 0; i < 20; i++) {
    await t.hover()
    try {
      return await t.locator(`.sprout[data-add="${type}"]`).click({ timeout: 1500 })
    } catch {
      // Not showing yet
    }
  }
  throw new Error(`No + ${type} button`)
}

/** Lays one flow out with the template, and writes it to docs/ */
async function drawFlow(file, flow) {
  const data = { ...flow, steps: flow.steps.map((s) => ({ ...s, img: `data:image/png;base64,${s.img.toString('base64')}` })) }
  const html = (await readFile(new URL('scripts/wireflow.html', root), 'utf8')).replace('/*FLOW*/', `window.FLOW = ${JSON.stringify(data)}`)
  // Next to the template, so its font paths still work
  const tmp = new URL('scripts/wireflow.rendered.html', root)
  await writeFile(tmp, html)
  const page = await browser.newPage({ viewport: { width: 2000, height: 1600 }, deviceScaleFactor: 1.5 })
  await page.goto(tmp.href)
  await page.locator('body[data-ready]').waitFor({ state: 'attached' })
  const shot = await page.locator('main').screenshot()
  await page.close()
  await unlink(tmp)
  await writeFile(new URL(`docs/${file}`, root), await sharp(shot).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer())
  console.log(`docs/${file}`)
}

/** Starting a tree and building it out, from the start page to a card */
async function treeFlow() {
  const page = await lightPage()
  await page.goto(`${base}/`)
  const start = page.getByRole('button', { name: /Start with you/ })
  await start.waitFor()
  await quiet(page)
  const s1 = await around(page, [page.locator('.empty-title'), start, page.getByRole('button', { name: 'Explore a sample family' })], 36)

  await start.click()
  const card = page.locator('.quick-card')
  await page.locator('.nm-in').fill('Asha Patel')
  await card.locator('label', { hasText: 'Woman' }).click()
  await card.getByLabel('Your birthday: year').fill('1990')
  const s2 = await around(page, [card])
  await page.keyboard.press('Enter')

  const me = page.locator('.tile.home')
  await me.waitFor()
  await page.waitForTimeout(700)
  await me.hover()
  await me.locator('.sprout[data-add="parent"]').waitFor()
  const s3 = await around(page, [me, ...(await me.locator('.sprout').all())], 40)

  const person = (name) => page.locator('.tile', { hasText: name })
  /** Adds someone with quick add, and returns the picture of the card before it's saved */
  const add = async (from, type, name, gender, year) => {
    await sproutOn(from, type)
    await page.locator('.nm-in').fill(name)
    if (gender) await card.locator('label', { hasText: new RegExp(`^${gender}$`) }).click()
    await card.getByLabel(/Birthday: year/).fill(year)
    const shot = await around(page, [card])
    await page.keyboard.press('Enter')
    await person(name).waitFor()
    await page.waitForTimeout(500)
    return shot
  }
  const s4 = await add(me, 'parent', 'Kiran Patel', 'Man', '1960')
  await add(me, 'parent', 'Meera Patel', '', '1963')
  await add(me, 'sibling', 'Rohan Patel', 'Man', '1993')
  await add(person('Kiran Patel'), 'parent', 'Hari Patel', 'Man', '1932')
  await add(person('Kiran Patel'), 'parent', 'Lata Patel', '', '1936')
  await page.keyboard.press('f')
  await page.mouse.move(5, 500)
  await page.waitForTimeout(1200)
  const s5 = await around(page, await page.locator('.tile').all(), 40)

  await person('Kiran Patel').click()
  await page.locator('.pop').waitFor()
  await page.waitForTimeout(500)
  const s6 = await page.locator('.pop').screenshot()
  await page.close()

  await drawFlow('wireflow-tree.png', {
    title: 'Starting a tree and building it out',
    sub: 'Everything happens on the tree itself, one quick card at a time',
    cols: 3,
    colWidth: 400,
    gap: [64, 72],
    shotHeight: 300,
    steps: [
      { row: 1, col: 1, title: 'Start with you', text: 'The start page. Or import a file, or explore the sample family.', img: s1 },
      { row: 1, col: 2, title: 'Name yourself', text: 'A quick card opens in your tile: name, gender, birthday.', img: s2 },
      { row: 1, col: 3, title: 'Add relatives where you look', text: 'Hover any tile for its + buttons: parent, partner, child, sibling.', img: s3 },
      { row: 2, col: 3, title: 'Quick add', text: "One card, one step. A second parent's gender is guessed.", img: s4 },
      { row: 2, col: 2, title: 'The tree grows', text: 'Every tile says how they are related to you, and the title comes from the surname.', img: s5 },
      { row: 2, col: 1, title: 'Open a card', text: 'Dates, places, and the family as links. Edit adds a photo, notes and traits.', img: s6, crop: 'top' },
    ],
    arrows: [1, 2, 3, 4, 5].map((n) => ({ from: n, to: n + 1 })),
  })
}

/** Asking Kareena to fill in her details, from her card to her reply joining the tree */
async function askFlow() {
  // Tall enough that the reply's review fits in its sheet
  const page = await lightPage({ width: 1440, height: 1200 })
  await page.goto(`${base}/?sample`)
  await tile(page, 'ranbir').waitFor()
  await page.locator('.tile .pic img').nth(12).waitFor()
  await quiet(page)
  await openCard(page, 'kareena', 'kareena')
  await page.waitForTimeout(500)
  const s1 = await page.locator('.pop').screenshot()
  await page.locator('.pop').getByRole('button', { name: 'Make a link' }).click()
  const msg = page.locator('.ask-sheet .ask-msg', { hasText: '/add/#' })
  await msg.waitFor()
  const link = (await msg.textContent()).match(/https?:\/\/\S+/)[0]
  await msg.evaluate((el, b) => (el.textContent = el.textContent.replace(b, 'https://www.jangaltree.com')), base)
  const s2 = await page.locator('.ask-sheet').screenshot()

  const phone = await lightPage({ width: 390, height: 640 })
  // No share sheet, so Send downloads the reply
  await phone.addInitScript(() => {
    delete Navigator.prototype.share
    delete Navigator.prototype.canShare
  })
  await phone.goto(link)
  const me = phone.getByRole('region', { name: 'You', exact: true })
  await me.getByLabel('Add your photo').setInputFiles(new URL('public/sample/kareena.webp', root).pathname)
  await phone.getByRole('dialog', { name: 'Your photo' }).getByRole('button', { name: 'Use this photo' }).click()
  await me.locator('.add-face img').waitFor()
  await fillIn(phone)
  await phone.evaluate(() => scrollTo(0, 0))
  await phone.waitForTimeout(400)
  const s3 = await phone.screenshot()
  const [download] = await Promise.all([phone.waitForEvent('download'), phone.getByRole('button', { name: 'Send to Ranbir' }).click()])
  const file = join(tmpdir(), download.suggestedFilename())
  await download.saveAs(file)
  await phone.getByRole('heading', { name: 'Your answers are saved as a file' }).waitFor()
  await phone.evaluate(() => scrollTo(0, 0))
  await phone.waitForTimeout(400)
  const s4 = await phone.screenshot()
  await phone.close()

  await page.keyboard.press('Escape')
  await dock(page, 'Share')
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.locator('.sheet input[type=file]').setInputFiles(file)
  const review = page.locator('.report.merge')
  await review.waitFor()
  await page.waitForTimeout(600)
  const s5 = await review.screenshot()
  await review.getByRole('button', { name: /^Combine/ }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.keyboard.press('/')
  await page.locator('.find-in').fill('taimur')
  await page.locator('.res').first().waitFor()
  await page.locator('.find-in').press('Enter')
  await page.waitForTimeout(900)
  // Clear the path Find lit, so the family shows as it is
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.mouse.move(5, 700)
  await page.waitForTimeout(800)
  const s6 = await around(page, [tile(page, 'kareena'), page.locator('.tile', { hasText: 'Saif Ali Khan' }), page.locator('.tile', { hasText: 'Taimur' })], 48)
  await page.close()

  await drawFlow('wireflow-ask.png', {
    title: 'Asking the family',
    sub: 'A round trip between two devices, with no server in between',
    cols: 4,
    colWidth: 330,
    gap: [132, 64],
    shotHeight: 300,
    lanes: [
      { row: 1, label: 'You, in Jangal' },
      { row: 2, label: 'Kareena, on her phone' },
    ],
    steps: [
      { row: 1, col: 1, title: 'Make a link', text: "From Kareena's card: ask her to check her details and add a photo.", img: s1, crop: 'bottom' },
      { row: 1, col: 2, title: 'Send it your way', text: 'The sheet says what the link holds: names only. Share, copy or email it.', img: s2 },
      { row: 2, col: 2, title: 'She fills it in', text: 'A photo, her places, and a new son. A draft stays on her phone as she types.', img: s3, crop: 'top' },
      { row: 2, col: 3, title: 'Send', text: 'Her answers become a small file, sent back through her share sheet.', img: s4, crop: 'top' },
      { row: 1, col: 3, title: 'Review her reply', text: 'Import matches people by id and lists each change to tick.', img: s5, crop: 'top' },
      { row: 1, col: 4, title: 'Combined', text: 'Taimur joins the tree, and one Undo takes it all back.', img: s6 },
    ],
    notes: [
      { row: 2, col: 4, title: 'No server in between', text: 'The link carries names after the #, which browsers never send to a server. The reply comes back as a file.' },
    ],
    arrows: [
      { from: 1, to: 2 },
      { from: 2, to: 3, label: 'The link, by WhatsApp, text or email', code: '/add/#z=eJxN…' },
      { from: 3, to: 4 },
      { from: 4, to: 5, label: 'The reply file comes back', code: 'kareena-kapoor-khan-reply.html' },
      { from: 5, to: 6 },
    ],
  })
}

if (!only.length || only.some((w) => 'wireflow-tree'.startsWith(w))) await treeFlow()
if (!only.length || only.some((w) => 'wireflow-ask'.startsWith(w))) await askFlow()

await browser.close()
await server.close()
