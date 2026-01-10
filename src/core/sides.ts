import type { TreeIndex } from './index'

// Branch sides (PLAN 6.3 and 8.5). With someone marked as you: your father's side, your mother's
// side, and your own family (you, your siblings, your partner, your descendants). In-laws take their
// partner's side.
//
// In the neutral view there's no "father's side", so the shades follow founding lines instead: the
// two largest lines take the father's and mother's shades, people descended from both take "own".
//
// Every tile asks for its own side, so the answers are cached per index and home person.

export type Side = 'own' | 'paternal' | 'maternal' | 'other'

export type SideInfo = { side: Side | null; blood: boolean }

export type Line = { roots: string[]; size: number; surname: string }

export type SideNames = { paternal: string; maternal: string; own: string; other: string }

export type Sides = {
  homeId: string | null
  lines: Line[]
  info(id: string): SideInfo
  side(id: string): Side | null
  names: SideNames
}

const cache = new WeakMap<TreeIndex, Map<string | null, Sides>>()

export function sidesOf(ix: TreeIndex, homeId: string | null): Sides {
  const home = homeId && ix.person(homeId) ? homeId : null
  let byHome = cache.get(ix)
  if (!byHome) cache.set(ix, (byHome = new Map()))
  let s = byHome.get(home)
  if (!s) byHome.set(home, (s = buildSides(ix, home)))
  return s
}

/** Founding couples: people with no recorded parents who have children, where neither partner married into another line */
export function foundingLines(ix: TreeIndex): Line[] {
  const out: Line[] = []
  const seen = new Set<string>()
  for (const id of ix.ids) {
    if (seen.has(id) || ix.birthFamilyOf(id) || !ix.childrenOf(id).length) continue
    const ps = ix.partnersOf(id)
    if (ps.some((q) => ix.birthFamilyOf(q))) continue
    const roots = [id, ...ps.filter((q) => !ix.birthFamilyOf(q))]
    for (const r of roots) seen.add(r)
    const desc = new Set<string>()
    for (const r of roots) for (const d of ix.descendants(r).keys()) if (!roots.includes(d)) desc.add(d)
    const count = new Map<string, number>()
    for (const pid of [...roots, ...desc]) {
      const p = ix.person(pid)!
      const n = p.birthSurname || p.lastName
      if (n) count.set(n, (count.get(n) ?? 0) + 1)
    }
    let surname = ix.person(id)!.firstName
    let bestN = 0
    for (const [n, c] of count) if (c > bestN) [surname, bestN] = [n, c]
    out.push({ roots, size: desc.size, surname })
  }
  // Largest first. Ties keep document order, since sort is stable.
  return out.sort((a, b) => b.size - a.size)
}

/** Your father and mother: by gender, or in the order they're recorded when gender is unknown */
export function homeParents(ix: TreeIndex, homeId: string | null) {
  if (!homeId) return { father: null, mother: null }
  const ps = ix.parentsOf(homeId).map((id) => ix.person(id)!)
  let father = ps.find((p) => p.gender === 'male')
  let mother = ps.find((p) => p.gender === 'female')
  if (!father) father = ps.find((p) => p !== mother)
  if (!mother) mother = ps.find((p) => p !== father)
  return { father: father?.id ?? null, mother: mother?.id ?? null }
}

function buildSides(ix: TreeIndex, homeId: string | null): Sides {
  const lines = foundingLines(ix)
  const { father, mother } = homeParents(ix, homeId)
  const fatherAnc = father ? ix.ancestors(father) : null
  const motherAnc = mother ? ix.ancestors(mother) : null

  const bloodSide = (id: string): Side | null => {
    const A = ix.ancestors(id)
    if (homeId) {
      if (id === homeId || A.has(homeId)) return 'own'
      if (father && mother && A.has(father) && A.has(mother)) return 'own'
      if (fatherAnc) for (const k of A.keys()) if (fatherAnc.has(k)) return 'paternal'
      if (motherAnc) for (const k of A.keys()) if (motherAnc.has(k)) return 'maternal'
      return null
    }
    const hits: number[] = []
    lines.forEach((ln, i) => {
      if (ln.roots.some((r) => A.has(r))) hits.push(i)
    })
    if (!hits.length) return null
    if (hits.includes(0) && hits.includes(1)) return 'own'
    return hits[0] === 0 ? 'paternal' : hits[0] === 1 ? 'maternal' : 'other'
  }

  const memo = new Map<string, SideInfo>()
  const info = (id: string): SideInfo => {
    let v = memo.get(id)
    if (v) return v
    const b = bloodSide(id)
    if (b) v = { side: b, blood: true }
    else {
      v = { side: null, blood: false }
      for (const q of ix.partnersOf(id)) {
        const s = bloodSide(q)
        if (s) {
          v = { side: s, blood: false }
          break
        }
      }
    }
    memo.set(id, v)
    return v
  }

  let names: SideNames
  if (!homeId) {
    names = {
      paternal: lines[0] ? `${lines[0].surname} line` : 'First line',
      maternal: lines[1] ? `${lines[1].surname} line` : 'Second line',
      own: 'Both lines',
      other: 'Other lines',
    }
  } else {
    const f = father ? ix.person(father) : undefined
    const m = mother ? ix.person(mother) : undefined
    names = {
      paternal: f ? `${f.lastName || f.firstName} side` : "Father's side",
      maternal: m ? `${m.birthSurname || m.lastName || m.firstName} side` : "Mother's side",
      own: 'Your family',
      other: 'Other',
    }
  }

  return { homeId, lines, info, side: (id) => info(id).side, names }
}
