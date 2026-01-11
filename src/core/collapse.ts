import type { TreeIndex } from './index'
import type { TreeView } from './model'
import { edgeKey, neighbors, type NodeKey } from './path'

// Tucking branches away (PLAN C-7). A family can hide its descendants, and a person can hide their
// ancestors. What's still visible is whatever can be reached from a reference point without
// crossing a cut link. The reference point is you, or in the neutral view the person with the most
// recorded ancestors (where the most lines meet). Families on that person's line can't be tucked
// away, so you can never hide yourself.

export type Collapse = Pick<TreeView, 'collapsedFamilies' | 'collapsedAncestors'>

const anchorCache = new WeakMap<TreeIndex, string | null>()

/** You, or in the neutral view the person with the most recorded ancestors (the youngest on a tie) */
export function anchorId(ix: TreeIndex, homeId: string | null): string | null {
  if (homeId && ix.person(homeId)) return homeId
  if (anchorCache.has(ix)) return anchorCache.get(ix)!
  let best: string | null = null
  let bestN = -1
  let bestYear = -Infinity
  for (const id of ix.ids) {
    const n = ix.ancestors(id).size
    const y = ix.person(id)!.birth?.date?.year ?? 0
    if (n > bestN || (n === bestN && y > bestYear)) [best, bestN, bestYear] = [id, n, y]
  }
  anchorCache.set(ix, best)
  return best
}

/** The anchor, their ancestors, and the families those people were born into */
export function homeLine(ix: TreeIndex, anchor: string | null) {
  const persons = new Set<string>(anchor ? [...ix.ancestors(anchor).keys()].filter((k) => !k.startsWith('family:')) : [])
  const fams = new Set<string>()
  for (const id of persons) {
    const bf = ix.birthFamilyOf(id)
    if (bf) fams.add(bf)
  }
  return { persons, fams }
}

export function canCollapseFamily(ix: TreeIndex, anchor: string | null, familyId: string) {
  const f = ix.family(familyId)
  return !!f && f.children.length > 0 && !homeLine(ix, anchor).fams.has(familyId)
}

export function canCollapseAncestors(ix: TreeIndex, anchor: string | null, personId: string) {
  return !!ix.birthFamilyOf(personId) && homeLine(ix, anchor).persons.has(personId)
}

export type Visible = { persons: Set<string>; fams: Set<string> }

/**
 * The tucks that apply from this anchor. A family on the anchor's own line can't be tucked away,
 * but one can be left from before: tucked while someone else was you, or by the sample, before the
 * neutral view picked an anchor inside it. It's ignored, so no one is cut off from their parents.
 */
export function activeCollapse(ix: TreeIndex, anchor: string | null, c: Collapse): Collapse {
  const line = homeLine(ix, anchor).fams
  const fams = c.collapsedFamilies.filter((f) => !line.has(f))
  return fams.length === c.collapsedFamilies.length ? c : { ...c, collapsedFamilies: fams }
}

export function visibleSets(ix: TreeIndex, anchor: string | null, given: Collapse): Visible {
  if (!anchor) return { persons: new Set(ix.ids), fams: new Set(Object.keys(ix.families)) }
  const c = activeCollapse(ix, anchor, given)
  const cut = new Set<string>()
  for (const fid of c.collapsedFamilies) {
    for (const ch of ix.family(fid)?.children ?? []) cut.add(`c:${fid}:${ch.personId}`)
  }
  for (const pid of c.collapsedAncestors) {
    for (const fid of ix.parentFamiliesOf(pid)) cut.add(`c:${fid}:${pid}`)
  }
  const start: NodeKey = `p:${anchor}`
  const seen = new Set<NodeKey>([start])
  const queue: NodeKey[] = [start]
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]
    for (const [n] of neighbors(ix, cur)) {
      const [pn, fn] = cur[0] === 'p' ? [cur, n] : [n, cur]
      if (cut.has(edgeKey(ix, fn.slice(2), pn.slice(2)))) continue
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  // People in no way connected to the anchor are still shown (a second, separate tree)
  const persons = new Set<string>()
  const fams = new Set<string>()
  for (const n of seen) (n[0] === 'p' ? persons : fams).add(n.slice(2))
  const reachableAtAll = connectedComponent(ix, anchor)
  for (const id of ix.ids) {
    if (!reachableAtAll.persons.has(id)) persons.add(id)
  }
  for (const fid of Object.keys(ix.families)) {
    if (!reachableAtAll.fams.has(fid)) fams.add(fid)
  }
  return { persons, fams }
}

const componentCache = new WeakMap<TreeIndex, Map<string, Visible>>()

function connectedComponent(ix: TreeIndex, anchor: string): Visible {
  let m = componentCache.get(ix)
  if (!m) componentCache.set(ix, (m = new Map()))
  let v = m.get(anchor)
  if (v) return v
  const start: NodeKey = `p:${anchor}`
  const seen = new Set<NodeKey>([start])
  const queue: NodeKey[] = [start]
  for (let i = 0; i < queue.length; i++) {
    for (const [n] of neighbors(ix, queue[i])) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  v = { persons: new Set(), fams: new Set() }
  for (const n of seen) (n[0] === 'p' ? v.persons : v.fams).add(n.slice(2))
  m.set(anchor, v)
  return v
}

/** The people who would come back if this one fold was opened */
export function hiddenBy(ix: TreeIndex, anchor: string | null, c: Collapse, kind: 'fam' | 'anc', id: string): string[] {
  const before = visibleSets(ix, anchor, c).persons
  const without: Collapse =
    kind === 'fam'
      ? { ...c, collapsedFamilies: c.collapsedFamilies.filter((x) => x !== id) }
      : { ...c, collapsedAncestors: c.collapsedAncestors.filter((x) => x !== id) }
  const after = visibleSets(ix, anchor, without).persons
  return [...after].filter((x) => !before.has(x))
}

/** Opens only the folds that hide this person (used by search). Returns the new collapse state, or null if nothing hides them. */
export function revealPerson(ix: TreeIndex, anchor: string | null, c: Collapse, id: string): Collapse | null {
  let cur: Collapse = { collapsedFamilies: [...c.collapsedFamilies], collapsedAncestors: [...c.collapsedAncestors] }
  let changed = false
  for (let guard = 0; guard < 50 && !visibleSets(ix, anchor, cur).persons.has(id); guard++) {
    const fam = cur.collapsedFamilies.find((f) => hiddenBy(ix, anchor, cur, 'fam', f).includes(id))
    const anc = cur.collapsedAncestors.find((p) => hiddenBy(ix, anchor, cur, 'anc', p).includes(id))
    if (fam) cur = { ...cur, collapsedFamilies: cur.collapsedFamilies.filter((x) => x !== fam) }
    else if (anc) cur = { ...cur, collapsedAncestors: cur.collapsedAncestors.filter((x) => x !== anc) }
    else cur = { collapsedFamilies: [], collapsedAncestors: [] }
    changed = true
  }
  return changed ? cur : null
}
