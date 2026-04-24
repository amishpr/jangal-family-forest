import { expect, test } from '@playwright/test'
import { dock, find, openSample, tile } from './helpers'

// PLAN 7.1: the person card is never cut off, at any window size
for (const [w, h] of [
  [1440, 900],
  [1280, 720],
  [1100, 600],
  [390, 844],
]) {
  test(`the edit card fits the screen at ${w} by ${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await openSample(page)
    await find(page, 'samaira')
    await page.waitForTimeout(900)
    await tile(page, 'samaira').click()
    await page.locator('.pop').getByRole('button', { name: 'Edit' }).click()
    const card = page.locator('.pop')
    await expect(card.getByLabel('First name')).toBeFocused()
    await page.waitForTimeout(500)
    const box = (await card.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(w)
    expect(box.y + box.height).toBeLessThanOrEqual(h)
    // The name and Save stay visible, whatever scrolls
    await expect(card.getByRole('heading', { name: 'Edit Samaira' })).toBeInViewport()
    await expect(card.getByRole('button', { name: 'Save' })).toBeInViewport()
  })
}

test('the card stays open while editing, even when the canvas is clicked (PLAN 7.1)', async ({ page }) => {
  await openSample(page)
  await tile(page, 'ranbir').click()
  await page.locator('.pop').getByRole('button', { name: 'Edit' }).click()
  await page.mouse.click(1300, 800)
  await expect(page.locator('.pop')).toBeVisible()
  // Only Save, Cancel, the close button or Esc close it
  await page.keyboard.press('Escape')
  await expect(page.locator('.pop')).toHaveCount(0)
})

test('a wedding date in the edit card shows on the card and as an anniversary (TODO.md F16)', async ({ page }) => {
  await openSample(page)
  await tile(page, 'ranbir').click()
  await page.locator('.pop').getByRole('button', { name: 'Edit' }).click()
  const card = page.locator('.pop')
  // Tomorrow's date in 2022, so the anniversary falls inside the next 60 days
  const t = new Date(Date.now() + 86_400_000)
  await card.getByLabel('Married on: month').selectOption(String(t.getMonth() + 1))
  await card.getByLabel('Married on: day').fill(String(t.getDate()))
  await card.getByLabel('Married on: year').fill('2022')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByText(`married ${t.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, 2022`)).toBeVisible()
  await page.keyboard.press('Escape')
  await dock(page, 'Birthdays')
  await page.getByLabel('Anniversaries').check()
  await expect(page.getByText('Ranbir and Alia, married')).toBeVisible()
})

test('where someone lives now shows on their card (TODO.md F15)', async ({ page }) => {
  await openSample(page)
  await tile(page, 'ranbir').click()
  const card = page.locator('.pop')
  await card.getByRole('button', { name: 'Edit' }).click()
  await card.getByLabel('Lives in').fill('Bandra, Mumbai')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.locator('.fact', { hasText: 'Lives here now' })).toContainText('Bandra, Mumbai')
})

test('a title of their own shows on the tile, and what you call them wins (TODO.md F10)', async ({ page }) => {
  await openSample(page)
  const card = page.locator('.pop')
  const krishna = tile(page, 'krishna')
  await krishna.click()
  await card.getByRole('button', { name: 'Edit' }).click()
  // The box shows the word used today until something is typed
  await expect(card.getByLabel('Everyone calls them')).toHaveAttribute('placeholder', 'Grandmother')
  await card.getByLabel('Everyone calls them').fill('Moti Ba')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.locator('.tag')).toHaveText('Moti Ba · your grandmother')
  await expect(krishna).toContainText('Moti Ba')

  await card.getByRole('button', { name: 'Edit' }).click()
  await card.getByLabel('Ranbir calls them').fill('Dadi Maa')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(krishna).toContainText('Dadi Maa')

  // Someone else sees the family's word again
  await page.evaluate(() => (window as unknown as { __jangal: { tree: { getState(): { setHome(id: string): void } } } }).__jangal.tree.getState().setHome('alia'))
  await expect(krishna).toContainText('Moti Ba')
})
