import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import sourceSans700 from './fonts/source-sans-3-700.ttf?url'
import sourceSans800 from './fonts/source-sans-3-800.ttf?url'
import figtree600 from './fonts/figtree-600.ttf?url'
import figtree700 from './fonts/figtree-700.ttf?url'
import { BRAND } from '../../brand'
import { age, formatDate, stamp } from '../../core/dates'
import { indexOf, type TreeIndex } from '../../core/index'
import { partnerWord, relation } from '../../core/kinship'
import type { TreeDoc } from '../../core/model'
import { fullName, isDeceased } from '../../core/model'
import { generations, titleSlug, treeStats, treeTitle } from '../../core/title'
import { customTitle, familyTitle } from '../../core/titles'
import { WORDMARK } from '../../ui/wordmark.gen'
import { download } from './download'
import { FONTS, mix, needsPicture, needsShaping, PAW_PATHS, PRINT, renderTreeSvg, textImage } from './renderSvg'
import { photoDataUrl } from '../../store/photos'
import { useSettings } from '../../store/settings'
import { PAGE_SIZES, type PageSize } from './pageSizes'

// The poster PDF (PLAN E-4, E-5, 8.10). A vector poster of the tree with the family's title on
// top, and profile pages after it, two people per page. Every tile on the poster links to its
// person's page. Text is real text in embedded fonts, so it stays sharp and can be selected.
// Text the embedded fonts can't draw (Gujarati, Devanagari, Cyrillic...) is drawn by the browser and
// placed as a picture.

export type PdfOptions = {
  size: PageSize
  everyone: boolean
  photos: boolean
  dates: boolean
  profiles: boolean
  colors: boolean
}

const fontCache = new Map<string, string>()
async function fontBase64(url: string) {
  let v = fontCache.get(url)
  if (!v) {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    v = btoa(bin)
    fontCache.set(url, v)
  }
  return v
}

async function registerFonts(pdf: jsPDF) {
  const fonts: [string, string][] = [
    [FONTS.name, sourceSans700],
    [FONTS.display, sourceSans800],
    [FONTS.ui, figtree600],
    [FONTS.uiBold, figtree700],
  ]
  for (const [name, url] of fonts) {
    pdf.addFileToVFS(`${name}.ttf`, await fontBase64(url))
    // The SVG gives each text its weight, and svg2pdf looks fonts up by it ("600normal", "bold",
    // "800normal"). Each family here is one fixed weight, so every key finds the same file.
    pdf.addFont(`${name}.ttf`, name, 'normal')
    pdf.addFont(`${name}.ttf`, name, 'bold')
    pdf.addFont(`${name}.ttf`, name, 'normal', 600)
    pdf.addFont(`${name}.ttf`, name, 'normal', 800)
  }
}

const hexRgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]

/** Text at a point, or a picture of it for scripts jsPDF can't shape. Returns its width. */
function text(pdf: jsPDF, s: string, x: number, y: number, o: { size: number; font: string; weight: number; color: string; align?: 'left' | 'center' | 'right' }) {
  if (needsPicture(s)) {
    const family = o.font.startsWith('SourceSans3') ? 'Source Sans 3 Variable' : 'Figtree Variable'
    const img = textImage(s, o.size, o.weight, o.color, family)
    const w = img.w
    const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
    pdf.addImage(img.href, 'PNG', left, y - img.baseline, img.w, img.h)
    return w
  }
  pdf.setFont(o.font, 'normal')
  pdf.setFontSize(o.size)
  pdf.setTextColor(...hexRgb(o.color))
  pdf.text(s, x, y, { align: o.align ?? 'left' })
  return pdf.getTextWidth(s)
}

/** "Made with Jangal (જંગલ)" and the date, with the wordmark drawn from its outlines */
async function footer(pdf: jsPDF, pageW: number, pageH: number, margin: number) {
  const size = Math.max(8, Math.min(14, pageW / 70))
  const y = pageH - margin * 0.55
  const date = formatDate({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() }, true)
  const wmH = size * 1.3
  const wmW = wmH * (WORDMARK.width / WORDMARK.height)
  const dateW = text(pdf, `  ·  ${date}`, pageW - margin, y, { size, font: FONTS.ui, weight: 600, color: PRINT.ink3, align: 'right' })
  const wmX = pageW - margin - dateW - wmW
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK.viewBox}"><path d="${WORDMARK.d}" fill="${PRINT.ink2}"/></svg>`,
    'image/svg+xml',
  ).documentElement
  await pdf.svg(svg, { x: wmX, y: y - wmH * (1 - WORDMARK.descent / WORDMARK.height), width: wmW, height: wmH })
  text(pdf, 'Made with ', wmX - 2, y, { size, font: FONTS.ui, weight: 600, color: PRINT.ink3, align: 'right' })
}

export async function buildPdf(doc: TreeDoc, opts: PdfOptions): Promise<{ name: string; blob: Blob }> {
  const ix = indexOf(doc)
  const home = doc.homePersonId
  const title = treeTitle(doc, ix)
  const page = PAGE_SIZES[opts.size]
  const tree = await renderTreeSvg(ix, home, doc.view, { everyone: opts.everyone, photos: opts.photos, dates: opts.dates, colors: opts.colors })
  // Whichever way round draws the tree bigger, once the title block has taken its share
  const fit = (w: number, h: number) => {
    const m = Math.max(28, Math.min(w, h) * 0.05)
    const head = Math.max(20, Math.min(72, w * 0.042)) * 3.4
    return Math.min((w - m * 2) / tree.width, (h - m * 2.2 - head) / tree.height)
  }
  const landscape = fit(page.h, page.w) > fit(page.w, page.h)
  const pageW = landscape ? page.h : page.w
  const pageH = landscape ? page.w : page.h
  const pdf = new jsPDF({ unit: 'pt', format: [pageW, pageH], orientation: landscape ? 'landscape' : 'portrait', compress: true })
  pdf.setProperties({ title, subject: 'Family tree', creator: BRAND.full })
  await registerFonts(pdf)

  // ---- the poster
  const margin = Math.max(28, Math.min(pageW, pageH) * 0.05)
  pdf.setFillColor(...hexRgb(PRINT.bg))
  pdf.rect(0, 0, pageW, pageH, 'F')
  const titleSize = Math.max(20, Math.min(72, pageW * 0.042))
  let y = margin + titleSize * 0.85
  text(pdf, title, pageW / 2, y, { size: titleSize, font: FONTS.display, weight: 800, color: PRINT.ink, align: 'center' })
  const small = titleSize * 0.42
  if (doc.subtitle) {
    y += small * 1.7
    text(pdf, doc.subtitle, pageW / 2, y, { size: small, font: FONTS.ui, weight: 600, color: PRINT.ink2, align: 'center' })
  }
  if (doc.showStats) {
    y += small * 1.5
    text(pdf, treeStats(ix), pageW / 2, y, { size: small * 0.82, font: FONTS.ui, weight: 600, color: PRINT.ink3, align: 'center' })
  }
  const top = y + small * 1.6
  const bottom = pageH - margin * 1.2
  const availW = pageW - margin * 2
  const availH = bottom - top
  const scale = Math.min(availW / tree.width, availH / tree.height)
  const drawW = tree.width * scale
  const drawH = tree.height * scale
  const ox = (pageW - drawW) / 2
  const oy = top + (availH - drawH) / 2
  const svgEl = new DOMParser().parseFromString(tree.svg, 'image/svg+xml').documentElement
  await pdf.svg(svgEl, { x: ox, y: oy, width: drawW, height: drawH })
  await footer(pdf, pageW, pageH, margin)

  // ---- profile pages, oldest generation first, two to a page
  if (opts.profiles) {
    const gen = generations(ix)
    const order = Object.values(tree.layout.nodes)
      .sort((a, b) => (gen.get(a.id) ?? 0) - (gen.get(b.id) ?? 0) || a.x - b.x)
      .map((n) => n.id)
    const pw = opts.size === 'a4' || opts.size === 'a3' ? PAGE_SIZES.a4.w : PAGE_SIZES.letter.w
    const ph = opts.size === 'a4' || opts.size === 'a3' ? PAGE_SIZES.a4.h : PAGE_SIZES.letter.h
    const pageOf = new Map<string, number>()
    for (let i = 0; i < order.length; i += 2) {
      pdf.addPage([pw, ph], 'portrait')
      const pageNo = pdf.getNumberOfPages()
      pdf.setFillColor(...hexRgb('#FFFFFF'))
      pdf.rect(0, 0, pw, ph, 'F')
      for (let k = 0; k < 2 && i + k < order.length; k++) {
        pageOf.set(order[i + k], pageNo)
        await profile(pdf, ix, home, order[i + k], { x: 48, y: 48 + k * (ph / 2 - 24), w: pw - 96, h: ph / 2 - 72 }, opts)
      }
      if (i + 1 < order.length) {
        pdf.setDrawColor(...hexRgb(PRINT.ledge))
        pdf.setLineWidth(1)
        pdf.line(48, ph / 2, pw - 48, ph / 2)
      }
      pdf.setFont(FONTS.uiBold, 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(...hexRgb(PRINT.leaf))
      pdf.textWithLink('Back to the tree', 48, ph - 24, { pageNumber: 1 })
      text(pdf, title, pw - 48, ph - 24, { size: 9, font: FONTS.ui, weight: 600, color: PRINT.ink3, align: 'right' })
    }
    // Every tile on the poster opens its person's page
    pdf.setPage(1)
    for (const n of Object.values(tree.layout.nodes)) {
      const target = pageOf.get(n.id)
      if (!target) continue
      const x = ox + (n.x + tree.pad) * scale
      const yy = oy + (n.y + tree.pad) * scale
      pdf.link(x, yy, n.w * scale, n.h * scale, { pageNumber: target })
    }
  }
  const blob = pdf.output('blob')
  return { name: `${titleSlug(title)}-${stamp()}-poster.pdf`, blob }
}

type Box = { x: number; y: number; w: number; h: number }

async function profile(pdf: jsPDF, ix: TreeIndex, home: string | null, id: string, box: Box, opts: PdfOptions) {
  const p = ix.person(id)!
  const photoSize = 104
  let photoDrawn = false
  if (opts.photos && p.photoId) {
    const url = await photoDataUrl(p.photoId, 'full').catch(() => null)
    if (url) {
      const img = new Image()
      img.src = url
      await img.decode()
      // A round crop, drawn on a canvas so every PDF reader shows it the same way
      const c = document.createElement('canvas')
      c.width = c.height = 416
      const g = c.getContext('2d')!
      g.fillStyle = '#FFFFFF'
      g.fillRect(0, 0, 416, 416)
      g.beginPath()
      g.arc(208, 208, 208, 0, Math.PI * 2)
      g.clip()
      g.drawImage(img, 0, 0, 416, 416)
      pdf.addImage(c.toDataURL('image/jpeg', 0.88), 'JPEG', box.x, box.y, photoSize, photoSize)
      photoDrawn = true
    }
  }
  if (!photoDrawn) {
    pdf.setFillColor(...hexRgb(mix(PRINT.side.own, 15, '#FFFFFF')))
    pdf.circle(box.x + photoSize / 2, box.y + photoSize / 2, photoSize / 2, 'F')
    const leaf = new DOMParser().parseFromString(
      p.species ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${PAW_PATHS(PRINT.leaf)}</svg>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="rotate(38 32 34)"><path d="M32 47V57" stroke="${PRINT.leaf}" stroke-width="2.8" stroke-linecap="round" fill="none"/><path fill="${PRINT.leaf}" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z"/><path d="M32 46V19M32 40.5L37.6 35M32 40.5L26.4 35M32 32L36.4 27.6M32 32L27.6 27.6" stroke="${mix(PRINT.side.own, 15, '#FFFFFF')}" stroke-width="2" stroke-linecap="round" fill="none"/></g></svg>`,
      'image/svg+xml',
    ).documentElement
    await pdf.svg(leaf, { x: box.x + 18, y: box.y + 18, width: photoSize - 36, height: photoSize - 36 })
  }
  const x = box.x + photoSize + 24
  let y = box.y + 26
  text(pdf, fullName(p), x, y, { size: 24, font: FONTS.display, weight: 800, color: PRINT.ink })
  const alt = [p.birthSurname && p.birthSurname !== p.lastName ? `Born ${p.birthSurname}` : '', p.nickname ? `Goes by ${p.nickname}` : '', p.gender === 'other' && p.genderOther ? p.genderOther : '']
    .filter(Boolean)
    .join('  ·  ')
  if (alt) {
    y += 17
    text(pdf, alt, x, y, { size: 11, font: FONTS.ui, weight: 600, color: PRINT.ink3 })
  }
  if (home && home !== id) {
    y += 19
    const label = relation(ix, home, id).label
    const titled = customTitle(ix, home, id) ?? familyTitle(ix, home, id, useSettings.getState().titles)
    text(pdf, titled ? `${titled}  ·  your ${label}` : `Your ${label}`, x, y, { size: 12, font: FONTS.uiBold, weight: 700, color: PRINT.leaf })
  } else if (home === id) {
    y += 19
    text(pdf, 'This is you', x, y, { size: 12, font: FONTS.uiBold, weight: 700, color: PRINT.leaf })
  }

  const facts: string[] = []
  const b = p.birth
  if (opts.dates && (b?.date || b?.place)) facts.push(`Born ${[formatDate(b?.date, true), b?.place ? `in ${b.place}` : ''].filter(Boolean).join(' ')}`)
  else if (b?.place) facts.push(`Born in ${b.place}`)
  if (isDeceased(p)) {
    const d = p.death
    const lived = age(p)
    facts.push(
      `Died ${[opts.dates ? formatDate(d?.date, true) : '', d?.place ? `in ${d.place}` : ''].filter(Boolean).join(' ')}`.trim() +
        (lived != null ? `, aged ${lived}` : ''),
    )
  } else if (opts.dates && age(p) != null) facts.push(`${age(p)} years old`)
  const names = (ids: string[]) => ids.map((q) => fullName(ix.person(q)!)).join(', ')
  const partners = ix.partnersOf(id)
  if (partners.length) facts.push(`${partners.map((q) => `${cap(partnerWord(ix, id, q) ?? 'partner')}: ${fullName(ix.person(q)!)}`).join('  ·  ')}`)
  const parents = ix.parentsOf(id)
  if (parents.length) facts.push(`Parents: ${names(parents)}`)
  const kids = ix.childrenOf(id)
  if (kids.length) facts.push(`Children: ${names(kids)}`)
  y = Math.max(y + 12, box.y + photoSize + 14)
  const textW = box.w
  for (const f of facts) {
    y += 17
    if (needsPicture(f)) text(pdf, f, box.x, y, { size: 11.5, font: FONTS.ui, weight: 600, color: PRINT.ink2 })
    else {
      pdf.setFont(FONTS.ui, 'normal')
      pdf.setFontSize(11.5)
      pdf.setTextColor(...hexRgb(PRINT.ink2))
      const lines = pdf.splitTextToSize(f, textW) as string[]
      pdf.text(lines, box.x, y)
      y += (lines.length - 1) * 15
    }
  }
  if (p.notes) {
    y += 22
    const maxLines = Math.max(0, Math.floor((box.y + box.h - y) / 15))
    if (maxLines > 0) {
      if (needsShaping(p.notes)) {
        text(pdf, p.notes.split('\n')[0].slice(0, 90), box.x, y, { size: 11.5, font: FONTS.ui, weight: 600, color: PRINT.ink })
      } else {
        pdf.setFont(FONTS.ui, 'normal')
        pdf.setFontSize(11.5)
        pdf.setTextColor(...hexRgb(PRINT.ink))
        let lines = pdf.splitTextToSize(p.notes, textW) as string[]
        if (lines.length > maxLines) lines = [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1].replace(/\s+\S*$/, '')}...`]
        pdf.text(lines, box.x, y)
      }
    }
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export async function exportPdf(doc: TreeDoc, opts: PdfOptions) {
  const { name, blob } = await buildPdf(doc, opts)
  download(name, blob, 'application/pdf')
}
