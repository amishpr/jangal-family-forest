import { expect, test, type Page } from '@playwright/test'
import { dock, openSample } from './helpers'

// PRINT.md: the Timeline and the Fan chart print on clean paper, through the browser's print window

/** How many pages the browser's print makes, on Letter paper */
async function pdfPages(page: Page) {
  const pdf = (await page.pdf({ format: 'Letter' })).toString('latin1')
  return (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

const openTab = (page: Page, name: string) => page.locator('.tabs button', { hasText: name }).first().click()

test('the fan chart prints on one page, without its controls (PT-2, PT-4, PT-5)', async ({ page }) => {
  await openSample(page)
  await openTab(page, 'Fan chart')
  await page.locator('.fan-svg').waitFor()
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.fan-bar')).toBeHidden()
  await expect(page.locator('.dock')).toBeHidden()
  await expect(page.locator('.fan-cap')).toHaveText(/^Centered on Ranbir Kapoor · \d generations$/)
  // Empty ancestor places stay as outlines to write in, without their "+". "Add a child" goes.
  await expect(page.locator('.fw.ghost[data-add-parent]').first()).toBeVisible()
  await expect(page.locator('.ghost-plus').first()).toBeHidden()
  await expect(page.locator('.fw.ghost[data-add-child]')).toBeHidden()
  expect(await pdfPages(page)).toBe(1)
})

test('the timeline prints everyone, over several pages, inside the paper (PT-6 to PT-8)', async ({ page }) => {
  await openSample(page)
  await openTab(page, 'Timeline')
  await expect(page.locator('.tl-row')).toHaveCount(88)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.tl-acts')).toBeHidden()
  await expect(page.locator('.tl-read')).toBeHidden()
  await expect(page.locator('.tl-row[data-id="raj"] .tl-yrs')).toHaveText('1924 - 1988')
  // Letter paper's width, inside its margins: every bar and year label fits
  await page.setViewportSize({ width: 726, height: 966 })
  const outside = await page.evaluate(() => {
    const right = document.querySelector('.tl-inner')!.getBoundingClientRect().right
    return [...document.querySelectorAll('.tl-bar, .tick')].filter((el) => el.getBoundingClientRect().right > right + 1).length
  })
  expect(outside).toBe(0)
  expect(await pdfPages(page)).toBeGreaterThan(2)
})

test('on screen, bars sit on the year scale, and dragging the marker picks the year under it (PT-7)', async ({ page }) => {
  await openSample(page)
  await openTab(page, 'Timeline')
  const centerX = (sel: string) => page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.left + r.width / 2
  })
  const t1920 = await centerX('.tick:text-is("1920")')
  const t1930 = await centerX('.tick:text-is("1930")')
  // Raj Kapoor was born in 1924. Rows sit 8 px in from the scale, as they always have.
  const raj = await page.locator('.tl-row[data-id="raj"] .tl-bar').evaluate((el) => el.getBoundingClientRect().left)
  expect(raj).toBeGreaterThan(t1920 + 8)
  expect(raj).toBeLessThan(t1930 + 8)
  const axis = (await page.locator('.tl-axis').boundingBox())!
  await page.mouse.move(await centerX('.tick:text-is("1950")'), axis.y + axis.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator('.tl-read b')).toHaveText('1950')
})

test('no year on the scale peeks out from behind the marker, at Today or after a drag', async ({ page }) => {
  await openSample(page)
  await openTab(page, 'Timeline')
  await page.locator('.tl-knob').waitFor()
  /** The years on the scale that show, and how many of them the marker covers part of */
  const scale = () =>
    page.evaluate(() => {
      const k = document.querySelector('.tl-knob')!.getBoundingClientRect()
      const shown = [...document.querySelectorAll('.tick')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0)
      return { shown: shown.length, under: shown.filter((r) => r.right > k.left && r.left < k.right).length }
    })
  expect(await scale()).toMatchObject({ under: 0 })
  const axis = (await page.locator('.tl-axis').boundingBox())!
  const t1950 = (await page.locator('.tick:text-is("1950")').boundingBox())!
  // A little past 1950, between two years
  await page.mouse.click(t1950.x + t1950.width / 2 + 20, axis.y + axis.height / 2)
  const after = await scale()
  expect(after.under).toBe(0)
  // Only the years next to the marker hide
  expect(after.shown).toBeGreaterThan(10)
})

test('paper always gets the light colors, even in the dark theme (PT-9)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('jangal:theme', 'dark'))
  await openSample(page)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.printhead b')).toHaveCSS('color', 'rgb(11, 51, 32)')
})

test('Print on each tab, and in Share, opens the print window (PT-1, PT-10)', async ({ page }) => {
  await openSample(page)
  await page.evaluate(() => {
    const w = window as unknown as { printed: number }
    w.printed = 0
    window.print = () => void w.printed++
  })
  const printed = () => page.evaluate(() => (window as unknown as { printed: number }).printed)
  await openTab(page, 'Fan chart')
  await page.locator('.fan-ctl button', { hasText: 'Print' }).click()
  await openTab(page, 'Timeline')
  await page.locator('.tl-acts button', { hasText: 'Print' }).click()
  expect(await printed()).toBe(2)
  await dock(page, 'Share')
  await page.locator('.exp', { hasText: 'Poster PDF' }).click()
  await page.getByRole('button', { name: 'Print the timeline instead' }).click()
  await expect(page.locator('.sheet')).toBeHidden()
  await expect.poll(printed).toBe(3)
})
