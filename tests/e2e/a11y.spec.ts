import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { dock, holdAndMove, openSample, sprout, tile } from './helpers'

// PLAN 8.15: no serious accessibility problems, in both themes
async function scan(page: Page, exclude?: string) {
  // Hovering dims everyone but one family on purpose. Scan the resting state.
  await page.mouse.move(2, 450)
  await page.waitForTimeout(250)
  let axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  if (exclude) axe = axe.exclude(exclude)
  const res = await axe.analyze()
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  return bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    test('the start screen at /', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: /Start with you/ }).waitFor()
      expect(await scan(page)).toEqual([])
    })

    test('the tree', async ({ page }) => {
      await openSample(page)
      expect(await scan(page)).toEqual([])
    })

    test('a trait lit on the tree, and Find with its trait chips', async ({ page }) => {
      await openSample(page)
      await page.keyboard.press('/')
      await page.locator('.trait-find').waitFor()
      expect(await scan(page)).toEqual([])
      await page.locator('.trait-find .trait-chip', { hasText: 'Actor' }).click()
      await page.locator('.trait-bar').waitFor()
      await page.waitForTimeout(600)
      // The tree dims everyone without the trait on purpose, like hovering does, and the bar lists
      // who has it. So this scans the bar and the rest of the screen, not the dimmed tiles.
      expect(await scan(page, '.world')).toEqual([])
    })

    test('the quick-add card', async ({ page }) => {
      await openSample(page)
      await sprout(page, 'rajiv', 'partner')
      await page.locator('.quick-card').waitFor()
      await page.waitForTimeout(600)
      expect(await scan(page)).toEqual([])
    })

    test('the person card, view and edit', async ({ page }) => {
      await openSample(page)
      await tile(page, 'randhir').click()
      expect(await scan(page)).toEqual([])
      await page.locator('.pop').getByRole('button', { name: 'Edit' }).click()
      expect(await scan(page)).toEqual([])
    })

    test('the sheets', async ({ page }) => {
      // Seven scans of the whole tree behind the sheets
      test.setTimeout(150_000)
      await openSample(page)
      for (const name of ['Relate', 'Birthdays', 'Share']) {
        await dock(page, name)
        await page.waitForTimeout(300)
        expect(await scan(page), name).toEqual([])
      }
      await page.getByRole('button', { name: 'Family titles' }).click()
      await page.locator('.sheet label', { hasText: 'Gujarati' }).click()
      await page.waitForTimeout(300)
      expect(await scan(page), 'Family titles').toEqual([])
      // The titles editor and the New language flow (TODO.md F9)
      await page.getByRole('switch', { name: 'Edit words' }).click()
      expect(await scan(page), 'Edit words').toEqual([])
      await page.getByRole('button', { name: '+ New language' }).click()
      expect(await scan(page), 'New language').toEqual([])
    })

    test('a new pet, and its edit card (TODO.md F14)', async ({ page }) => {
      await openSample(page)
      await tile(page, 'ranbir').click()
      await page.locator('.pop').getByRole('button', { name: 'Add a relative' }).click()
      await page.locator('.addpanel label', { hasText: 'Pet' }).click()
      await page.getByRole('button', { name: 'Add someone new' }).click()
      await page.locator('.quick-pet').waitFor()
      await page.waitForTimeout(600)
      expect(await scan(page), 'quick add').toEqual([])
      await page.locator('.nm-in').fill('Bruno')
      await page.keyboard.press('Enter')
      await page.locator('.tile', { hasText: 'Bruno' }).click()
      await page.locator('.pop').getByRole('button', { name: 'Edit' }).click()
      expect(await scan(page), 'edit card').toEqual([])
    })

    test('a tile being moved among its brothers and sisters (TODO.md F18)', async ({ page }) => {
      await openSample(page)
      await expect(page.locator('.react-flow__node[data-id="rishi"]')).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowLeft Alt+ArrowRight')
      const babita = (await tile(page, 'babita').boundingBox())!
      await holdAndMove(page, 'rishi', babita.x)
      expect(await scan(page, '.world')).toEqual([])
      await page.keyboard.press('Escape')
      await page.mouse.up()
    })

    test('the timeline and the fan chart', async ({ page }) => {
      await openSample(page)
      await page.keyboard.press('2')
      await page.waitForTimeout(400)
      expect(await scan(page)).toEqual([])
      await page.keyboard.press('3')
      await page.waitForTimeout(400)
      expect(await scan(page)).toEqual([])
    })
  })
}

// Narrow screens hide the tab and dock labels, so the buttons have to keep their names some other way
test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the start screen, and the quick-add card for you', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Start with you/ }).waitFor()
    expect(await scan(page)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.getByRole('button', { name: /Start with you/ }).click()
    await page.locator('.quick-card').waitFor()
    await page.waitForTimeout(600)
    expect(await scan(page)).toEqual([])
  })

  test('the titles editor fits and has names for every button (TODO.md F9)', async ({ page }) => {
    await openSample(page)
    await page.getByRole('button', { name: 'Family titles' }).click()
    await page.locator('.sheet label', { hasText: 'Gujarati' }).click()
    await page.getByRole('switch', { name: 'Edit words' }).click()
    expect(await scan(page)).toEqual([])
    expect(await page.locator('.sheet').evaluate((el) => [...el.querySelectorAll('*')].filter((n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflowX !== 'visible').length)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await page.getByRole('button', { name: '+ New language' }).click()
    await page.getByLabel('Name in English').fill('Marathi')
    await page.getByLabel('Code').fill('mr')
    await page.getByRole('button', { name: 'Next: the words' }).click()
    expect(await scan(page)).toEqual([])
  })

  test('a new pet, and combining two trees, fit and have names (TODO.md F14, F12)', async ({ page }) => {
    await openSample(page)
    await tile(page, 'ranbir').click()
    await page.locator('.pop').getByRole('button', { name: 'Add a relative' }).click()
    await page.locator('.addpanel label', { hasText: 'Pet' }).click()
    await page.getByRole('button', { name: 'Add someone new' }).click()
    await page.locator('.quick-pet').waitFor()
    await page.waitForTimeout(600)
    expect(await scan(page), 'quick add').toEqual([])
    await page.keyboard.press('Escape')
    // A copy of the sample, then the original combined into it from Share
    await dock(page, 'Share')
    await page.getByRole('button', { name: 'Duplicate' }).first().click()
    await page.waitForTimeout(1200)
    await dock(page, 'Share')
    await page.getByRole('button', { name: /^Combine .* into the open tree$/ }).first().click()
    await page.locator('.report.merge').waitFor()
    expect(await scan(page), 'merge review').toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  })

  test('the tree and the dock', async ({ page }) => {
    await openSample(page)
    expect(await scan(page)).toEqual([])
    for (const name of ['Find', 'Relate', 'Birthdays', 'Share']) {
      await expect(page.locator('nav.dock').getByRole('button', { name, exact: true })).toBeVisible()
    }
  })
})
