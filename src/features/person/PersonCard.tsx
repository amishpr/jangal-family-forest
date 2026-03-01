import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sideClass, useSides } from '../../app/derive'
import { useTree } from '../../store/treeStore'
import { useUi, type Rect } from '../../store/uiStore'
import { reduceMotion, tileRect } from '../canvas/camera'
import { CardView } from './CardView'

// The person card (PLAN 7.1). It opens beside whatever you clicked: to the right if there's room,
// otherwise to the left, otherwise centered over it. It never goes under the top bar or the dock,
// only its middle scrolls, and switching between view and edit animates its size. On phones and
// short windows it's a bottom sheet instead. In edit mode it only closes from its own buttons.

// The editor isn't part of the read only family page
const CardEdit = __VIEWER__ ? null : lazy(() => import('./CardEdit'))

const SHEET_QUERY = '(max-width: 760px), (max-height: 540px)'
const sheetLike = () => matchMedia(SHEET_QUERY).matches

function placeCard(pop: HTMLElement, anchor: Rect | null) {
  if (sheetLike()) {
    pop.style.left = pop.style.top = pop.style.maxHeight = ''
    return
  }
  const M = 12
  const w = pop.offsetWidth
  const r = anchor ?? {
    left: innerWidth / 2 - 180,
    right: innerWidth / 2 + 180,
    top: 140,
    bottom: 140,
  }
  let left = r.right + 14
  if (left + w > innerWidth - M) left = r.left - 14 - w
  if (left < M) left = Math.min(Math.max(M, (r.left + r.right) / 2 - w / 2), innerWidth - w - M)
  // The chrome that actually sits above and below the card at this horizontal position
  const overlapping = (sel: string) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return b.width && left < b.right && left + w > b.left ? b : null
  }
  let top0 = M
  let bottom0 = innerHeight - M
  for (const sel of ['.brand', '.tabs', '.corner']) {
    const b = overlapping(sel)
    if (b) top0 = Math.max(top0, b.bottom + M)
  }
  const dock = overlapping('.dock')
  if (dock) bottom0 = Math.min(bottom0, dock.top - M)
  pop.style.maxHeight = `${Math.max(220, bottom0 - top0)}px`
  const top = Math.max(top0, Math.min((r.top || 140) - 10, bottom0 - pop.offsetHeight))
  pop.style.left = `${left}px`
  pop.style.top = `${top}px`
}

export default function PersonCard() {
  const card = useUi((s) => s.card)!
  const person = useTree((s) => s.doc?.people[card.id])
  const sides = useSides()
  const ref = useRef<HTMLDivElement>(null)
  const prevRect = useRef<{ id: string; mode: string; rect: DOMRect } | null>(null)
  const [, force] = useState(0)

  const anchor = useCallback(() => (useUi.getState().tab === 'tree' ? tileRect(card.id) : null) ?? card.anchor, [card])

  // Place it, and grow or shrink smoothly between the view and edit sizes
  useLayoutEffect(() => {
    const pop = ref.current
    if (!pop) return
    placeCard(pop, anchor())
    const prev = prevRect.current
    const to = pop.getBoundingClientRect()
    if (prev && prev.id === card.id && prev.mode !== card.mode && !sheetLike() && !reduceMotion()) {
      const f = prev.rect
      pop.animate(
        [
          { left: `${f.left}px`, top: `${f.top}px`, width: `${f.width}px`, height: `${f.height}px` },
          { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` },
        ],
        { duration: 320, easing: 'cubic-bezier(.3, 1.15, .5, 1)' },
      )
      pop.firstElementChild?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 90, fill: 'backwards' })
    }
    prevRect.current = { id: card.id, mode: card.mode, rect: to }
  }, [card, anchor, person])

  // Re-fit when its contents change size (extra fields, long notes) or the window resizes
  useEffect(() => {
    const pop = ref.current
    if (!pop) return
    let raf = 0
    const refit = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        placeCard(pop, anchor())
        if (ref.current) prevRect.current = { id: card.id, mode: card.mode, rect: ref.current.getBoundingClientRect() }
      })
    }
    const ro = new ResizeObserver(refit)
    ro.observe(pop)
    const body = pop.querySelector('.pop-body')
    if (body?.firstElementChild) ro.observe(body.firstElementChild)
    window.addEventListener('resize', refit)
    const mq = matchMedia(SHEET_QUERY)
    const onMq = () => force((n) => n + 1)
    mq.addEventListener('change', onMq)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', refit)
      mq.removeEventListener('change', onMq)
    }
  }, [card, anchor])

  // A card you're only looking at closes when you click elsewhere. One you're editing doesn't.
  useEffect(() => {
    if (card.mode !== 'view') return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element
      if (t.closest('.pop, .react-flow__node-person, .toast, .fan-center')) return
      useUi.getState().closeCard()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [card.mode])

  // Focus moves into the card, and back to the tile when it closes
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    if (card.mode === 'view') ref.current?.focus({ preventScroll: true })
    return () => {
      if (before?.isConnected && before.closest('.react-flow__node')) before.focus({ preventScroll: true })
    }
  }, [card.id, card.mode])

  // Someone removed while their card is open
  useEffect(() => {
    if (!person) useUi.getState().closeCard()
  }, [person])

  if (!person || !sides) return null
  const side = sideClass(sides, card.id)
  return (
    <div
      ref={ref}
      className={`pop ${side} ${card.mode}`}
      role="dialog"
      aria-labelledby="pop-title"
      aria-modal="false"
      tabIndex={-1}
    >
      {card.mode === 'edit' && CardEdit ? (
        <Suspense fallback={<CardView person={person} />}>
          <CardEdit key={card.id} person={person} />
        </Suspense>
      ) : (
        <CardView key={card.id} person={person} />
      )}
    </div>
  )
}
