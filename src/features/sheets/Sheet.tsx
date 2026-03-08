import { useEffect, useRef, type ReactNode } from 'react'
import { useUi } from '../../store/uiStore'
import { X } from '../../ui/icons'

// A sheet that rises above the dock (PLAN 7). It isn't modal: the tree stays visible and usable
// behind it, which is the point of Find and Relate. Esc closes it.

type Props = { title: ReactNode; label: string; children: ReactNode; wide?: boolean; hideTitle?: boolean; className?: string }

export function Sheet({ title, label, children, hideTitle, className = '' }: Props) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Focus the first field, or the sheet itself
    const first = el.querySelector<HTMLElement>('[data-autofocus], input:not([type=checkbox]):not([type=radio])')
    ;(first ?? el).focus({ preventScroll: true })
  }, [])
  const close = () => {
    const ui = useUi.getState()
    ui.openSheet(null)
    if (ui.sheet === 'relate' || ui.sheet === 'find') ui.setPath(null)
  }
  return (
    <section ref={ref} className={`sheet ${className}`} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button" className="round x" aria-label="Close" onClick={close}>
        <X />
      </button>
      {!hideTitle && <h2>{title}</h2>}
      {children}
    </section>
  )
}
