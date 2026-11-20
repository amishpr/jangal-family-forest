import { useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Check } from '../../ui/icons'
import { loadImage } from './image'

// A square crop with zoom (PLAN P-4). Only loaded when someone picks a photo. It hands the crop to
// onCrop, so the person card saves it in the app and the fill-in page keeps it in its answers
// (SHARE.md SH-8). It uses no stores.

type Props = { file: File; onCrop: (img: HTMLImageElement, area: Area) => Promise<void>; onDone: () => void }

export default function PhotoCropper({ file, onCrop, onDone }: Props) {
  const src = useMemo(() => URL.createObjectURL(file), [file])
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Let go of the picture when the cropper closes
  const close = () => {
    URL.revokeObjectURL(src)
    onDone()
  }

  const save = async () => {
    if (!src || !area) return
    setBusy(true)
    setError(null)
    try {
      await onCrop(await loadImage(src), area)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : "That photo couldn't be saved")
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
          {error && (
            <p className="field-err" role="alert">
              {error}
            </p>
          )}
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
