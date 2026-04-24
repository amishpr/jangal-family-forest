import { readFileSync } from 'node:fs'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { dock, find, openSample, tile } from './helpers'

async function exportAs(page: Page, kind: RegExp, button: string, info: TestInfo) {
  await dock(page, 'Share')
  await page.getByRole('radio', { name: kind }).click()
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: button }).click()])
  // Saved under its own name, so a browser opening it knows it's a web page
  const path = info.outputPath(download.suggestedFilename())
  await download.saveAs(path)
  return { path, name: download.suggestedFilename() }
}

test('a backup imports back into the same tree (PLAN S7)', async ({ page }, info) => {
  await openSample(page)
  const { path } = await exportAs(page, /Backup file/, 'Download the backup', info)
  const saved = JSON.parse(readFileSync(path, 'utf8'))
  expect(Object.keys(saved.people)).toHaveLength(88)
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.locator('.sheet input[type=file]').setInputFiles(path)
  // The sample's photos load in the background, so how many made it in depends on timing
  await expect(page.locator('.report')).toContainText(/88 people, \d+ photos?/)
  await page.getByRole('button', { name: 'Open as a new tree' }).click()
  await expect(tile(page, 'ranbir')).toBeVisible()
  await expect(page.locator('.ttl-text')).toHaveText('The Kapoor Family')
})

test('the family page works with the network blocked, and search still works (PLAN S5, E-3)', async ({ page, context }, info) => {
  // Only the family page's own requests count, so the blocking is set up on that page alone
  await openSample(page)
  const { path, name } = await exportAs(page, /A page for family/, 'Download the page', info)
  expect(name).toMatch(/^kapoor-family-\d{4}-\d{2}-\d{2}\.html$/)
  const html = readFileSync(path, 'utf8')
  expect(html).toContain('<meta name="robots" content="noindex, nofollow"')
  expect(html).toContain("default-src 'none'")
  const requests: string[] = []
  const viewer = await context.newPage()
  await viewer.route('**/*', (route) => {
    const url = route.request().url()
    if (url.startsWith('file:')) return route.continue()
    requests.push(url)
    return route.abort()
  })
  await viewer.goto(`file://${path}`)
  await expect(viewer.locator('.ttl-text')).toHaveText('The Kapoor Family')
  await expect(viewer.locator('.sprout')).toHaveCount(0)
  await expect(viewer.locator('.tile').first()).toBeVisible()
  await find(viewer, 'kareena')
  await expect(viewer.locator('.world.pathing')).toBeVisible()
  expect(requests).toEqual([])
})

test('the poster PDF has a page per two people plus the poster, and real text (PLAN E-4, E-5)', async ({ page }, info) => {
  await openSample(page)
  const { path, name } = await exportAs(page, /Poster PDF/, 'Download the PDF', info)
  expect(name).toMatch(/-poster\.pdf$/)
  const pdf = readFileSync(path, 'latin1')
  expect(pdf.startsWith('%PDF-')).toBe(true)
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(45)
  expect(pdf).toContain('/FontFile2') // fonts are embedded, so the text is real text
})

test('a birthdays calendar downloads with every living birthday (PLAN X-3)', async ({ page }) => {
  await openSample(page)
  await dock(page, 'Birthdays')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Add all to my calendar' }).click()])
  expect(download.suggestedFilename()).toBe('kapoor-family-birthdays.ics')
  const ics = readFileSync((await download.path())!, 'utf8')
  expect(ics).toContain('PRODID:-//Jangal//Birthdays//EN')
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(61)
})

test('spreadsheets: an Excel export imports back, and so do both templates (TODO.md F3)', async ({ page }, info) => {
  await openSample(page)
  const { path, name } = await exportAs(page, /Spreadsheet/, 'Download the spreadsheet', info)
  expect(name).toMatch(/^kapoor-family-\d{4}-\d{2}-\d{2}\.xlsx$/)
  expect(readFileSync(path).subarray(0, 2).toString()).toBe('PK')
  await page.getByRole('button', { name: 'Import a file' }).click()
  await page.locator('.sheet input[type=file]').setInputFiles(path)
  await expect(page.locator('.report')).toContainText('88 people, 0 photos')
  await page.getByRole('button', { name: 'Open as a new tree' }).click()
  await expect(page.locator('.tile.home')).toContainText('Ranbir Kapoor')

  // The empty templates, with their example family, open as a tree of three
  for (const format of ['Excel', 'CSV']) {
    await dock(page, 'Share')
    await page.getByRole('button', { name: 'Import a file' }).click()
    const [template] = await Promise.all([page.waitForEvent('download'), page.locator('.sheet-tip').getByRole('button', { name: format, exact: true }).click()])
    expect(template.suggestedFilename()).toBe(`jangal-family-template.${format === 'Excel' ? 'xlsx' : 'csv'}`)
    const templatePath = info.outputPath(template.suggestedFilename())
    await template.saveAs(templatePath)
    await page.locator('.sheet input[type=file]').setInputFiles(templatePath)
    await expect(page.locator('.report')).toContainText('3 people, 0 photos')
    await page.getByRole('button', { name: 'Open as a new tree' }).click()
    await expect(page.locator('.tile.home')).toContainText('Asha Shah')
    await expect(page.locator('.tile', { hasText: 'Meena Shah' })).toContainText('Mother')
  }
})
