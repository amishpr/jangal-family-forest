import { useMemo } from 'react'
import { anchorId, visibleSets } from '../core/collapse'
import { yearsLabel } from '../core/dates'
import { indexOf, type TreeIndex } from '../core/index'
import { relation } from '../core/kinship'
import { layoutTree, type Layout } from '../core/layout/layout'
import type { TreeCore, TreeView } from '../core/model'
import { sidesOf, type Side, type Sides } from '../core/sides'
import { treeStats, treeTitle } from '../core/title'
import { customTitle, familyTitle, type Titles } from '../core/titles'
import { useSettings } from '../store/settings'
import { useTree } from '../store/treeStore'

// Everything the screens show that's worked out from the tree: labels, sides, the title and the
// layout. The core caches per tree version, so every tile can ask for its own label cheaply.

export const SIDE_CLASS: Record<Side, string> = { own: 's-own', paternal: 's-pat', maternal: 's-mat', other: 's-none' }

export const sideClass = (sides: Sides, id: string) => {
  const s = sides.side(id)
  return s ? SIDE_CLASS[s] : 's-none'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const ENGLISH: Titles = { lang: 'en', picks: {} }
type Rel = { text: string; titled: boolean }
const relCache = new WeakMap<TreeIndex, WeakMap<Titles, Map<string, Rel>>>()

function rel(ix: TreeIndex, home: string, id: string, titles: Titles): Rel {
  let byTitles = relCache.get(ix)
  if (!byTitles) relCache.set(ix, (byTitles = new WeakMap()))
  let m = byTitles.get(titles)
  if (!m) byTitles.set(titles, (m = new Map()))
  const k = `${home}>${id}`
  let v = m.get(k)
  if (!v) {
    // A custom title has no language: nothing says which one it's in (TODO.md CT-7)
    const own = customTitle(ix, home, id)
    const title = !own && familyTitle(ix, home, id, titles)
    m.set(k, (v = own ? { text: own, titled: false } : title ? { text: title, titled: true } : { text: cap(relation(ix, home, id).label), titled: false }))
  }
  return v
}

/**
 * "Mother", "First cousin", "You", or null in the neutral view. With family titles on, the title
 * where one fits: "Ba", "Kaka".
 */
export function relationTo(ix: TreeIndex, home: string | null, id: string, titles = ENGLISH): string | null {
  if (!home || !ix.person(home)) return null
  if (id === home) return 'You'
  return rel(ix, home, id, titles).text
}

/**
 * The language of what relationTo says, when it's a family title, for the element's lang (TODO.md
 * TP-9): screen readers then say "Kaka" the right way, and the browser picks fonts for its script.
 */
export function titleLangOf(ix: TreeIndex, home: string | null, id: string, titles = ENGLISH): string | undefined {
  if (!home || !ix.person(home) || id === home) return undefined
  return rel(ix, home, id, titles).titled ? titles.lang : undefined
}

/** In the neutral view people are described by their line: "Kapoor line", or "Married in" */
export function lineOf(sides: Sides, id: string): string {
  const { side, blood } = sides.info(id)
  if (!side) return 'Family'
  return blood ? sides.names[side] : 'Married in'
}

/** What a tile's tag says: how they're related to you, or their years in the neutral view */
export function tagFor(ix: TreeIndex, home: string | null, id: string, titles?: Titles): string {
  return relationTo(ix, home, id, titles) ?? yearsLabel(ix.person(id)!)
}

/** The birthplace city: "Sevilla" from "Sevilla, Spain" */
export const placeShort = (place?: string) => (place ? place.split(',')[0].trim() : '')

export function useDoc(): TreeCore | null {
  return useTree((s) => s.doc)
}

/** The graph index for the open tree, or null while loading */
export function useIndex(): TreeIndex | null {
  const people = useTree((s) => s.doc?.people)
  const families = useTree((s) => s.doc?.families)
  return useMemo(() => (people && families ? indexOf({ people, families }) : null), [people, families])
}

/** The family titles chosen in this browser */
export const useTitles = () => useSettings((s) => s.titles)

export function useHome(): string | null {
  return useTree((s) => s.doc?.homePersonId ?? null)
}

export function useSides(): Sides | null {
  const ix = useIndex()
  const home = useHome()
  return useMemo(() => (ix ? sidesOf(ix, home) : null), [ix, home])
}

export function useTitle() {
  const ix = useIndex()
  const title = useTree((s) => s.doc?.title ?? '')
  const titleAuto = useTree((s) => s.doc?.titleAuto ?? true)
  const subtitle = useTree((s) => s.doc?.subtitle ?? '')
  const showStats = useTree((s) => s.doc?.showStats ?? true)
  return useMemo(() => {
    if (!ix) return { title: '', subtitle: '', stats: '', showStats }
    return { title: treeTitle({ title, titleAuto }, ix), subtitle, stats: treeStats(ix), showStats }
  }, [ix, title, titleAuto, subtitle, showStats])
}

export type TreeLayout = { ix: TreeIndex; anchor: string | null; layout: Layout }

// Cached on the index and the view object, so every component asking gets the same layout
const layoutCache = new WeakMap<TreeIndex, WeakMap<TreeView, Map<string | null, TreeLayout>>>()

export function treeLayoutFor(ix: TreeIndex, home: string | null, view: TreeView): TreeLayout {
  let byView = layoutCache.get(ix)
  if (!byView) layoutCache.set(ix, (byView = new WeakMap()))
  let byHome = byView.get(view)
  if (!byHome) byView.set(view, (byHome = new Map()))
  let tl = byHome.get(home)
  if (!tl) {
    const anchor = anchorId(ix, home)
    const collapse = { collapsedFamilies: view.collapsedFamilies, collapsedAncestors: view.collapsedAncestors }
    const vis = visibleSets(ix, anchor, collapse)
    tl = { ix, anchor, layout: layoutTree(ix, vis, collapse, anchor) }
    byHome.set(home, tl)
  }
  return tl
}

/** The tree's layout. It only changes with the people, families, who is you, and what's tucked away. */
export function useTreeLayout(): TreeLayout | null {
  const ix = useIndex()
  const home = useHome()
  const view = useTree((s) => s.view)
  return ix ? treeLayoutFor(ix, home, view) : null
}

/** The current layout, for code outside React */
export function currentLayout(): TreeLayout | null {
  const { doc, view } = useTree.getState()
  return doc ? treeLayoutFor(indexOf(doc), doc.homePersonId, view) : null
}
