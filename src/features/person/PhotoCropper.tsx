import { useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { toast } from '../../app/actions'
import { Check } from '../../ui/icons'
import { loadImage, savePhoto } from './photo'

// A square crop with zoom (PLAN P-4). Only loaded when someone picks a photo.

export default function PhotoCropper({ file, personId, onDone }: { file: File; personId: string; onDone: () => void }) {
  const src = useMemo(() => URL.createObjectURL(file), [file])
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  // Let go of the picture when the cropper closes
  const close = () => {
    URL.revokeObjectURL(src)
    onDone()
  }

  const save = async () => {
    if (!src || !area) return
    setBusy(true)
    try {
      const img = await loadImage(src)
      await savePhoto(personId, img, area)
      toast('Photo saved')
      close()
    } catch (err) {
      toast(err instanceof Error ? err.message : "That photo couldn't be saved")
      setBusy(false)
    }
  }

  return (
    <>
      <div className="pop-body">
        <div className="crop">
          <div className="crop-area">
            {src && (
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, px) => setArea(px)}
                onMediaLoaded={() => undefined}
              />
            )}
          </div>
          <label className="fl">
            Zoom
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" />
          </label>
        </div>
      </div>
      <div className="pop-foot">
        <div className="row">
          <button type="button" className="chunky go" disabled={busy || !area} onClick={() => void save()}>
            <Check />
            {busy ? 'Saving' : 'Use this photo'}
          </button>
          <button type="button" className="chunky" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
