import { stamp } from '../../core/dates'
import { indexOf } from '../../core/index'
import type { ExportedTree, PhotoMime, TreeDoc } from '../../core/model'
import { titleSlug, treeTitle } from '../../core/title'
import { treeToJson } from '../../core/treeFile'
import { getPhoto } from '../../store/photos'
import { fileTitles } from '../../store/settings'
import { currentTreeDoc } from '../../store/treeStore'
import { BRAND } from '../../brand'
import { download } from './download'

// The backup file (PLAN E-1): the whole tree, who is marked as you, and the photos as base64.

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** The tree with its title written out, and its photos if asked for */
export async function buildExport(doc: TreeDoc, opts: { photos: boolean; size?: 'full' | 'thumb'; titles?: boolean }): Promise<ExportedTree> {
  const ix = indexOf(doc)
  const out: ExportedTree = { ...doc, title: treeTitle(doc, ix) }
  const titles = opts.titles ? fileTitles() : undefined
  if (titles) out.titles = titles
  if (!opts.photos) {
    out.people = Object.fromEntries(Object.entries(doc.people).map(([id, p]) => [id, p.photoId ? { ...p, photoId: undefined } : p]))
    return out
  }
  const photos: NonNullable<ExportedTree['photos']> = {}
  for (const p of Object.values(doc.people)) {
    if (!p.photoId || photos[p.photoId]) continue
    const blob = await getPhoto(p.photoId, opts.size ?? 'full')
    if (!blob) continue
    const mime = (['image/webp', 'image/jpeg', 'image/png'].includes(blob.type) ? blob.type : 'image/jpeg') as PhotoMime
    photos[p.photoId] = { mime, data: await blobToBase64(blob) }
  }
  if (Object.keys(photos).length) out.photos = photos
  return out
}

export const fileBase = (doc: TreeDoc) => titleSlug(treeTitle(doc, indexOf(doc)))

export async function exportBackup(includePhotos = true, includeTitles = true) {
  const doc = currentTreeDoc()
  if (!doc) return
  const tree = await buildExport(doc, { photos: includePhotos, titles: includeTitles })
  const schema = new URL(`${import.meta.env.BASE_URL}schema/v1.json`, location.origin).href
  download(`${fileBase(doc)}-${stamp()}.${BRAND.slug}.json`, treeToJson(tree, schema), 'application/json')
  localStorage.setItem('jangal:last-export', new Date().toISOString())
}
