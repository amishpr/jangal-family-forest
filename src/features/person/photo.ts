import { editQuietly, useTree } from '../../store/treeStore'
import { newPhotoId, putPhoto } from '../../store/photos'
import { updatePerson } from '../../core/edit'
import { cropToBlob, type CropArea } from './image'

// The photo pipeline (PLAN 8.9): a square crop drawn to a 512 px canvas and saved as WebP (JPEG
// where the browser can't encode WebP), plus a 144 px thumbnail for tiles and chips. The canvas
// work is in image.ts, which the fill-in page shares.

export { centerSquare, loadImage, PHOTO_TYPES, type CropArea } from './image'

/** Crops, resizes and stores a photo, then points the person at it. One undo step unless quiet. */
export async function savePhoto(personId: string, img: HTMLImageElement, area: CropArea, opts: { quiet?: boolean } = {}) {
  const [full, thumb] = await Promise.all([cropToBlob(img, area, 512), cropToBlob(img, area, 144)])
  const id = newPhotoId()
  await putPhoto(id, full, thumb)
  const edit = (d: Parameters<typeof updatePerson>[0]) => updatePerson(d, personId, { photoId: id })
  if (opts.quiet) editQuietly(edit)
  else useTree.getState().edit(edit)
  return id
}
