import { editQuietly, useTree } from '../../store/treeStore'
import { newPhotoId, putPhoto } from '../../store/photos'
import { updatePerson } from '../../core/edit'

// The photo pipeline (PLAN 8.9): a square crop drawn to a 512 px canvas and saved as WebP (JPEG
// where the browser can't encode WebP), plus a 144 px thumbnail for tiles and chips.

export type CropArea = { x: number; y: number; width: number; height: number }

export const PHOTO_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,image/avif'

export async function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error("That file couldn't be opened as a picture. Try a JPEG or PNG.")
  } finally {
    if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

/** The biggest centered square, when no crop was chosen */
export const centerSquare = (img: HTMLImageElement): CropArea => {
  const s = Math.min(img.naturalWidth, img.naturalHeight)
  return { x: (img.naturalWidth - s) / 2, y: (img.naturalHeight - s) / 2, width: s, height: s }
}

let webp: boolean | null = null
function canEncodeWebp() {
  if (webp === null) {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    webp = c.toDataURL('image/webp').startsWith('data:image/webp')
  }
  return webp
}

function render(img: HTMLImageElement, area: CropArea, size: number): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size)
  const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg'
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("The photo couldn't be saved"))), type, 0.82),
  )
}

/** Crops, resizes and stores a photo, then points the person at it. One undo step unless quiet. */
export async function savePhoto(personId: string, img: HTMLImageElement, area: CropArea, opts: { quiet?: boolean } = {}) {
  const [full, thumb] = await Promise.all([render(img, area, 512), render(img, area, 144)])
  const id = newPhotoId()
  await putPhoto(id, full, thumb)
  const edit = (d: Parameters<typeof updatePerson>[0]) => updatePerson(d, personId, { photoId: id })
  if (opts.quiet) editQuietly(edit)
  else useTree.getState().edit(edit)
  return id
}
