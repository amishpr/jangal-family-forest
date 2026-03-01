import type { ReactElement, ReactNode } from 'react'
import { useId } from 'react'
import { toast } from '../../app/actions'
import { useUi } from '../../store/uiStore'
import { centerSquare, loadImage, PHOTO_TYPES, savePhoto } from './photo'

// A hidden file picker behind whatever is clicked (the avatar). On a new tile the photo is saved
// straight away as a centered square. In the person card, the cropper opens instead.

type Props = {
  personId: string
  className?: string
  children: ReactElement | ReactNode
  /** Called with the file instead of saving it, to open the cropper */
  onPick?: (file: File) => void
}

export function PhotoInput({ personId, className, children, onPick }: Props) {
  const inputId = useId()
  return (
    <span className={className} style={{ display: 'contents' }}>
      <input
        id={inputId}
        type="file"
        accept={PHOTO_TYPES}
        hidden
        onChange={async (e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (!file) return
          if (onPick) return onPick(file)
          try {
            const img = await loadImage(file)
            // Adding a photo while naming a new tile belongs to the same undo step
            await savePhoto(personId, img, centerSquare(img), { quiet: useUi.getState().naming === personId })
            document.querySelector<HTMLInputElement>(`[data-name-for="${CSS.escape(personId)}"]`)?.focus()
          } catch (err) {
            toast(err instanceof Error ? err.message : "That photo couldn't be added")
          }
        }}
      />
      <label htmlFor={inputId} style={{ display: 'contents' }}>
        {children}
      </label>
    </span>
  )
}
