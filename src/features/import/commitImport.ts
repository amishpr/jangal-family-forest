import { nanoid } from 'nanoid'
import type { ExportedTree, TreeDoc } from '../../core/model'
import { emptyView } from '../../core/model'
import { newPhotoId, putPhoto } from '../../store/photos'
import { currentTreeDoc } from '../../store/treeStore'
import { openNewTree } from '../../app/boot'
import { centerSquare, loadImage } from '../person/photo'

// Committing an import (PLAN E-2): as a new tree by default, or replacing the open one. Photos get
// fresh ids, so two trees imported from the same file never share or overwrite a photo.

const base64ToBlob = (data: string, mime: string) => {
  const bin = atob(data.replace(/\s+/g, ''))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function thumbnail(blob: Blob): Promise<Blob> {
  const img = await loadImage(blob)
  const c = document.createElement('canvas')
  c.width = c.height = 144
  const a = centerSquare(img)
  c.getContext('2d')!.drawImage(img, a.x, a.y, a.width, a.height, 0, 0, 144, 144)
  return new Promise((resolve) => c.toBlob((b) => resolve(b ?? blob), 'image/webp', 0.82))
}

/** Stores a file's photos under new ids, and gives back its people pointing at them */
export async function importPhotos(tree: ExportedTree): Promise<TreeDoc['people']> {
  const photoIds = new Map<string, string>()
  for (const [oldId, ph] of Object.entries(tree.photos ?? {})) {
    try {
      const full = base64ToBlob(ph.data, ph.mime)
      const thumb = await thumbnail(full)
      const newId = newPhotoId()
      await putPhoto(newId, full, thumb)
      photoIds.set(oldId, newId)
    } catch {
      // A photo that can't be decoded is skipped; the person keeps their leaf
    }
  }
  const people: TreeDoc['people'] = {}
  for (const [pid, p] of Object.entries(tree.people)) {
    const photoId = p.photoId ? photoIds.get(p.photoId) : undefined
    people[pid] = { ...p, photoId }
    if (!photoId) delete people[pid].photoId
  }
  return people
}

export async function commitImport(tree: ExportedTree, mode: 'new' | 'replace') {
  const now = new Date().toISOString()
  const current = currentTreeDoc()
  const id = mode === 'replace' && current ? current.id : nanoid(10)
  const people = await importPhotos(tree)
  // Photos are stored on their own, and family titles belong to the browser, not the tree
  const { photos: _photos, titles: _titles, ...rest } = tree
  void _photos
  void _titles
  const doc: TreeDoc = {
    ...rest,
    id,
    people,
    view: tree.view ?? emptyView(),
    meta: { createdAt: tree.meta?.createdAt ?? now, updatedAt: now, app: 'jangal' },
  }
  await openNewTree(doc)
  return doc
}
