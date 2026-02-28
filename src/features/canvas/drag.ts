import type { PointerEvent as ReactPointerEvent } from 'react'
import { toast } from '../../app/actions'
import { currentLayout, type TreeLayout } from '../../app/derive'
import { resetChildOrder, setChildOrder } from '../../core/edit'
import { undo, useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { cameraZoom } from './camera'

// Moving a tile along its row among its brothers and sisters (TODO.md F18). Press and hold a tile,
// then drag it left or right; a quick drag still pans, as before. Alt+← and Alt+→ do the same from
// the keyboard. Only the order of a family's children changes, never who is related to whom.
//
// While a tile is held, the moving tiles are shifted with CSS (`translate`) rather than through
// React, so a drag costs no rendering. On drop, the order is saved as one edit, the layout runs
// again, and the shifts are cleared.

const HOLD_MS = 300
const SLOP = 6

/** A family's children on screen, left to right, and the one a tile moves with */
export type SiblingGroup = {
  familyId: string
  /** The children, left to right */
  order: string[]
  /** The child that moves: the tile itself, or for someone married in, their partner */
  child: string
  /** Everyone who moves with a child: them, and partners married in beside them */
  unit: (child: string) => string[]
}

/** Which family each person on screen is drawn as a child of */
const childFamilies = (tl: TreeLayout) => new Map(tl.layout.families.flatMap((f) => f.childSegs.map((s) => [s.cid, f.id] as const)))

/** The brothers and sisters a tile can move among, or null when it has none on screen */
export function siblingGroup(tl: TreeLayout, id: string, famOf = childFamilies(tl)): SiblingGroup | null {
  const { ix, layout } = tl
  const row = (x: string) => layout.nodes[x]?.y
  const child = famOf.has(id) ? id : ix.partnersOf(id).find((p) => famOf.has(p) && row(p) === row(id))
  if (!child) return null
  const familyId = famOf.get(child)!
  const order = (layout.families.find((f) => f.id === familyId)?.childSegs ?? [])
    .map((s) => s.cid)
    .filter((c) => layout.nodes[c])
    .sort((a, b) => layout.nodes[a].x - layout.nodes[b].x)
  if (order.length < 2) return null
  const unit = (c: string) => [c, ...ix.partnersOf(c).filter((p) => row(p) === row(c) && !famOf.has(p))]
  return { familyId, order, child, unit }
}

/** Everyone on screen who can be moved, for the tiles' keyboard hint */
export function movableIds(tl: TreeLayout): Set<string> {
  const famOf = childFamilies(tl)
  return new Set(Object.keys(tl.layout.nodes).filter((id) => siblingGroup(tl, id, famOf)))
}

const name = (id: string) => useTree.getState().doc?.people[id]?.firstName || 'Someone'

/** Saves a new order, and says what happened, with Undo */
function saveOrder(group: SiblingGroup, order: string[]) {
  const r = useTree.getState().edit((d) => setChildOrder(d, group.familyId, order))
  if (!r.ok) return toast(r.reason)
  const i = order.indexOf(group.child)
  const where = i < order.length - 1 ? `before ${name(order[i + 1])}` : `after ${name(order[i - 1])}`
  toast(`Moved ${name(group.child)} ${where}`, { label: 'Undo', run: () => undo() })
}

/** Alt+← and Alt+→ on a focused tile: one place left or right (TODO.md DR-3) */
export function moveAmongSiblings(id: string, by: -1 | 1) {
  const tl = currentLayout()
  const group = tl && siblingGroup(tl, id)
  if (!group) return toast(`${name(id)} has no brothers or sisters here to move among`)
  const order = [...group.order]
  const i = order.indexOf(group.child)
  const j = i + by
  if (j < 0 || j >= order.length) return toast(`${name(group.child)} is already ${by < 0 ? 'first' : 'last'}`)
  ;[order[i], order[j]] = [order[j], order[i]]
  saveOrder(group, order)
}

/** Shows a family's children by birth again (TODO.md DR-6) */
export function backToBirthOrder(familyId: string) {
  const r = useTree.getState().edit((d) => resetChildOrder(d, familyId))
  if (r.ok) toast('Back in birth order', { label: 'Undo', run: () => undo() })
}

let dragging = false
/** While a tile is being dragged, hovering other tiles shouldn't light them up */
export const isDragging = () => dragging

const nodeEl = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)

/** Whether tiles can be moved right now (TODO.md DR-8) */
function canDrag() {
  const ui = useUi.getState()
  return !ui.readOnly && !ui.naming && ui.card?.mode !== 'edit' && !(ui.sheet === 'relate' && ui.relate.picking)
}

/**
 * Starts watching a press on a tile (TODO.md DR-1, DR-4, DR-7). Held still for 300 ms, the tile and
 * anyone married in beside it lift and follow the pointer along the row, and the others slide
 * aside to show where it will land. Moving sooner is a pan, and the press lets go.
 */
export function pressTile(e: ReactPointerEvent, id: string) {
  if (e.button !== 0 || !e.isPrimary || (e.target as HTMLElement).closest('button, input, select, a') || !canDrag()) return
  const tl = currentLayout()
  const group = tl && siblingGroup(tl, id)
  if (!tl || !group) return
  const startX = e.clientX
  const startY = e.clientY
  const touch = e.pointerType === 'touch'
  let lifted = false
  let slot = group.order.indexOf(group.child)
  const nodes = tl.layout.nodes
  // Each child's unit: who moves with them, and where it sits along the row
  const units = group.order.map((c) => {
    const ids = group.unit(c)
    const left = Math.min(...ids.map((x) => nodes[x].x))
    const right = Math.max(...ids.map((x) => nodes[x].x + nodes[x].w))
    return { child: c, ids, left, right, center: (left + right) / 2 }
  })
  const mine = units.find((u) => u.child === group.child)!
  const others = units.filter((u) => u !== mine)
  const from = units.indexOf(mine)
  // The room the held tiles take up, and the gap after them, for sliding the others aside
  const step = mine.right - mine.left + (units[from + 1] ? units[from + 1].left - mine.right : mine.left - units[from - 1].right)

  const shift = (ids: string[], dx: number, cls?: string) => {
    for (const x of ids) {
      const el = nodeEl(x)
      if (!el) continue
      el.style.translate = dx ? `${dx}px 0` : ''
      if (cls) el.classList.add(cls)
    }
  }
  const clear = () => {
    for (const u of units) {
      for (const x of u.ids) {
        const el = nodeEl(x)
        if (!el) continue
        el.style.translate = ''
        el.classList.remove('lifted', 'shifting')
      }
    }
    document.querySelector('.world')?.classList.remove('dragging')
    dragging = false
  }

  const lift = () => {
    lifted = true
    dragging = true
    useUi.getState().setHover(null)
    if (touch) navigator.vibrate?.(12)
    shift(mine.ids, 0, 'lifted')
    for (const u of others) shift(u.ids, 0, 'shifting')
    document.querySelector('.world')?.classList.add('dragging')
  }
  const timer = setTimeout(lift, HOLD_MS)

  const move = (ev: PointerEvent | MouseEvent | TouchEvent) => {
    const p = 'touches' in ev ? ev.touches[0] : ev
    if (!p) return
    if (!lifted) {
      // Moving before the hold is up is a pan: let go and leave it to the canvas
      if (Math.hypot(p.clientX - startX, p.clientY - startY) > SLOP) end()
      return
    }
    // Held: this gesture belongs to the tile, so the canvas never sees it and doesn't pan. The
    // canvas listens on the window too, so stopping the event here has to stop it there as well.
    ev.stopImmediatePropagation()
    if (ev.cancelable) ev.preventDefault()
    if (ev.type !== 'pointermove') return
    const dx = (p.clientX - startX) / cameraZoom()
    // Not past the ends of the group
    const lo = units[0].left - mine.left
    const hi = units[units.length - 1].right - mine.right
    const x = Math.max(lo, Math.min(hi, dx))
    shift(mine.ids, x)
    const center = mine.center + x
    slot = others.filter((u) => u.center < center).length
    // The others between where it was and where it would land slide aside
    others.forEach((u, k) => {
      const at = k < from ? k : k + 1
      const by = at > from && k < slot ? -step : at < from && k >= slot ? step : 0
      shift(u.ids, by)
    })
  }

  const drop = () => {
    const order = others.map((u) => u.child)
    order.splice(slot, 0, mine.child)
    const changed = order.some((c, i) => c !== group.order[i])
    if (changed) saveOrder(group, order)
    // Once the layout has drawn the new order, the shifts come off
    requestAnimationFrame(clear)
  }

  const swallowClick = (ev: MouseEvent) => {
    ev.stopImmediatePropagation()
    ev.preventDefault()
  }
  const noMenu = (ev: Event) => ev.preventDefault()
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !lifted) return
    // Esc puts it back, and doesn't also close whatever else is open
    ev.stopImmediatePropagation()
    lifted = false
    end()
    clear()
  }

  function end(ev?: Event) {
    clearTimeout(timer)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('mousemove', move, true)
    window.removeEventListener('touchmove', move, true)
    window.removeEventListener('pointerup', end, true)
    window.removeEventListener('pointercancel', cancel, true)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('contextmenu', noMenu, true)
    if (!lifted) return
    lifted = false
    if (ev?.type === 'pointerup') {
      // The click that follows letting go mustn't open the card
      window.addEventListener('click', swallowClick, true)
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 60)
      drop()
    } else clear()
  }
  function cancel() {
    end()
    clear()
  }

  window.addEventListener('pointermove', move, true)
  window.addEventListener('mousemove', move, true)
  window.addEventListener('touchmove', move, { capture: true, passive: false })
  window.addEventListener('pointerup', end, true)
  window.addEventListener('pointercancel', cancel, true)
  window.addEventListener('keydown', onKey, true)
  if (touch) window.addEventListener('contextmenu', noMenu, true)
}
