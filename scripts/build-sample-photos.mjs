// The sample family's photos (TODO.md KP-5). Run by hand, never in CI: node scripts/build-sample-photos.mjs
// For each person in sample-photos.json it takes the Wikipedia article's lead image, but only a freely
// licensed one from Wikimedia Commons, crops it square, and writes public/sample/<id>.webp (512 px) and
// <id>-thumb.webp (144 px). The author and license of every photo go to src/core/sampleCredits.json,
// which the sample and the About sheet read. Anyone without a free photo keeps their leaf portrait.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public/sample')
const { people } = JSON.parse(readFileSync(join(root, 'scripts/sample-photos.json'), 'utf8'))
const UA = { 'User-Agent': 'JangalSamplePhotos/1.0 (family tree app; one-off build script)' }
// CC BY, CC BY-SA, CC0, public domain, and India's open government license. Anything else (fair
// use, NC, ND) is skipped.
const FREE = /^(cc[ -]by(-sa)?[ -][\d.]+|cc0|public domain|pd\b|godl-india)/i
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Wikimedia asks scripts to go slowly, and answers 429 when they don't
async function get(url) {
  for (let i = 0; ; i++) {
    await wait(1500)
    const res = await fetch(url, { headers: UA })
    if (res.status !== 429 || i === 5) {
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      return res
    }
    await wait(Number(res.headers.get('retry-after') ?? 10) * 1000)
  }
}

const api = async (host, params) => {
  return (await get(`https://${host}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`)).json()
}
// Commons wraps some authors twice ("Unknown authorUnknown author"), and gives others as a bare link
const strip = (html = '') => {
  const s = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().replace(/^(.+?)\1$/, '$1')
  return /^https?:\/\/\S+$/.test(s) ? new URL(s).hostname.replace(/^www\./, '') : s
}

/** The article's free lead image, or null. A redirect means the article isn't about this person alone. */
async function leadImage(article) {
  const j = await api('en.wikipedia.org', { action: 'query', titles: article, prop: 'pageimages', piprop: 'name', pilicense: 'free' })
  const page = j.query.pages[0]
  if (j.query.redirects?.length || page.missing) return null
  return page.pageimage ? `File:${page.pageimage}` : null
}

async function fileInfo(file) {
  const j = await api('commons.wikimedia.org', { action: 'query', titles: file, prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1200' })
  const ii = j.query.pages[0].imageinfo?.[0]
  if (!ii) return null
  const m = ii.extmetadata
  return {
    url: ii.thumburl ?? ii.url,
    page: ii.descriptionurl,
    license: m.LicenseShortName?.value ?? '',
    licenseUrl: m.LicenseUrl?.value ?? '',
    author: strip(m.Artist?.value) || strip(m.Credit?.value) || 'Unknown',
  }
}

async function crop(buf, box) {
  const img = sharp(buf).rotate()
  const { width: w, height: h } = await img.metadata()
  let square
  if (box) {
    const [cx, cy, s] = box
    const size = Math.round(Math.min(w, h) * s)
    const left = Math.max(0, Math.min(w - size, Math.round(cx * w - size / 2)))
    const top = Math.max(0, Math.min(h - size, Math.round(cy * h - size / 2)))
    square = img.extract({ left, top, width: size, height: size })
  } else {
    // Portraits keep the top, where the face usually is. Wide pictures let sharp find the subject.
    square = img.resize(Math.min(w, h), Math.min(w, h), { fit: 'cover', position: h > w * 1.1 ? 'north' : sharp.strategy.attention })
  }
  const big = await square.resize(512, 512).webp({ quality: 78 }).toBuffer()
  const thumb = await sharp(big).resize(144, 144).webp({ quality: 80 }).toBuffer()
  return { big, thumb }
}

// Start clean, so a photo taken out of the manifest doesn't linger
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const credits = {}
for (const p of people) {
  const file = p.file ? `File:${p.file}` : await leadImage(p.article)
  const info = file && (await fileInfo(file))
  if (!info) {
    console.log(`${p.id}: no free photo, keeps the leaf`)
    continue
  }
  if (!FREE.test(info.license)) {
    console.log(`${p.id}: skipped ${file} (${info.license || 'no license'})`)
    continue
  }
  const res = await get(info.url)
  const { big, thumb } = await crop(Buffer.from(await res.arrayBuffer()), p.crop)
  writeFileSync(join(out, `${p.id}.webp`), big)
  writeFileSync(join(out, `${p.id}-thumb.webp`), thumb)
  credits[p.id] = { file: file.slice(5), author: info.author, license: info.license, licenseUrl: info.licenseUrl, source: info.page }
  console.log(`${p.id}: ${file} (${info.license}, ${info.author}) ${(big.length / 1024).toFixed(1)} kB`)
}
writeFileSync(join(root, 'src/core/sampleCredits.json'), `${JSON.stringify(credits, null, 2)}\n`)
console.log(`${Object.keys(credits).length} photos`)
