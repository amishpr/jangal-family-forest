// After the build (PLAN 10.4, 10.6): robots.txt and sitemap.xml for the deploy context, noindex on
// every preview, and a Content Security Policy on every page. The policy is also a <meta> tag,
// because GitHub Pages can't send headers. It allows each page's own inline scripts by their hash
// and nothing from anywhere else.

import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { readFile, writeFile, readdir } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const dist = new URL('dist/', root)
const site = (process.env.SITE_URL || process.env.URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') || 'http://localhost:5199').replace(/\/+$/, '')

// Netlify: production, deploy-preview, branch-deploy. Vercel: production, preview. Local: production.
const context = process.env.CONTEXT || process.env.VERCEL_ENV || 'production'
const preview = context !== 'production'

const write = (path, text) => writeFile(new URL(path, dist), text)

// ---- robots.txt
await write(
  'robots.txt',
  preview ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`,
)

// ---- sitemap.xml: the indexed pages, each with the date its page last changed
const lastmod = (paths) => {
  try {
    const d = execSync(`git log -1 --format=%cs -- ${paths.join(' ')}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    if (d) return d
  } catch {
    // Not a git checkout: use today
  }
  return new Date().toISOString().slice(0, 10)
}
// The app at "/" (TODO.md F6) and the privacy page. "/app/" only sends old links to "/".
const urls = [
  [`${site}/`, lastmod(['index.html', 'src/app/StartInfo.tsx', 'src/app/EmptyStart.tsx'])],
  [`${site}/privacy/`, lastmod(['privacy/index.html', 'src/site/Privacy.tsx'])],
]
await write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(([loc, mod]) => `  <url><loc>${loc}</loc><lastmod>${mod}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
)

// ---- Content Security Policy, and noindex on previews
const hashOf = (code) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`
// Every inline script that runs, including the speculation rules: browsers that don't know the
// 'inline-speculation-rules' keyword accept them by hash
const inlineScripts = (html) =>
  [...html.matchAll(/<script(?![^>]*\btype="(?:application\/ld\+json|application\/json)")(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])

async function htmlFiles(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = new URL(e.name + (e.isDirectory() ? '/' : ''), dir)
    if (e.isDirectory() && !['assets', 'og', 'img', 'icons', 'schema'].includes(e.name)) out.push(...(await htmlFiles(p)))
    else if (e.name.endsWith('.html') && e.name !== 'viewer-template.html') out.push(p)
  }
  return out
}

for (const file of await htmlFiles(dist)) {
  let html = await readFile(file, 'utf8')
  const isApp = file.pathname === new URL('index.html', dist).pathname
  const hashes = inlineScripts(html).map(hashOf)
  const scripts = [isApp ? "'self'" : '', ...hashes, html.includes('type="speculationrules"') ? "'inline-speculation-rules'" : '']
    .filter(Boolean)
    .join(' ')
  const csp = [
    "default-src 'self'",
    `script-src ${scripts || "'none'"}`,
    // React sets some styles inline, and the app writes a small stylesheet for highlighting
    "style-src 'self' 'unsafe-inline'",
    isApp ? "img-src 'self' data: blob:" : "img-src 'self' data:",
    isApp ? "font-src 'self' data:" : "font-src 'self'",
    "connect-src 'self'",
    isApp ? "worker-src 'self'" : '',
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ]
    .filter(Boolean)
    .join('; ')
  html = html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${csp}">`)
  if (preview) html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, '').replace('<head>', '<head><meta name="robots" content="noindex, nofollow">')
  await writeFile(file, html)
}

// Netlify reads _headers from the published folder: previews say noindex on every response too
if (preview) await write('_headers', '/*\n  X-Robots-Tag: noindex\n')

console.log(`SEO files for ${preview ? `a ${context} (not indexed)` : 'production'} build at ${site}`)
