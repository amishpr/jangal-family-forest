import type { TreeIndex } from './index'
import type { ChildKind, Person } from './model'
import { isPet, wordGender } from './model'
import { findPath } from './path'

// Relationship labels (PLAN 8.5): "B is A's ___", in plain words. Blood first, through the closest
// common ancestor. Then one marriage hop (in-laws and step family). Otherwise a sentence built from
// the path. Words are gendered for male and female and neutral for unknown and other.

const W = {
  parent: { m: 'father', f: 'mother', n: 'parent' },
  child: { m: 'son', f: 'daughter', n: 'child' },
  sibling: { m: 'brother', f: 'sister', n: 'sibling' },
  half: { m: 'half brother', f: 'half sister', n: 'half sibling' },
  grandparent: { m: 'grandfather', f: 'grandmother', n: 'grandparent' },
  grandchild: { m: 'grandson', f: 'granddaughter', n: 'grandchild' },
  aunt: { m: 'uncle', f: 'aunt', n: "parent's sibling" },
  niece: { m: 'nephew', f: 'niece', n: "sibling's child" },
  spouse: { m: 'husband', f: 'wife', n: 'spouse' },
  partner: { m: 'partner', f: 'partner', n: 'partner' },
  fiance: { m: 'fiancé', f: 'fiancée', n: 'fiancé' },
  ex: { m: 'former husband', f: 'former wife', n: 'former partner' },
  late: { m: 'late husband', f: 'late wife', n: 'late spouse' },
  parentInLaw: { m: 'father-in-law', f: 'mother-in-law', n: 'parent-in-law' },
  childInLaw: { m: 'son-in-law', f: 'daughter-in-law', n: 'child-in-law' },
  siblingInLaw: { m: 'brother-in-law', f: 'sister-in-law', n: 'sibling-in-law' },
  stepParent: { m: 'stepfather', f: 'stepmother', n: 'stepparent' },
  stepChild: { m: 'stepson', f: 'stepdaughter', n: 'stepchild' },
  stepSibling: { m: 'stepbrother', f: 'stepsister', n: 'stepsibling' },
  stepGrandparent: { m: 'step-grandfather', f: 'step-grandmother', n: 'step-grandparent' },
  adoptiveParent: { m: 'adoptive father', f: 'adoptive mother', n: 'adoptive parent' },
  adoptedChild: { m: 'adopted son', f: 'adopted daughter', n: 'adopted child' },
  fosterParent: { m: 'foster father', f: 'foster mother', n: 'foster parent' },
  fosterChild: { m: 'foster son', f: 'foster daughter', n: 'foster child' },
  auntByMarriage: { m: 'uncle by marriage', f: 'aunt by marriage', n: 'aunt or uncle by marriage' },
} as const

type WordKey = keyof typeof W
const word = (key: WordKey, p: Person | undefined) => W[key][wordGender(p)]
const greats = (n: number) => (n <= 0 ? '' : 'great-'.repeat(n))
const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times']
const ordinal = (n: number) => ORD[n] ?? `${n}th`

export type BloodKey = 'parent' | 'grandparent' | 'child' | 'grandchild' | 'sibling' | 'niece' | 'aunt' | 'cousin'

export type Relation = {
  label: string
  blood: boolean
  key?: BloodKey
  /** self: the same person. partner: a partnership. marriage: only a longer chain through marriages. none: no link */
  kind?: 'self' | 'partner' | 'marriage' | 'none'
}

export const isEx = (status: string | undefined) => status === 'divorced' || status === 'separated'

/** husband, wife, partner, former wife... or null if they aren't partners */
export function partnerWord(ix: TreeIndex, a: string, b: string): string | null {
  const f = ix.partnerFamilyBetween(a, b)
  if (!f) return null
  const bp = ix.person(b)
  if (isEx(f.status)) return word('ex', bp)
  if (f.status === 'partners') return word('partner', bp)
  if (f.status === 'engaged') return word('fiance', bp)
  if (f.status === 'widowed' && bp && (bp.deceased || bp.death)) return word('late', bp)
  return word('spouse', bp)
}

/** The kind of the link from a parent to a child, if b is a's child */
export function linkKind(ix: TreeIndex, parent: string, child: string): ChildKind | null {
  const fid = ix.birthFamilyOf(child)
  if (!fid || !ix.family(fid)!.partnerIds.includes(parent)) return null
  return ix.childKind(fid, child)
}

/** The closest common ancestor of two people, and how many generations up it is from each */
export function closestAncestor(ix: TreeIndex, a: string, b: string): { id: string; da: number; db: number } | null {
  if (a === b) return null
  const B = ix.ancestors(b)
  let best: { id: string; da: number; db: number } | null = null
  for (const [id, da] of ix.ancestors(a)) {
    const db = B.get(id)
    if (db !== undefined && (!best || da + db < best.da + best.db)) best = { id, da, db }
  }
  return best
}

/** "B is A's ___" through blood (or adoption) only */
export function bloodRelation(ix: TreeIndex, a: string, b: string): { key: BloodKey; label: string } | null {
  const best = closestAncestor(ix, a, b)
  if (!best) return null
  const { da, db } = best
  const bp = ix.person(b)
  const n = wordGender(bp) === 'n'

  if (db === 0) {
    if (da === 1) {
      const kind = linkKind(ix, b, a)
      const key: WordKey = kind === 'step' ? 'stepParent' : kind === 'foster' ? 'fosterParent' : 'parent'
      return { key: 'parent', label: word(key, bp) }
    }
    return { key: 'grandparent', label: greats(da - 2) + word('grandparent', bp) }
  }
  if (da === 0) {
    if (db === 1) {
      const kind = linkKind(ix, a, b)
      const key: WordKey = kind === 'step' ? 'stepChild' : kind === 'foster' ? 'fosterChild' : 'child'
      return { key: 'child', label: word(key, bp) }
    }
    return { key: 'grandchild', label: greats(db - 2) + word('grandchild', bp) }
  }
  if (da === 1 && db === 1) {
    // Full siblings share both parents. Sharing one is a half sibling.
    const pa = ix.parentsOf(a)
    const pb = new Set(ix.parentsOf(b))
    const shared = pa.filter((p) => pb.has(p)).length
    const full =
      (pa.length >= 2 && shared === pa.length && pb.size === pa.length) ||
      (!!ix.birthFamilyOf(a) && ix.birthFamilyOf(a) === ix.birthFamilyOf(b))
    return { key: 'sibling', label: word(full ? 'sibling' : 'half', bp) }
  }
  if (da === 1) {
    const g = db - 2
    if (g === 0) return { key: 'niece', label: word('niece', bp) }
    return {
      key: 'niece',
      label: n ? `sibling's ${greats(g - 1)}grandchild` : `${greats(g - 1)}grand${word('niece', bp)}`,
    }
  }
  if (db === 1) {
    const g = da - 2
    if (g === 0) return { key: 'aunt', label: word('aunt', bp) }
    return {
      key: 'aunt',
      label: n ? `${greats(g - 1)}grandparent's sibling` : `${greats(g)}${word('aunt', bp)}`,
    }
  }
  const degree = Math.min(da, db) - 1
  const removed = Math.abs(da - db)
  const times = TIMES[removed] ?? `${removed} times`
  return { key: 'cousin', label: `${ordinal(degree)} cousin${removed ? ` ${times} removed` : ''}` }
}

/** Full relationship: B is A's ___ */
export function relation(ix: TreeIndex, a: string, b: string): Relation {
  if (a === b) return { label: 'you', blood: true, kind: 'self' }
  // A pet is named from its owners: "dog", or "first cousin's cat" (TODO.md F14)
  const pet = ix.person(b)?.species
  if (pet) {
    const owners = ix.parentsOf(b)
    if (owners.includes(a)) return { label: pet.toLowerCase(), blood: false }
    const rs = owners.map((o) => relation(ix, a, o))
    const r = rs.find((x) => !x.kind || x.kind === 'partner')
    if (r) return { label: `${r.label}'s ${pet.toLowerCase()}`, blood: false }
    return rs.find((x) => x.kind === 'marriage') ?? { label: 'not connected yet', blood: false, kind: 'none' }
  }
  if (isPet(ix.person(a))) return ix.parentsOf(a).includes(b) ? { label: 'owner', blood: false } : { label: 'not connected yet', blood: false, kind: 'none' }
  const pw = partnerWord(ix, a, b)
  if (pw) return { label: pw, blood: false, kind: 'partner' }
  const r = bloodRelation(ix, a, b)
  if (r) return { label: r.label, blood: true, key: r.key }
  const bp = ix.person(b)

  // b is the partner of one of a's blood relatives
  for (const q of ix.partnersOf(b)) {
    const rq = bloodRelation(ix, a, q)
    if (!rq) continue
    const f = ix.partnerFamilyBetween(q, b)
    if (f && isEx(f.status)) return { label: `${rq.label}'s ${word('ex', bp)}`, blood: false }
    if (rq.key === 'sibling') return { label: word('siblingInLaw', bp), blood: false }
    if (rq.key === 'child') return { label: word('childInLaw', bp), blood: false }
    if (rq.key === 'parent') return { label: word('stepParent', bp), blood: false }
    if (rq.key === 'grandparent') {
      const g = rq.label.split('great-').length - 1
      return { label: greats(g) + word('stepGrandparent', bp), blood: false }
    }
    if (rq.key === 'aunt' && !rq.label.includes('great')) return { label: word('auntByMarriage', bp), blood: false }
    return { label: `${rq.label}'s ${word('spouse', bp)}`, blood: false }
  }

  // b is a blood relative of one of a's partners
  for (const q of ix.partnersOf(a)) {
    const rq = bloodRelation(ix, q, b)
    if (!rq) continue
    const f = ix.partnerFamilyBetween(a, q)
    if (f && isEx(f.status)) return { label: `${partnerWord(ix, a, q)}'s ${rq.label}`, blood: false }
    if (rq.key === 'parent') return { label: word('parentInLaw', bp), blood: false }
    if (rq.key === 'sibling') return { label: word('siblingInLaw', bp), blood: false }
    if (rq.key === 'child') return { label: word('stepChild', bp), blood: false }
    return { label: `${partnerWord(ix, a, q)}'s ${rq.label}`, blood: false }
  }

  // b is the child of a's stepparent (a parent's partner who isn't a's parent)
  const parents = ix.parentsOf(a)
  for (const par of parents) {
    for (const step of ix.partnersOf(par)) {
      if (parents.includes(step)) continue
      if (ix.childrenOf(step).includes(b)) return { label: word('stepSibling', bp), blood: false }
    }
  }

  // a partner's sibling's partner: co-sibling-in-law
  for (const q of ix.partnersOf(a)) {
    for (const r of ix.partnersOf(b)) {
      if (bloodRelation(ix, q, r)?.key === 'sibling') return { label: word('siblingInLaw', bp), blood: false }
    }
  }

  if (!findPath(ix, a, b)) return { label: 'not connected yet', blood: false, kind: 'none' }
  return { label: 'related by marriage', blood: false, kind: 'marriage' }
}

const first = (ix: TreeIndex, id: string) => ix.person(id)?.firstName || 'Someone'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** For the UI: "Anika is your first cousin", or "Anika is Iris's first cousin" in the neutral view */
export function sentence(ix: TreeIndex, a: string, b: string, homeId: string | null): string {
  if (a === b) return a === homeId ? 'This is you' : `This is ${first(ix, a)}`
  const r = relation(ix, a, b)
  if (r.kind === 'none') return `There's no link between ${first(ix, a)} and ${first(ix, b)} in this tree yet`
  if (r.kind === 'marriage') {
    return marriageBridge(ix, a, b) ?? `${first(ix, b)} and ${first(ix, a)} are related by marriage`
  }
  const whose = a === homeId ? 'your' : `${first(ix, a)}'s`
  return `${first(ix, b)} is ${whose} ${r.label}`
}

/** The big answer in the Relate sheet: "First cousin" */
export function headline(ix: TreeIndex, a: string, b: string): string {
  const r = relation(ix, a, b)
  if (r.kind === 'marriage') return 'Family by marriage'
  if (r.kind === 'none') return 'Not connected yet'
  return cap(r.label)
}

/** "Iris's uncle Daniel is married to Anika's aunt Priya" */
export function marriageBridge(ix: TreeIndex, a: string, b: string): string | null {
  const path = findPath(ix, a, b)
  if (!path) return null
  const ps = path.persons
  for (let i = 0; i < ps.length - 1; i++) {
    const x = ps[i]
    const y = ps[i + 1]
    const f = ix.partnerFamilyBetween(x, y)
    if (!f) continue
    const rx = x === a ? null : bloodRelation(ix, a, x)
    const ry = y === b ? null : bloodRelation(ix, b, y)
    const left = x === a ? first(ix, a) : `${first(ix, a)}'s ${rx ? rx.label : 'relative'} ${first(ix, x)}`
    const right = y === b ? first(ix, b) : `${first(ix, b)}'s ${ry ? ry.label : 'relative'} ${first(ix, y)}`
    const verb = isEx(f.status) ? 'was married to' : f.status === 'partners' ? 'is the partner of' : 'is married to'
    return `${left} ${verb} ${right}`
  }
  return null
}

export type Hop = { id: string; rel: string | null }

/** The hop chain behind a label: Ranbir, his father Rishi, Rishi's brother Randhir, his daughter Kareena */
export function chain(ix: TreeIndex, a: string, b: string): Hop[] {
  const path = findPath(ix, a, b)
  if (!path) return []
  const ps = path.persons
  return ps.map((id, i) => {
    if (i === 0) return { id, rel: null }
    const prev = ps[i - 1]
    const pw = partnerWord(ix, prev, id)
    if (pw) return { id, rel: pw }
    // One step up or down says how the link was made: adopted, step or foster
    const down = linkKind(ix, prev, id)
    const up = linkKind(ix, id, prev)
    const p = ix.person(id)
    if (down === 'adopted') return { id, rel: word('adoptedChild', p) }
    if (up === 'adopted') return { id, rel: word('adoptiveParent', p) }
    return { id, rel: bloodRelation(ix, prev, id)?.label ?? 'relative' }
  })
}
