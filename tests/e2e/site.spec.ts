import { expect, test } from '@playwright/test'

// The site (PLAN 9 "Site and speed", 10.1 to 10.4, TODO.md F6 and F7): the app at "/", the privacy
// and 404 pages, and "/app/" sending old links to "/". There's no landing page any more.

test('the app at / has its search and preview tags, and says what Jangal is without JavaScript', async ({ page, request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('<meta name="robots" content="index, follow')
  expect(html).toMatch(/<link rel="canonical" href="https?:\/\/[^/"]+\/"/)
  expect(html).toMatch(/<meta property="og:image" content="https?:\/\/.+\/og\/jangal-og-[0-9a-f]{8}\.png"/)
  // The start screen's words are in the page itself, for search engines and anyone without JavaScript
  expect(html).toMatch(/<noscript>[\s\S]*About Jangal[\s\S]*How are we related\?[\s\S]*<\/noscript>/)
  await page.goto('/')
  await expect(page).toHaveTitle(/Free family tree maker/)
  expect((await page.title()).length).toBeLessThanOrEqual(60)
  expect((await page.locator('meta[name="description"]').getAttribute('content'))!.length).toBeLessThanOrEqual(160)
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)
  expect(ld['@graph'].map((x: { '@type': string }) => x['@type'])).toEqual(['WebSite', 'WebApplication'])
  expect(ld['@graph'][1]).toMatchObject({ applicationCategory: 'LifestyleApplication', isAccessibleForFree: true, offers: { price: '0' } })
})

test('the start screen: the name, then the ways in, then a short word about Jangal (TODO.md F6)', async ({ page }) => {
  await page.goto('/')
  const h1 = page.locator('h1.empty-title')
  await expect(h1).toContainText('The Family Forest')
  await expect(page.getByRole('button', { name: /Start with you/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import a file' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explore a sample family' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'About Jangal' })).toBeVisible()
  await expect(page.locator('.start-points li')).toHaveCount(6)
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy/')
  // "The Family Forest" sits under the wordmark, not beside it
  const [mark, sub] = await Promise.all([h1.locator('.wm').boundingBox(), h1.locator('.sub').boundingBox()])
  expect(sub!.y).toBeGreaterThan(mark!.y + mark!.height - 4)
})

test('with a tree open, About shows the start page, with the way back to the tree first', async ({ page }) => {
  await page.goto('/?sample')
  const ranbir = page.locator('.tile[data-id="ranbir"]')
  await expect(ranbir).toBeVisible()
  const startPage = async () => {
    await page.getByRole('button', { name: 'About', exact: true }).click()
    await page.getByRole('button', { name: 'See the start page' }).click()
  }

  await startPage()
  const back = page.getByRole('button', { name: /Back to your tree/ })
  await expect(back).toBeFocused()
  await expect(back).toContainText(/The Kapoor Family\s*88 people/)
  await expect(page.getByRole('button', { name: /Start with you/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start a new tree' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explore a sample family' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'About Jangal' })).toBeVisible()
  await expect(page.locator('.tile')).toHaveCount(0)
  // The tree's shortcuts wait until it's back
  await page.keyboard.press('2')
  await expect(page.locator('.empty-start')).toBeVisible()
  await back.click()
  await expect(ranbir).toBeVisible()

  // Esc goes back too
  await startPage()
  await page.keyboard.press('Escape')
  await expect(ranbir).toBeVisible()

  // Import opens over the tree
  await startPage()
  await page.getByRole('button', { name: 'Import a file' }).click()
  await expect(page.locator('.sheet input[type=file]')).toBeAttached()
  await expect(ranbir).toBeVisible()
  await page.keyboard.press('Escape')

  // A new tree starts with you, and the sample family stays saved
  await startPage()
  await page.getByRole('button', { name: 'Start a new tree' }).click()
  await expect(page.locator('.empty-start')).toHaveCount(0)
  await expect(page.locator('.nm-in')).toBeFocused()
})

test('old /app/ links open the app at /, query and all', async ({ page, request }) => {
  await page.goto('/app/?sample')
  await expect(page).toHaveURL(/\/\?sample$|\/$/)
  await expect(page.locator('.tile[data-id="ranbir"]')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
  const html = await (await request.get('/app/')).text()
  expect(html).toContain('<meta name="robots" content="noindex, follow"')
})

test('the privacy page has its search and preview tags, and no JavaScript bundle', async ({ page }) => {
  await page.goto('/privacy/')
  await expect(page).toHaveTitle('Privacy | Jangal (જંગલ)')
  const meta = (sel: string, attr = 'content') => page.locator(sel).first().getAttribute(attr)
  expect((await meta('meta[name="description"]'))!.length).toBeLessThanOrEqual(160)
  expect(await meta('link[rel="canonical"]', 'href')).toMatch(/^https?:\/\/[^/]+\/privacy\/$/)
  expect(await meta('meta[name="robots"]')).toContain('index, follow')
  expect(await meta('meta[property="og:image"]')).toMatch(/^https?:\/\/.+\/og\/jangal-og-[0-9a-f]{8}\.png$/)
  expect(await page.locator('html').getAttribute('lang')).toBe('en')
  expect(await page.locator('h1').count()).toBe(1)
  expect(await page.locator('script[src]').count()).toBe(0)
  await page.getByRole('link', { name: 'Open the app' }).first().click()
  await expect(page.getByRole('button', { name: /Start with you/ })).toBeVisible()
})

test('the preview image is 1200 by 630 and under 300 KB (PLAN W-3)', async ({ page, request }) => {
  await page.goto('/privacy/')
  const url = new URL((await page.locator('meta[property="og:image"]').getAttribute('content'))!)
  const res = await request.get(url.pathname)
  expect(res.status()).toBe(200)
  const body = await res.body()
  expect(body.length).toBeLessThan(300 * 1024)
  // PNG width and height live at bytes 16 to 24
  expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630])
})

test('robots.txt and the sitemap list the app and the privacy page (PLAN 10.4)', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('Allow: /')
  expect(robots).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/)
  const sitemap = await (await request.get('/sitemap.xml')).text()
  expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)).toEqual(['/', '/privacy/'])
})

test('a missing page is a real 404 with a way home', async ({ page }) => {
  const res = await page.goto('/no-such-page/')
  expect(res?.status()).toBe(404)
  // The hosts answer any missing address with 404.html; the local preview server doesn't
  await page.goto('/404.html')
  await expect(page.getByRole('heading', { name: "This page isn't here" })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open your tree' })).toHaveAttribute('href', '/')
})

test('the backup schema is published (PLAN 8.10)', async ({ request }) => {
  const schema = await (await request.get('/schema/v1.json')).json()
  expect(schema.title).toBe('Jangal family tree backup')
  expect(schema.properties.people).toBeTruthy()
})
