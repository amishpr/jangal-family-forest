import { anchorId, visibleSets } from '../../core/collapse'
import { yearsLabel } from '../../core/dates'
import type { TreeIndex } from '../../core/index'
import { relation } from '../../core/kinship'
import { customTitle, familyTitle } from '../../core/titles'
import { layoutTree, type Layout } from '../../core/layout/layout'
import type { TreeView } from '../../core/model'
import { fullName, isDeceased } from '../../core/model'
import { sidesOf, type Side } from '../../core/sides'
import { photoDataUrl } from '../../store/photos'
import { useSettings } from '../../store/settings'

// The tree as a plain SVG (PLAN 8.7), drawn from the same layout as the app, so the PDF poster and
// the PNG and SVG exports match what's on screen without screenshotting it. It always uses the
// light colors, and every color is worked out here because PDF renderers don't know color-mix().

export const PRINT = {
  bg: '#EFF7F1',
  card: '#FDFFFD',
  ink: '#0B3320',
  ink2: '#3E6550',
  ink3: '#50725E',
  leaf: '#17844A',
  onLeaf: '#F4FFF8',
  line: '#BFDDC9',
  ledge: '#CBE6D4',
  ledgeLeaf: '#0E5C35',
  mint2: '#E4F6EA',
  bark: '#8A6443',
  side: { own: '#1B9A56', paternal: '#1E6A50', maternal: '#6A962C', other: '#50725E' } as Record<Side | 'none', string>,
  sideInk: { own: '#117242', paternal: '#185640', maternal: '#4B6D1C', other: '#3E6550' } as Record<Side | 'none', string>,
}
PRINT.side.none = PRINT.ink3
PRINT.sideInk.none = PRINT.ink2

/** a% of color a mixed with the rest of color b, like CSS color-mix in srgb */
export function mix(a: string, pct: number, b: string) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round((v * pct + y[i] * (100 - pct)) / 100).toString(16).padStart(2, '0')).join('')}`
}

export const FONTS = { name: 'SourceSans3-700', display: 'SourceSans3-800', ui: 'Figtree-600', uiBold: 'Figtree-700' }

/** Scripts that need shaping (Gujarati, Devanagari, Arabic...) */
export const needsShaping = (s: string) => /[֐-ࣿऀ-෿฀-࿿က-႟]/.test(s)

// What the embedded PDF fonts can draw: Latin, Latin Extended-A, common punctuation, € ₹ ™
const inFonts = (c: number) => c <= 0x17f || (c >= 0x2010 && c <= 0x2044) || c === 0x20ac || c === 0x20b9 || c === 0x2122

/**
 * Text the embedded fonts can't draw is drawn by the browser as a picture instead (TODO.md TP-9):
 * scripts that need shaping, and also Cyrillic, Greek, Chinese or an emoji, in a family's own
 * title pack or a name. Notes keep to needsShaping, because a picture of a note is one line.
 */
export const needsPicture = (s: string) => [...s].some((ch) => !inFonts(ch.codePointAt(0)!))

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const r1 = (n: number) => Math.round(n * 10) / 10

let measureCtx: CanvasRenderingContext2D | null = null
/** Text width with the app's own web fonts, which have the same shapes as the PDF fonts */
export function measure(text: string, px: number, weight = 700, family = 'Source Sans 3 Variable') {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * px * 0.55
  measureCtx.font = `${weight} ${px}px "${family}", "Noto Sans Gujarati Variable", sans-serif`
  return measureCtx.measureText(text).width
}

/** A picture of some text, drawn by the browser so complex scripts are shaped properly */
export function textImage(text: string, px: number, weight: number, color: string, family = 'Source Sans 3 Variable') {
  const scale = 4
  const w = Math.ceil(measure(text, px, weight, family)) + 4
  const h = Math.ceil(px * 1.5)
  const c = document.createElement('canvas')
  c.width = w * scale
  c.height = h * scale
  const g = c.getContext('2d')!
  g.scale(scale, scale)
  g.font = `${weight} ${px}px "${family}", "Noto Sans Gujarati Variable", sans-serif`
  g.fillStyle = color
  g.textBaseline = 'alphabetic'
  g.fillText(text, 2, px * 1.1)
  return { href: c.toDataURL('image/png'), w, h, baseline: px * 1.1 }
}

/** Centered text, or a centered picture of it when the fonts can't draw it */
function centeredText(text: string, cx: number, y: number, px: number, font: string, weight: number, color: string, family?: string) {
  if (needsPicture(text)) {
    const img = textImage(text, px, weight, color, family)
    return `<image href="${img.href}" x="${r1(cx - img.w / 2)}" y="${r1(y - img.baseline)}" width="${img.w}" height="${img.h}"/>`
  }
  return `<text x="${r1(cx)}" y="${r1(y)}" text-anchor="middle" font-family="${font}" font-weight="${weight}" font-size="${px}" fill="${color}">${esc(text)}</text>`
}

/** Up to two lines that fit a width, the second cut short with "..." if needed */
function wrap(text: string, width: number, px: number): string[] {
  if (measure(text, px) <= width) return [text]
  const words = text.split(/\s+/)
  let first = ''
  let i = 0
  for (; i < words.length; i++) {
    const next = first ? `${first} ${words[i]}` : words[i]
    if (measure(next, px) > width && first) break
    first = next
  }
  let second = words.slice(i).join(' ')
  while (second && measure(`${second}...`, px) > width) second = second.slice(0, -1)
  return second ? [first, words.slice(i).join(' ') === second ? second : `${second.trimEnd()}...`] : [first]
}

/** A pet's portrait, the paw from ui/Avatar.tsx (TODO.md F14) */
export const PAW_PATHS = (side: string) =>
  `<g fill="${side}"><ellipse cx="19.5" cy="29" rx="4.6" ry="6" transform="rotate(-24 19.5 29)"/><ellipse cx="27.5" cy="20.5" rx="4.6" ry="6.2" transform="rotate(-8 27.5 20.5)"/><ellipse cx="36.5" cy="20.5" rx="4.6" ry="6.2" transform="rotate(8 36.5 20.5)"/><ellipse cx="44.5" cy="29" rx="4.6" ry="6" transform="rotate(24 44.5 29)"/><path d="M32 31.5c6.4 0 12.5 7 12.5 12.6 0 3.8-2.9 5.9-6.3 5.9-2.6 0-4-1.4-6.2-1.4s-3.6 1.4-6.2 1.4c-3.4 0-6.3-2.1-6.3-5.9 0-5.6 6.1-12.6 12.5-12.6z"/></g>`

const LEAF_PATHS = (side: string, bg: string) =>
  `<g transform="rotate(38 32 34)"><path d="M32 47V57" stroke="${side}" stroke-width="2.8" stroke-linecap="round" fill="none"/><path fill="${side}" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z"/><path d="M32 46V19M32 40.5L37.6 35M32 40.5L26.4 35M32 32L36.4 27.6M32 32L27.6 27.6" stroke="${bg}" stroke-width="2" stroke-linecap="round" fill="none"/></g>`

const SEED_PATHS = (leaf: string) =>
  `<path fill="${PRINT.bark}" d="M12 9.6c3 1.9 5.3 4.2 5.3 7.1 0 2.8-2.3 4.8-5.3 4.8s-5.3-2-5.3-4.8c0-2.9 2.3-5.2 5.3-7.1z"/><path fill="none" stroke="${leaf}" stroke-width="1.9" stroke-linecap="round" d="M12 10.4V6.2"/><path fill="${leaf}" d="M11.6 7.1C10.9 4.4 8.6 2.8 5.4 3.1 5.3 6.2 7.7 8 11.6 7.1z"/><path fill="${leaf}" d="M12.4 6.3C13.2 3.8 15.4 2.4 18.6 2.7 18.6 5.6 16.2 7.2 12.4 6.3z"/>`

export type SvgOptions = {
  /** Everyone, or only what's showing (with tucked away branches left out) */
  everyone: boolean
  photos: boolean
  dates: boolean
  colors: boolean
}

export type RenderedTree = { svg: string; layout: Layout; width: number; height: number; pad: number }

/** Photos as JPEG data URLs: every PDF reader and image tool understands JPEG */
async function jpegPhoto(id: string): Promise<string | null> {
  const url = await photoDataUrl(id, 'full')
  if (!url) return null
  const img = new Image()
  img.src = url
  await img.decode()
  const c = document.createElement('canvas')
  c.width = c.height = Math.min(512, img.naturalWidth)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.86)
}

export async function renderTreeSvg(ix: TreeIndex, home: string | null, view: TreeView, opts: SvgOptions): Promise<RenderedTree> {
  const collapse = opts.everyone
    ? { collapsedFamilies: [], collapsedAncestors: [] }
    : { collapsedFamilies: view.collapsedFamilies, collapsedAncestors: view.collapsedAncestors }
  const anchor = anchorId(ix, home)
  const layout = layoutTree(ix, visibleSets(ix, anchor, collapse), collapse, anchor)
  const sides = sidesOf(ix, home)
  const sideOf = (id: string): Side | 'none' => (opts.colors ? (sides.side(id) ?? 'none') : 'own')
  const pad = 30
  const width = layout.bounds.w + pad * 2
  const height = layout.bounds.h + pad * 2 + 8
  const parts: string[] = []

  // Connectors first, under the tiles
  for (const f of layout.families) {
    const ex = f.status === 'divorced' || f.status === 'separated'
    for (const h of f.halves) {
      if (!h.d) continue
      const color = mix(PRINT.side[sideOf(h.pid)], 38, PRINT.line)
      parts.push(`<path d="${h.d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"${ex ? ' stroke-dasharray="1 7"' : ''}/>`)
    }
    for (const c of f.childSegs) {
      const color = mix(PRINT.side[sideOf(c.cid)], 38, PRINT.line)
      parts.push(`<path d="${c.d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"${c.kind !== 'biological' ? ' stroke-dasharray="2 8"' : ''}/>`)
    }
    if (f.twoPartners) parts.push(`<circle cx="${r1(f.anchor.x)}" cy="${r1(f.anchor.y)}" r="6" fill="${PRINT.card}" stroke="${PRINT.line}" stroke-width="3"/>`)
  }

  const photos = new Map<string, string>()
  if (opts.photos) {
    await Promise.all(
      Object.keys(layout.nodes).map(async (id) => {
        const p = ix.person(id)!
        if (!p.photoId) return
        const url = await jpegPhoto(p.photoId).catch(() => null)
        if (url) photos.set(id, url)
      }),
    )
  }

  let clip = 0
  for (const n of Object.values(layout.nodes)) {
    const p = ix.person(n.id)!
    const s = sideOf(n.id)
    const isHome = n.id === home
    const dead = isDeceased(p)
    const card = isHome ? PRINT.leaf : dead ? mix(PRINT.card, 82, PRINT.mint2) : PRINT.card
    const ink = isHome ? PRINT.onLeaf : PRINT.ink
    const cx = n.x + n.w / 2
    const py = n.y + 14 + 33
    parts.push(`<g data-id="${esc(n.id)}">`)
    parts.push(`<rect x="${n.x}" y="${n.y + 5}" width="${n.w}" height="${n.h}" rx="24" fill="${isHome ? PRINT.ledgeLeaf : PRINT.ledge}"/>`)
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="24" fill="${card}"/>`)
    // Photo or leaf, in a ring of the branch color
    parts.push(`<circle cx="${cx}" cy="${py}" r="39" fill="${isHome ? PRINT.onLeaf : mix(PRINT.side[s], 62, card)}"/>`)
    parts.push(`<circle cx="${cx}" cy="${py}" r="36" fill="${card}"/>`)
    const photo = photos.get(n.id)
    if (photo) {
      const id = `c${clip++}`
      parts.push(`<clipPath id="${id}"><circle cx="${cx}" cy="${py}" r="33"/></clipPath>`)
      parts.push(`<image href="${photo}" x="${cx - 33}" y="${py - 33}" width="66" height="66" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>`)
    } else {
      const bg = mix(PRINT.side[s], 15, PRINT.card)
      parts.push(`<circle cx="${cx}" cy="${py}" r="33" fill="${bg}"/>`)
      parts.push(`<g transform="translate(${cx - 33} ${py - 33}) scale(${66 / 64})">${p.species ? PAW_PATHS(PRINT.side[s]) : LEAF_PATHS(PRINT.side[s], bg)}</g>`)
    }
    if (dead) {
      const mx = cx + 33 - 9
      const my = py + 33 - 9
      parts.push(`<circle cx="${mx + 3}" cy="${my + 3}" r="13" fill="${card}"/>`)
      parts.push(`<g transform="translate(${mx + 3 - 8} ${my + 3 - 8}) scale(${16 / 24})">${SEED_PATHS(mix(PRINT.sideInk[s], 80, PRINT.ink3))}</g>`)
    }
    // Name, up to two lines
    const name = fullName(p)
    const px = measure(name, 15.5) > 120 ? 14 : 15.5
    const lines = wrap(name, 120, px)
    let y = n.y + 14 + 66 + 10 + px
    for (const line of lines) {
      parts.push(centeredText(line, cx, y, px, FONTS.name, 700, ink))
      y += px * 1.12
    }
    // Relationship tag and years (in the neutral view: years in the tag, birthplace underneath)
    const titled = home && n.id !== home ? (customTitle(ix, home, n.id) ?? familyTitle(ix, home, n.id, useSettings.getState().titles)) : null
    const rel = home ? (n.id === home ? 'You' : (titled ?? cap(relation(ix, home, n.id).label))) : opts.dates ? yearsLabel(p) : ''
    const sub = home ? (opts.dates ? yearsLabel(p) : '') : (p.birth?.place?.split(',')[0] ?? '')
    y += 4
    if (rel) {
      let tag = rel
      while (tag.length > 3 && measure(tag, 11.5, 700, 'Figtree Variable') > 104) tag = tag.slice(0, -2)
      if (tag !== rel) tag = `${tag.trimEnd()}...`
      const tw = measure(tag, 11.5, 700, 'Figtree Variable') + 18
      const tagFill = isHome ? mix(PRINT.ink, 22, PRINT.leaf) : mix(PRINT.side[s], 13, card)
      parts.push(`<rect x="${r1(cx - tw / 2)}" y="${r1(y)}" width="${r1(tw)}" height="19" rx="9.5" fill="${tagFill}"/>`)
      parts.push(centeredText(tag, cx, y + 13.5, 11.5, FONTS.uiBold, 700, isHome ? PRINT.onLeaf : PRINT.sideInk[s], 'Figtree Variable'))
      y += 19
    }
    if (sub) parts.push(centeredText(sub, cx, y + 4 + 11.5, 11.5, FONTS.ui, 600, isHome ? PRINT.onLeaf : PRINT.ink3, 'Figtree Variable'))
    parts.push('</g>')
  }

  for (const pl of layout.pills) {
    const text = `${pl.hidden.length} tucked away`
    const w = measure(text, 13, 700, 'Figtree Variable') + 28
    const y = pl.kind === 'anc' ? pl.at.y - 36 : pl.at.y
    parts.push(`<rect x="${r1(pl.at.x - w / 2)}" y="${r1(y)}" width="${r1(w)}" height="30" rx="15" fill="${PRINT.card}" stroke="${PRINT.ledge}" stroke-width="2"/>`)
    parts.push(centeredText(text, pl.at.x, y + 19.5, 13, FONTS.uiBold, 700, PRINT.ink2, 'Figtree Variable'))
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`
  return { svg, layout, width, height, pad }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
