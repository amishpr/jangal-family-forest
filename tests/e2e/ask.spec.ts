import { expect, test, type Page } from '@playwright/test'
import { inflateSync } from 'node:zlib'
import { dock, find, openSample, tile } from './helpers'

// SHARE.md: asking a relative to fill in their own details through a link, and importing the reply

/** No share sheet, as on most computers, so Send downloads the reply */
const withoutShareSheet = (page: Page) =>
  page.addInitScript(() => {
    const nav = Navigator.prototype as unknown as Record<string, unknown>
    delete nav.share
    delete nav.canShare
  })

test('a relative fills in the link, and the reply joins the tree with the picked changes (SHARE.md SH-1 to SH-15)', async ({ page, context }, info) => {
  test.setTimeout(120_000)
  await openSample(page)
  await find(page, 'kareena')
  await page.waitForTimeout(900)
  await tile(page, 'kareena').click()
  await page.locator('.pop').getByRole('button', { name: 'Make a link' }).click()

  // The sheet says what the link holds, and your name comes from the person marked as you
  const sheet = page.locator('.ask-sheet')
  await expect(sheet.getByRole('heading', { name: 'Ask Kareena to fill in' })).toBeVisible()
  await expect(sheet.getByLabel('Your name')).toHaveValue('Ranbir')
  await expect(sheet.locator('.ask-holds')).toContainText("Kareena's name, the names of Saif Ali, and the tree's title, The Kapoor Family")
  // The message reads as a letter from you, with the link deflated on its own line
  const msg = sheet.locator('.ask-msg')
  await expect(msg).toContainText('/add/#z=')
  await expect(msg).toContainText(/^Hello Kareena,[\s\S]*your name and Saif Ali's already filled in[\s\S]*Thanks,\s*Ranbir$/)
  const mail = new URL((await sheet.getByRole('link', { name: 'Email it' }).getAttribute('href'))!)
  expect(mail.searchParams.get('subject')).toBe('Kareena, can you help with The Kapoor Family tree?')
  const url = (await msg.textContent())!.match(/https?:\/\/\S+/)![0]
  const carried = inflateSync(Buffer.from(new URL(url).hash.replace(/^#z=/, ''), 'base64url')).toString('utf8')
  expect(carried).toContain('Saif Ali')
  expect(carried).not.toMatch(/1980|Bombay|Actor|photo/)

  // On the relative's device
  const relative = await context.newPage()
  await withoutShareSheet(relative)
  const requests: string[] = []
  relative.on('request', (r) => requests.push(r.url()))
  await relative.goto(url)
  await expect(relative.getByRole('heading', { name: 'Hi Kareena!' })).toBeVisible()
  const me = relative.getByRole('region', { name: 'You', exact: true })
  await expect(me.getByLabel('First name')).toHaveValue('Kareena')
  await me.getByLabel('Born in').fill('Mumbai, India')
  await me.getByLabel('Lives in').fill('Mumbai')
  await me.getByLabel('Add your photo').setInputFiles('public/sample/kareena.webp')
  const crop = relative.getByRole('dialog', { name: 'Your photo' })
  await crop.getByRole('button', { name: 'Use this photo' }).click()
  await expect(crop).toHaveCount(0)
  await expect(me.locator('.add-face img')).toBeVisible()

  // The draft, photo included, survives the page being reloaded
  await relative.waitForTimeout(600)
  await relative.reload()
  await expect(me.getByLabel('Lives in')).toHaveValue('Mumbai')
  await expect(me.locator('.add-face img')).toBeVisible()

  // Saif comes from the link, already married; their son is new
  const saif = relative.getByRole('region', { name: /You and Saif/ })
  await expect(saif.getByRole('radio', { name: 'Married' })).toBeChecked()
  await saif.getByRole('button', { name: 'Add a child' }).click()
  const kid = saif.locator('.add-kid').last()
  await kid.getByLabel('First name').fill('Taimur')
  await kid.getByLabel('Last name').fill('Ali Khan')
  await kid.getByLabel('Birthday: year').fill('2016')

  // A mistake is caught before anything is made
  await kid.getByLabel('Birthday: day').fill('45')
  await relative.getByRole('button', { name: 'Send to Ranbir' }).click()
  await expect(relative.getByText(/Check the field marked in red/)).toBeVisible()
  await kid.getByLabel('Birthday: day').fill('')

  const [download] = await Promise.all([relative.waitForEvent('download'), relative.getByRole('button', { name: 'Send to Ranbir' }).click()])
  expect(download.suggestedFilename()).toBe('kareena-kapoor-khan-reply.html')
  const file = info.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  await expect(relative.getByRole('heading', { name: 'Your answers are saved as a file' })).toBeVisible()
  // The page asked the network for nothing but its own files (blob: and data: stay on the device)
  expect(requests.filter((u) => /^https?:/.test(u) && !u.startsWith(new URL(url).origin))).toEqual([])

  // Back in the app: the reply goes straight to the review
  await page.bringToFront()
  await page.keyboard.press('Escape')
  await dock(page, 'Share')
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.locator('.sheet input[type=file]').setInputFiles(file)
  const review = page.locator('.report.merge')
  await expect(review.getByText("Kareena's reply")).toBeVisible()
  await expect(review.getByRole('checkbox', { name: /Kareena Kapoor Khan/ })).toBeChecked()
  await expect(review.getByRole('checkbox', { name: /Saif Ali Khan/ })).toBeChecked()
  const bornIn = review.getByRole('checkbox', { name: /Kareena · born in/ })
  await expect(bornIn).toBeChecked()
  await expect(review.getByRole('checkbox', { name: /Kareena · photo/ })).toBeChecked()
  await expect(review.getByText('Taimur Ali Khan')).toBeVisible()
  // Keep the birthplace the tree has
  await bornIn.uncheck()
  await review.getByRole('button', { name: 'Combine: add 1 person' }).click()
  await expect(page.locator('.report.merge')).toContainText('1 person was added')
  await review.getByRole('button', { name: 'Done' }).click()

  await find(page, 'taimur')
  await expect(page.locator('.tile', { hasText: 'Taimur' })).toBeVisible()
  await find(page, 'kareena')
  await page.waitForTimeout(900)
  await tile(page, 'kareena').click()
  // The birthplace that was unticked stays, the blank home is filled, and Taimur is their son
  const card = page.locator('.pop')
  await expect(card).toContainText(/Bombay, India\s*Birthplace/)
  await expect(card).toContainText(/Mumbai\s*Lives here now/)
  await expect(card.locator('.pchip', { hasText: 'Taimur' })).toBeVisible()
  await page.keyboard.press('Escape')

  // One Undo takes it all back
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('.tile', { hasText: 'Taimur' })).toHaveCount(0)
})

test('a link that was cut off says so, instead of an empty form (SHARE.md SH-4)', async ({ page }) => {
  await page.goto('/add/#a=eyJ2IjoxLCJ0cmVl')
  await expect(page.getByRole('heading', { name: "This link didn't come through whole" })).toBeVisible()
  await expect(page.locator('form')).toHaveCount(0)
})

test('the fill-in page can’t connect anywhere, and isn’t indexed (SHARE.md security)', async ({ page }) => {
  const res = await page.goto('/add/#a=x')
  const html = await res!.text()
  expect(html).toContain("connect-src 'none'")
  expect(html).toContain("form-action 'none'")
  expect(html).toContain('<meta name="robots" content="noindex, nofollow"')
})
