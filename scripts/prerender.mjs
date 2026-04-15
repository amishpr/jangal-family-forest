// Renders the privacy and 404 pages to plain HTML (PLAN 10.1, 10.5): the React markup goes into the
// body, the stylesheet is inlined so it paints from the first response, and the two main fonts are
// preloaded. No React is sent to the browser. The app at "/" (TODO.md F6) gets its JSON-LD, the
// same font preloads, and what the start screen says about Jangal in its <noscript>.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const dist = new URL('dist/', root)
const base = process.env.BASE_PATH ?? '/'
const site = (process.env.SITE_URL || process.env.URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || 'http://localhost:5199').replace(/\/+$/, '')
const repoUrl = (process.env.VITE_REPO_URL ?? '').trim()
const og = JSON.parse(await readFile(new URL('src/site/og.json', root), 'utf8'))

const ssr = existsSync(new URL('dist-ssr/entry-server.js', root)) ? 'dist-ssr/entry-server.js' : 'dist-ssr/entry-server.mjs'
const { render, treeFileJsonSchema } = await import(new URL(ssr, root).href)

const description =
  'Build your family tree in your browser and see how anyone is related, in plain words. Free, no account, and nothing is uploaded. Share a page or a poster.'
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${site}/#website`, url: `${site}/`, name: 'Jangal (જંગલ) - The Family Forest', alternateName: 'Jangal', description, inLanguage: 'en' },
    {
      '@type': 'WebApplication',
      '@id': `${site}/#app`,
      name: 'Jangal',
      url: `${site}/`,
      description,
      image: `${site}/og/${og.file}`,
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Any web browser',
      browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true,
      inLanguage: 'en',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${site}/#website` },
    },
  ],
}

const PAGES = [
  ['privacy', 'privacy/index.html'],
  ['notFound', '404.html'],
]

for (const [name, file] of PAGES) {
  const path = new URL(file, dist)
  let html = await readFile(path, 'utf8')
  const marker = `<!--site:${name}-->`
  if (!html.includes(marker)) throw new Error(`${file} lost its ${marker} marker`)
  html = html.replace(marker, render(name, { base, repoUrl }))

  // Inline the stylesheet, and preload the Latin fonts it uses first
  const links = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/g)]
  for (const [tag, href] of links) {
    const css = await readFile(new URL(href.replace(base, ''), dist), 'utf8')
    const fonts = [...css.matchAll(/url\(([^)]*(?:source-sans-3|figtree)-latin-wght-normal[^)]*\.woff2)\)/g)].map((m) => m[1])
    const preload = [...new Set(fonts)].map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('')
    html = html.replace(tag, `${preload}<style>${css}</style>`)
  }
  html = html.replace('<!--jsonld-->', '')
  await writeFile(path, html)
  console.log(`${file}: ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`)
}

// The app keeps its stylesheet as a file, but preloads the same two fonts, so they download
// alongside the JavaScript instead of after the first render (PLAN 10.5)
{
  const path = new URL('index.html', dist)
  let html = await readFile(path, 'utf8')
  const href = html.match(/<link rel="stylesheet"[^>]*href="([^"]+\.css)"[^>]*>/)?.[1]
  if (!href) throw new Error('index.html lost its stylesheet')
  const css = await readFile(new URL(href.replace(base, ''), dist), 'utf8')
  const fonts = [...new Set([...css.matchAll(/url\(([^)]*(?:source-sans-3|figtree)-latin-wght-normal[^)]*\.woff2)\)/g)].map((m) => m[1]))]
  if (fonts.length !== 2) throw new Error(`index.html: expected 2 fonts to preload, found ${fonts.length}`)
  const preload = fonts.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('')
  html = html.replace(/<script type="module"/, `${preload}\n    <script type="module"`)
  for (const marker of ['<!--jsonld-->', '<!--site:start-->']) if (!html.includes(marker)) throw new Error(`index.html lost its ${marker} marker`)
  html = html.replace('<!--jsonld-->', `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`)
  html = html.replace('<!--site:start-->', render('start', { base, repoUrl }))
  await writeFile(path, html)
  console.log('index.html: fonts preloaded, JSON-LD and the start screen text added')
}

// The backup format's schema, referenced by every backup file's $schema
await mkdir(new URL('schema/', dist), { recursive: true })
await writeFile(new URL('schema/v1.json', dist), JSON.stringify(treeFileJsonSchema(`${site}/schema/v1.json`), null, 2))
console.log('schema/v1.json')
