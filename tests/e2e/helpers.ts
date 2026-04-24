import { expect, type Locator, type Page } from '@playwright/test'

/** Opens the app with the sample family, fitted and ready */
export async function openSample(page: Page) {
  await page.goto('/?sample&debug')
  await expect(page.locator('.tile[data-id="ranbir"]')).toBeVisible()
  await page.waitForTimeout(300)
}

export const tile = (page: Page, id: string) => page.locator(`.tile[data-id="${id}"]`)

/**
 * Hover a tile, then click one of its + buttons. The buttons only show while the pointer is over
 * the tile, and the camera can move the tile away a moment after an add (TODO.md F13), so it hovers
 * again until the click lands.
 */
export async function sprout(page: Page, id: string, type: 'parent' | 'partner' | 'child' | 'sibling') {
  await sproutOn(tile(page, id), type)
}

export async function sproutOn(t: Locator, type: 'parent' | 'partner' | 'child' | 'sibling') {
  await expect(async () => {
    await t.hover()
    await t.locator(`.sprout[data-add="${type}"]`).click({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
}

export async function dock(page: Page, label: string) {
  await page.locator('.dock button', { hasText: label }).click()
}

/** Opens Find, waits for its box, and goes to the first match */
export async function find(page: Page, query: string) {
  await page.keyboard.press('/')
  const box = page.locator('.find-in')
  await expect(box).toBeFocused()
  await box.fill(query)
  await expect(page.locator('.res').first()).toBeVisible()
  await box.press('Enter')
}

/** The name box on a tile that was just added */
export const nameBox = (page: Page) => page.locator('.nm-in')

/** Presses and holds a tile until it lifts (TODO.md F18), then moves the mouse to x. The mouse stays down. */
export async function holdAndMove(page: Page, id: string, x: number) {
  const box = (await tile(page, id).boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.waitForTimeout(450)
  await page.mouse.move(x, y, { steps: 12 })
}

/** Who comes first, left to right on screen */
export const leftToRight = (page: Page, ids: string[]) =>
  page.evaluate(
    (list) =>
      list
        .map((id) => [id, document.querySelector(`.react-flow__node[data-id="${id}"]`)!.getBoundingClientRect().x] as const)
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id),
    ids,
  )
