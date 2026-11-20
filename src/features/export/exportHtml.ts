import gujaratiFont from '@fontsource-variable/noto-sans-gujarati/files/noto-sans-gujarati-gujarati-wght-normal.woff2?url'
import { stamp } from '../../core/dates'
import type { ExportedTree } from '../../core/model'
import { isLiving } from '../../core/model'
import { embedJson, escapeHtml, treeToJson } from '../../core/treeFile'
import { currentTreeDoc } from '../../store/treeStore'
import { blobToBase64, buildExport, fileBase } from './exportJson'
import { download } from './download'

// The family page (PLAN E-3, 8.10): one HTML file with the read only viewer and the tree inside
// it. It opens anywhere, even offline, and its security policy stops it making any request at all.

export type PageOptions = {
  photos: boolean
  /** Hide the birthdays, homes, notes, traits and photos of people who are living */
  hideLiving: boolean
  /** Traits can be health details, so they can be left out of the page (TODO.md TR-8) */
  traits: boolean
  /** The family titles in use, so the page opens with the same words (TODO.md TP-8) */
  titles: boolean
  /** Open as the person marked as you, or neutrally */
  openAs: 'me' | 'neutral'
}

export function applyPrivacy(tree: ExportedTree, opts: Pick<PageOptions, 'hideLiving' | 'openAs' | 'traits'>): ExportedTree {
  const out: ExportedTree = { ...tree, people: { ...tree.people } }
  if (opts.openAs === 'neutral') out.homePersonId = null
  if (!opts.traits) {
    for (const [id, p] of Object.entries(out.people)) if (p.tags) out.people[id] = { ...p, tags: undefined }
  }
  if (opts.hideLiving) {
    for (const [id, p] of Object.entries(out.people)) {
      if (!isLiving(p)) continue
      const year = p.birth?.date?.year
      out.people[id] = {
        ...p,
        birth: p.birth ? { ...p.birth, date: year ? { year } : undefined } : undefined,
        livesIn: undefined,
        notes: undefined,
        tags: undefined,
        photoId: undefined,
      }
    }
    // Photos nobody points to any more aren't sent
    if (out.photos) {
      const used = new Set(Object.values(out.people).map((p) => p.photoId).filter(Boolean))
      out.photos = Object.fromEntries(Object.entries(out.photos).filter(([id]) => used.has(id)))
    }
  }
  return out
}

export async function buildFamilyPage(opts: PageOptions): Promise<{ name: string; html: string }> {
  const doc = currentTreeDoc()
  if (!doc) throw new Error('There is no tree open')
  const res = await fetch(`${import.meta.env.BASE_URL}viewer-template.html`)
  if (!res.ok) throw new Error("The family page template couldn't be loaded. Check your connection and try again.")
  let html = await res.text()
  // Small photos keep the file light enough to email; tiles and cards never show them bigger
  const tree = applyPrivacy(await buildExport(doc, { photos: opts.photos, size: 'thumb', titles: opts.titles }), opts)
  const json = embedJson(treeToJson(tree))
  const DATA = '<script type="application/json" id="jangal-data">{}</script>'
  if (!html.includes(DATA)) throw new Error('The family page template is out of date. Reload the app and try again.')
  html = html.split(DATA).join(`<script type="application/json" id="jangal-data">${json}</script>`)
  // A function, so a "$'" in the title is written as it is, not read as a replacement pattern
  html = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(tree.title)}</title>`)
  // Gujarati text gets its font inside the file too, only when the tree has any
  if (/[઀-૿]/.test(json)) {
    const font = await blobToBase64(await (await fetch(gujaratiFont)).blob())
    html = html.replace(
      '<!--jangal:fonts-->',
      `<style>@font-face{font-family:'Noto Sans Gujarati Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format('woff2');unicode-range:U+0951-0952,U+0964-0965,U+0A80-0AFF,U+200C-200D,U+20B9,U+25CC,U+A830-A839}</style>`,
    )
  }
  return { name: `${fileBase(doc)}-${stamp()}.html`, html }
}

export async function exportFamilyPage(opts: PageOptions) {
  const { name, html } = await buildFamilyPage(opts)
  download(name, html, 'text/html')
  localStorage.setItem('jangal:last-export', new Date().toISOString())
}
