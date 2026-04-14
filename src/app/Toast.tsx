import { useEffect } from 'react'
import { useUi } from '../store/uiStore'

// A short message at the top, sometimes with one action like Undo (PLAN 6.7)

export function Toast() {
  const toast = useUi((s) => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useUi.getState().hideToast(), toast.action ? 5000 : 3200)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
      {toast && (
        <>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                useUi.getState().hideToast()
                toast.action!.run()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </>
      )}
    </div>
  )
}
