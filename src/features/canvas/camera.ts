import type { ReactFlowInstance } from '@xyflow/react'
import type { TreeIndex } from '../../core/index'
import { boundsOf, type Layout } from '../../core/layout/layout'
import { currentLayout } from '../../app/derive'

// The camera over the tree: fit, fly to people, zoom. Other parts of the app (Find, Relate, the
// person card) call these without holding a reference to the canvas. React Flow does the moving.

type Box = { x: number; y: number; w: number; h: number }
export type Insets = { l: number; r: number; t: number; b: number }

let flow: ReactFlowInstance | null = null
let host: HTMLElement | null = null

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 2.2

export function attachCamera(instance: ReactFlowInstance | null, el: HTMLElement | null) {
  flow = instance
  host = el
}

/** How far the camera is zoomed in: 1 is full size */
export const cameraZoom = () => flow?.getZoom() ?? 1

export const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const clamp = (k: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, k))

// The canvas is fixed to the whole window (canvas.css), so its box is the window's. Measuring it
// instead would make the browser lay out the whole tree first.
const hostBox = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight })

/** The viewport that fits a box inside the screen minus some insets, zoomed in no further than maxK */
function target(b: Box, insets: Insets, maxK: number) {
  const r = hostBox()
  const aw = Math.max(40, r.width - insets.l - insets.r)
  const ah = Math.max(40, r.height - insets.t - insets.b)
  const zoom = clamp(Math.min(aw / Math.max(b.w, 1), ah / Math.max(b.h, 1), maxK))
  return { zoom, x: insets.l + (aw - b.w * zoom) / 2 - b.x * zoom, y: insets.t + (ah - b.h * zoom) / 2 - b.y * zoom }
}

const safeTop = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-safe'))

// Fixed elements have no offsetParent, so "hidden" means no boxes at all (display: none)
const rectOf = (sel: string) => {
  const el = document.querySelector(sel)
  if (!el || el.getClientRects().length === 0) return null
  return el.getBoundingClientRect()
}

/**
 * Room around the tree when fitting. The title pill only gets room when a tile would otherwise
 * land under it, so the tree doesn't shrink for nothing (PLAN 6.12).
 */
export function fitInsets(b: Box): Insets {
  const base: Insets = { l: 40, r: 40, t: 110, b: 110 }
  const brand = rectOf('.brand')
  if (!brand) return base
  const t = target(b, base, 1)
  const hostRect = hostBox()
  const layout = currentLayout()?.layout
  const under = Object.values(layout?.nodes ?? {}).some((n) => {
    const left = hostRect.left + n.x * t.zoom + t.x
    const right = left + n.w * t.zoom
    const top = hostRect.top + n.y * t.zoom + t.y
    return left < brand.right + 8 && right > brand.left && top < brand.bottom + 8
  })
  return under ? { ...base, t: brand.bottom - hostRect.top + 16 } : base
}

export function flyToBox(b: Box | null, insets: Insets, maxK = 1, duration = 650) {
  if (!flow || !host || !b) return
  const to = target(b, insets, maxK)
  void flow.setViewport(to, { duration: reduceMotion() ? 0 : duration })
}

/** Fits the whole tree */
export function fitTree(duration = 500) {
  const layout = currentLayout()?.layout
  if (!layout) return
  flyToBox(layout.bounds, fitInsets(layout.bounds), 1, duration)
}

// On phones the tabs sit under the title pill, so the tree starts below both. The pill keeps that
// edge in --top-safe (BrandPill), and reading it is far cheaper than measuring, which would lay
// out the whole tree again.
const topInset = () =>
  window.innerWidth < 760 ? safeTop() || Math.max(rectOf('.brand')?.bottom ?? 0, rectOf('.tabs')?.bottom ?? 0) + 12 : 110

/**
 * Brings a new tile and its quick-add card on screen, only if they aren't already, and without
 * zooming (TODO.md CW-1). The card then doesn't move under your cursor while you type.
 */
export function panToNew(id: string) {
  const n = currentLayout()?.layout.nodes[id]
  if (!flow || !n) return
  const { x, y, zoom } = flow.getViewport()
  const r = hostBox()
  // How far to move one way to fit lo..hi between min and max, keeping the start in view
  const shift = (lo: number, hi: number, min: number, max: number) => (lo < min ? min - lo : hi > max ? Math.max(max - hi, min - lo) : 0)
  // Where the card will be: 280 wide, centered on the tile, about 360 tall (canvas.css
  // .quick-card), and never drawn smaller than full size (PersonTile). It can't be measured yet:
  // the canvas places a new tile a moment after it appears.
  const k = Math.max(zoom, 1)
  const cx = (n.x + n.w / 2) * zoom + x
  const top = n.y * zoom + y
  const dx = shift(cx - 140 * k, cx + 140 * k, 16, r.width - 16)
  const dy = shift(top, top + 360 * k, topInset(), r.height - 90)
  if (dx || dy) void flow.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: reduceMotion() ? 0 : 300 })
}

/**
 * Where the camera starts on a tree: the whole tree, or on a phone you and your parents. It's worked
 * out before the canvas mounts, so the right tiles are drawn the first time instead of being drawn
 * at the default spot, then thrown away when the camera moves (TODO.md F17).
 */
export function firstView(layout: Layout, ix: TreeIndex, home: string | null) {
  if (window.innerWidth < 760 && home && layout.nodes[home]) {
    const box = boundsOf([home, ...ix.parentsOf(home), ...ix.partnersOf(home)], layout)
    if (box) return target(box, { l: 16, r: 16, t: topInset(), b: 110 }, 0.7)
  }
  return target(layout.bounds, fitInsets(layout.bounds), 1)
}

/** Flies to some people, clear of the chrome at the top and any sheet or card at the bottom */
export function flyToPeople(ids: Iterable<string>, opts: { maxK?: number; bottom?: number; duration?: number; focus?: string } = {}) {
  const list = [...ids]
  const go = () => {
    const layout = currentLayout()?.layout
    if (!layout) return
    const sheet = rectOf('.sheet')
    const bottom = opts.bottom ?? (sheet ? Math.min(window.innerHeight - sheet.top + 30, window.innerHeight * 0.6) : 110)
    const narrow = window.innerWidth < 760
    const insets = { l: narrow ? 16 : 60, r: narrow ? 16 : 60, t: topInset(), b: bottom }
    const box = boundsOf(list, layout)
    // Too big to fit even zoomed all the way out, as a long path on a phone can be: show the person
    // who matters instead of the middle of the box
    const r = hostBox()
    const fits = box && box.w * MIN_ZOOM <= r.width - insets.l - insets.r && box.h * MIN_ZOOM <= r.height - insets.t - insets.b
    flyToBox(fits || !opts.focus ? box : boundsOf([opts.focus], layout), insets, opts.maxK ?? 1, opts.duration)
  }
  // A sheet that's opening may still be loading, and the camera needs its height
  let tries = 0
  const wait = () => {
    if (opts.bottom === undefined && document.body.dataset.sheet && !document.querySelector('.sheet') && tries++ < 40) {
      requestAnimationFrame(wait)
    } else go()
  }
  wait()
}

export function zoomBy(factor: number) {
  if (!flow) return
  void flow.zoomTo(clamp(flow.getZoom() * factor), { duration: reduceMotion() ? 0 : 200 })
}

/** Where a person's tile is on screen, if it's showing */
export function tileRect(id: string) {
  const el = document.querySelector(`.tile[data-id="${CSS.escape(id)}"]`)
  return el ? el.getBoundingClientRect() : null
}
