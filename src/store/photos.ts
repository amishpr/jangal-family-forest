import { del, get, keys, set } from 'idb-keyval'
import { useEffect, useSyncExternalStore } from 'react'
import { nanoid } from 'nanoid'
import { store } from './persist'

// Photos (PLAN 8.9). Each photo is kept twice in IndexedDB: a 512 px square for the person card,
// the fan chart and the PDF, and a 144 px thumbnail for tiles and chips, so a big tree never decodes
// hundreds of large images. They stay out of the undo history, which keeps it small.

export type PhotoSize = 'thumb' | 'full'

const key = (id: string, size: PhotoSize) => `photo:${id}:${size}`

const urls = new Map<string, string>()
// The exported page has no database: photos only come from registerInlinePhotos
let inlineOnly = false
export const setInlinePhotosOnly = () => {
  inlineOnly = true
}
const pending = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((fn) => fn())
}

export const newPhotoId = () => `ph_${nanoid(10)}`

/** Saves a photo. The full size can come later: until then the thumbnail stands in for it. */
export async function putPhoto(id: string, full: Blob | null, thumb: Blob) {
  if (full) await set(key(id, 'full'), full, store())
  await set(key(id, 'thumb'), thumb, store())
  // Avatars already on screen show the photo straight away, even if they asked for it before it arrived
  for (const [size, blob] of [['full', full ?? thumb], ['thumb', thumb]] as const) {
    const k = key(id, size)
    const old = urls.get(k)
    if (old) URL.revokeObjectURL(old)
    urls.set(k, URL.createObjectURL(blob))
  }
  emit()
}

export async function getPhoto(id: string, size: PhotoSize = 'full'): Promise<Blob | null> {
  return (await get<Blob>(key(id, size), store())) ?? null
}

async function load(id: string, size: PhotoSize) {
  const k = key(id, size)
  if (pending.has(k) || urls.has(k) || inlineOnly) return
  pending.add(k)
  try {
    // Either size stands in for the other until it's saved
    const blob = (await getPhoto(id, size)) ?? (await getPhoto(id, size === 'thumb' ? 'full' : 'thumb'))
    if (blob) {
      urls.set(k, URL.createObjectURL(blob))
      emit()
    }
  } finally {
    pending.delete(k)
  }
}

/** The exported page carries its photos inside it, as data URLs (PLAN 8.10) */
export function registerInlinePhotos(photos: Record<string, { mime: string; data: string }> | undefined) {
  for (const [id, ph] of Object.entries(photos ?? {})) {
    const url = `data:${ph.mime};base64,${ph.data}`
    urls.set(key(id, 'full'), url)
    urls.set(key(id, 'thumb'), url)
  }
  emit()
}

/** Removes photos no one in any saved tree points to any more */
export async function cleanOrphanPhotos(inUse: Set<string>) {
  const all = (await keys(store())).filter((k): k is string => typeof k === 'string' && k.startsWith('photo:'))
  for (const k of all) {
    const id = k.split(':')[1]
    if (!inUse.has(id)) await del(k, store())
  }
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The object URL for a photo, loading it the first time it's asked for */
export function usePhotoUrl(id: string | undefined, size: PhotoSize): string | null {
  // Each avatar reads only its own URL, so a photo arriving rerenders only the avatars showing it
  const url = useSyncExternalStore(subscribe, () => (id ? (urls.get(key(id, size)) ?? null) : null))
  useEffect(() => {
    if (id) void load(id, size)
  }, [id, size])
  return url
}

/** Changes whenever any photo is added or replaced */
export const photosVersion = () => version

/** For code outside React (exports): the photo as a data URL */
export async function photoDataUrl(id: string, size: PhotoSize = 'full'): Promise<string | null> {
  const blob = (await getPhoto(id, size)) ?? (await getPhoto(id, size === 'thumb' ? 'full' : 'thumb'))
  if (!blob) return null
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
