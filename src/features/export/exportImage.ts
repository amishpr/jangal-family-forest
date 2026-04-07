import sourceSansLatin from '@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url'
import figtreeLatin from '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url'
import { stamp } from '../../core/dates'
import { indexOf } from '../../core/index'
import type { TreeDoc } from '../../core/model'
import { titleSlug, treeTitle } from '../../core/title'
import { download } from './download'
import { blobToBase64 } from './exportJson'
import { FONTS, PRINT, renderTreeSvg, type SvgOptions } from './renderSvg'

// The tree as a picture (PLAN E-6): a PNG at twice the size, or an SVG with its fonts inside it,
// so the text looks the same on any computer.

async function fontFaces() {
  const [src, fig] = await Promise.all(
    [sourceSansLatin, figtreeLatin].map(async (u) => blobToBase64(await (await fetch(u)).blob())),
  )
  const face = (family: string, data: string, range: string) =>
    `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${data}) format('woff2');font-weight:${range}}`
  return [
    face(FONTS.name, src, '200 900'),
    face(FONTS.display, src, '200 900'),
    face(FONTS.ui, fig, '300 900'),
    face(FONTS.uiBold, fig, '300 900'),
  ].join('')
}

export async function exportImage(doc: TreeDoc, format: 'png' | 'svg', opts: Omit<SvgOptions, 'photos'> & { photos: boolean }) {
  const ix = indexOf(doc)
  const tree = await renderTreeSvg(ix, doc.homePersonId, doc.view, opts)
  const style = `<style>${await fontFaces()}</style><rect x="${-tree.pad}" y="${-tree.pad}" width="${tree.width}" height="${tree.height}" fill="${PRINT.bg}"/>`
  const svg = tree.svg.replace(/(<svg[^>]*>)/, `$1${style}`)
  const base = `${titleSlug(treeTitle(doc, ix))}-${stamp()}`
  if (format === 'svg') {
    download(`${base}.svg`, svg, 'image/svg+xml')
    return
  }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(2, 16000 / Math.max(tree.width, tree.height))
    const c = document.createElement('canvas')
    c.width = Math.round(tree.width * scale)
    c.height = Math.round(tree.height * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture was too big to make'))), 'image/png'))
    download(`${base}.png`, blob, 'image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
