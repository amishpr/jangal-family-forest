import type { ChildKind, Family, Person, TreeCore } from './model'
import { isPet } from './model'

// The graph index (PLAN 8.5): parents, children, partners and siblings for every person, built once
// per change. Everything else (labels, sides, collapse, layout) reads from it.
//
// Immer keeps `people` and `families` as the same objects until one of them changes, so the index
// is cached on those two objects: editing the title, or who is marked as you, reuses it.

export type TreeIndex = {
  people: Record<string, Person>
  families: Record<string, Family>
  /** Everyone, in document order */
  ids: string[]
  /** Document order, for stable sorting */
  order: Map<string, number>
  person(id: string): Person | undefined
  family(id: string): Family | undefined
  /** The family someone was born or adopted into, if any */
  birthFamilyOf(id: string): string | undefined
  /** Every family that lists this person as a child */
  parentFamiliesOf(id: string): string[]
  /** Families where this person is a partner */
  familiesOf(id: string): string[]
  parentsOf(id: string): string[]
  childrenOf(id: string): string[]
  partnersOf(id: string): string[]
  siblingsOf(id: string): string[]
  childKind(familyId: string, childId: string): ChildKind
  partnerFamilyBetween(a: string, b: string): Family | undefined
  /**
   * Ancestors with their distance, including the person at distance 0. A birth family with no
   * recorded parents appears as one ancestor keyed "family:<id>".
   */
  ancestors(id: string): Map<string, number>
  /** Descendants with their distance, including the person at distance 0 */
  descendants(id: string): Map<string, number>
}

const cache = new WeakMap<object, WeakMap<object, TreeIndex>>()

export function indexOf(doc: Pick<TreeCore, 'people' | 'families'>): TreeIndex {
  let inner = cache.get(doc.people)
  if (!inner) cache.set(doc.people, (inner = new WeakMap()))
  let ix = inner.get(doc.families)
  if (!ix) inner.set(doc.families, (ix = buildIndex(doc.people, doc.families)))
  return ix
}

const EMPTY: string[] = []

function buildIndex(people: Record<string, Person>, families: Record<string, Family>): TreeIndex {
  const ids = Object.keys(people)
  const order = new Map(ids.map((id, i) => [id, i]))
  const partnerFams = new Map<string, string[]>()
  const parentFams = new Map<string, string[]>()
  const birthFam = new Map<string, string>()
  const birthKind = new Map<string, ChildKind>()
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const list = m.get(k)
    if (list) list.push(v)
    else m.set(k, [v])
  }

  for (const f of Object.values(families)) {
    for (const pid of f.partnerIds) if (people[pid]) push(partnerFams, pid, f.id)
    for (const c of f.children) {
      if (!people[c.personId]) continue
      push(parentFams, c.personId, f.id)
      // A biological family wins over any other, otherwise the first family listed
      const had = birthKind.get(c.personId)
      if (!had || (had !== 'biological' && c.kind === 'biological')) {
        birthFam.set(c.personId, f.id)
        birthKind.set(c.personId, c.kind)
      }
    }
  }

  const memo = <T>(fn: (id: string) => T) => {
    const m = new Map<string, T>()
    return (id: string) => {
      let v = m.get(id)
      if (v === undefined) m.set(id, (v = fn(id)))
      return v
    }
  }

  const familiesOf = (id: string) => partnerFams.get(id) ?? EMPTY
  const parentsOf = memo((id: string) => {
    const fid = birthFam.get(id)
    return fid ? families[fid].partnerIds.filter((p) => people[p]) : EMPTY
  })
  const childrenOf = memo((id: string) =>
    familiesOf(id).flatMap((fid) => families[fid].children.map((c) => c.personId).filter((c) => people[c])),
  )
  const partnersOf = memo((id: string) =>
    familiesOf(id).flatMap((fid) => families[fid].partnerIds.filter((p) => p !== id && people[p])),
  )
  // Pets live in their owners' family as children, but they aren't anyone's brothers or sisters (TODO.md F14)
  const siblingsOf = memo((id: string) => {
    const out = new Set<string>()
    if (isPet(people[id])) return []
    for (const par of parentsOf(id)) for (const c of childrenOf(par)) if (c !== id) out.add(c)
    const fid = birthFam.get(id)
    if (fid) for (const c of families[fid].children) if (c.personId !== id && people[c.personId]) out.add(c.personId)
    return [...out].filter((c) => !isPet(people[c]))
  })

  const walk = (next: (id: string) => string[]) =>
    memo((id: string) => {
      const out = new Map<string, number>([[id, 0]])
      const queue = [id]
      for (let i = 0; i < queue.length; i++) {
        const cur = queue[i]
        const d = out.get(cur)! + 1
        for (const n of next(cur)) {
          if (!out.has(n)) {
            out.set(n, d)
            queue.push(n)
          }
        }
      }
      return out
    })

  // Walking up: a birth family with no recorded parents ("unknown parents", PLAN R-6) stands in as
  // one shared ancestor, so the siblings grouped under it are still siblings, and their children
  // still cousins. Its key starts with "family:", which a person id never does.
  const upward = (id: string): string[] => {
    if (id.startsWith('family:')) return EMPTY
    const ps = parentsOf(id)
    if (ps.length) return ps
    const fid = birthFam.get(id)
    return fid ? [`family:${fid}`] : EMPTY
  }

  return {
    people,
    families,
    ids,
    order,
    person: (id) => people[id],
    family: (id) => families[id],
    birthFamilyOf: (id) => birthFam.get(id),
    parentFamiliesOf: (id) => parentFams.get(id) ?? EMPTY,
    familiesOf,
    parentsOf,
    childrenOf,
    partnersOf,
    siblingsOf,
    childKind: (fid, cid) => families[fid]?.children.find((c) => c.personId === cid)?.kind ?? 'biological',
    partnerFamilyBetween: (a, b) =>
      familiesOf(a)
        .map((fid) => families[fid])
        .find((f) => f.partnerIds.includes(b)),
    ancestors: walk(upward),
    descendants: walk(childrenOf),
  }
}
