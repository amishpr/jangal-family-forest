import { activeCollapse, hiddenBy, homeLine, type Collapse, type Visible } from '../collapse'
import type { TreeIndex } from '../index'
import type { ChildKind, Family, FamilyStatus } from '../model'

// The tree layout (PLAN 8.6), grown from the mockup engine:
//  1. Household blocks: partners are laid out side by side as one block, so they always share a row.
//  2. Generation rows: children sit one row below their parents, partners share the lower row.
//  3. Order: a depth first pass, then a few barycenter sweeps up and down to untangle lines.
//  4. Placement: least squares with minimum gaps (pool adjacent violators), pulling each block
//     under its parents' family point and each family point over the middle of its children.
//  5. Connectors are drawn by us: partner line, family point, a bus, and a drop into each child.
// It's pure and synchronous: a 500 person tree lays out in a few milliseconds.

export type LayoutOptions = {
  nodeW: number
  nodeH: number
  partnerGap: number
  blockGap: number
  familyGap: number
  rowGap: number
  dir: 'down' | 'right'
}

export const TILE_LAYOUT: LayoutOptions = {
  nodeW: 140,
  nodeH: 180,
  partnerGap: 30,
  blockGap: 22,
  familyGap: 44,
  rowGap: 74,
  dir: 'down',
}

export type Pt = { x: number; y: number }

export type NodeBox = {
  id: string
  x: number
  y: number
  w: number
  h: number
  gen: number
  /** Center along the row, and the row's position, in layout units */
  cu: number
  v: number
}

export type Segment = { key: string; d: string }

export type FamilyGeom = {
  id: string
  /** The family point: the ring on the partner line, or the bottom of a single parent */
  anchor: Pt
  /** Where the fold button sits, on the bus under the family point */
  bus: Pt
  halves: (Segment & { pid: string })[]
  childSegs: (Segment & { cid: string; kind: ChildKind })[]
  status?: FamilyStatus
  twoPartners: boolean
  collapsed: boolean
  canCollapse: boolean
}

export type Pill = { kind: 'fam' | 'anc'; id: string; at: Pt; hidden: string[] }

export type AncestorFold = { id: string; at: Pt }

// A pill's size, with room to spare: up to three faces and "21 tucked away" (canvas.css .pill)
export const PILL_W = 230
export const PILL_H = 36
/** A pill's top: a family's hangs down from its point, a person's ancestors' sits on their tile */
export const pillTop = (p: Pill) => (p.kind === 'anc' ? p.at.y - PILL_H : p.at.y)

/**
 * Pills in the same gap between rows mustn't cover each other, as a family's and the ancestors of
 * someone below it can (TODO.md F17). Ones that would are pushed apart sideways, half each.
 * ponytail: one pass in left-to-right order, which is enough for the few pills a view has.
 */
function spreadPills(pills: Pill[]) {
  pills.sort((a, b) => a.at.x - b.at.x)
  for (let i = 0; i < pills.length; i++) {
    for (let j = i + 1; j < pills.length; j++) {
      const [a, b] = [pills[i], pills[j]]
      const gap = b.at.x - a.at.x
      if (Math.abs(pillTop(a) - pillTop(b)) >= PILL_H || gap >= PILL_W) continue
      a.at = { ...a.at, x: a.at.x - (PILL_W - gap) / 2 }
      b.at = { ...b.at, x: b.at.x + (PILL_W - gap) / 2 }
    }
  }
}

export type Layout = {
  nodes: Record<string, NodeBox>
  families: FamilyGeom[]
  pills: Pill[]
  ancestorFolds: AncestorFold[]
  bounds: { x: number; y: number; w: number; h: number }
  opts: LayoutOptions
}

type Block = { id: string; members: string[]; gen: number }

const EMPTY_LAYOUT = (o: LayoutOptions): Layout => ({
  nodes: {},
  families: [],
  pills: [],
  ancestorFolds: [],
  bounds: { x: 0, y: 0, w: 0, h: 0 },
  opts: o,
})

export function layoutTree(
  ix: TreeIndex,
  vis: Visible,
  given: Collapse,
  anchor: string | null,
  opts: Partial<LayoutOptions> = {},
): Layout {
  const o: LayoutOptions = { ...TILE_LAYOUT, ...opts }
  const collapse = activeCollapse(ix, anchor, given)
  const V = vis.persons
  if (!V.size) return EMPTY_LAYOUT(o)
  const collapsedFams = new Set(collapse.collapsedFamilies)
  const collapsedAnc = new Set(collapse.collapsedAncestors)
  const nodeU = o.dir === 'down' ? o.nodeW : o.nodeH
  const nodeV = o.dir === 'down' ? o.nodeH : o.nodeW
  const orderOf = (id: string) => ix.order.get(id) ?? 0
  const fam = (id: string) => ix.family(id)!

  // These are asked for thousands of times while placing, so each is worked out once up front
  const parentFam = new Map<string, string | null>()
  for (const id of V) {
    const bf = ix.birthFamilyOf(id)
    parentFam.set(id, bf && vis.fams.has(bf) && !collapsedAnc.has(id) ? bf : null)
  }
  const visParentsFam = (id: string): string | null => parentFam.get(id) ?? null
  const visFams = Object.values(ix.families).filter((f) => vis.fams.has(f.id))
  const partnersMemo = new Map<string, string[]>()
  const childrenMemo = new Map<string, string[]>()
  for (const f of visFams) {
    partnersMemo.set(f.id, f.partnerIds.filter((p) => V.has(p)))
    childrenMemo.set(
      f.id,
      collapsedFams.has(f.id) ? [] : f.children.map((c) => c.personId).filter((c) => V.has(c) && parentFam.get(c) === f.id),
    )
  }
  const visPartners = (f: Family) => partnersMemo.get(f.id) ?? []
  const visChildren = (f: Family) => childrenMemo.get(f.id) ?? []

  // ---- generations
  const gen = new Map<string, number>()
  for (const id of V) gen.set(id, 0)
  const g = (id: string) => gen.get(id) ?? 0
  for (let it = 0; it < 60; it++) {
    let changed = false
    const raise = (id: string, want: number) => {
      if (g(id) < want) {
        gen.set(id, want)
        changed = true
      }
    }
    for (const id of V) {
      const pf = visParentsFam(id)
      if (pf) {
        const ps = visPartners(fam(pf))
        if (ps.length) raise(id, Math.max(...ps.map(g)) + 1)
      }
    }
    for (const f of visFams) {
      const ps = visPartners(f)
      if (ps.length > 1) {
        const m = Math.max(...ps.map(g))
        for (const p of ps) raise(p, m)
      }
    }
    for (const id of V) {
      if (visParentsFam(id)) continue
      const kids = ix.familiesOf(id).flatMap((fid) => (vis.fams.has(fid) ? visChildren(fam(fid)) : []))
      if (kids.length) raise(id, Math.max(...kids.map(g)) - 1)
    }
    if (!changed) break
  }
  const minGen = Math.min(...[...V].map(g))
  for (const id of V) gen.set(id, g(id) - minGen)

  // ---- household blocks: everyone connected by partnerships
  const blockOf = new Map<string, Block>()
  const blocks: Block[] = []
  for (const id of [...V].sort((a, b) => orderOf(a) - orderOf(b))) {
    if (blockOf.has(id)) continue
    const members: string[] = []
    const seen = new Set([id])
    const q = [id]
    while (q.length) {
      const cur = q.shift()!
      members.push(cur)
      for (const fid of ix.familiesOf(cur)) {
        if (!vis.fams.has(fid)) continue
        for (const p of fam(fid).partnerIds) {
          if (V.has(p) && !seen.has(p)) {
            seen.add(p)
            q.push(p)
          }
        }
      }
    }
    if (members.length > 2) {
      // A chain of remarriages: start from someone with one partner and walk along
      const inBlock = new Set(members)
      const deg = (m: string) => ix.partnersOf(m).filter((x) => inBlock.has(x)).length
      const start = members.find((m) => deg(m) === 1) ?? members[0]
      const ordered = [start]
      while (ordered.length < members.length) {
        const last = ordered[ordered.length - 1]
        const nxt = ix.partnersOf(last).find((x) => inBlock.has(x) && !ordered.includes(x))
        if (!nxt) break
        ordered.push(nxt)
      }
      members.splice(0, members.length, ...ordered, ...members.filter((m) => !ordered.includes(m)))
    } else {
      members.sort((a, b) => orderOf(a) - orderOf(b))
    }
    const b: Block = { id: `b${blocks.length}`, members, gen: g(members[0]) }
    for (const m of members) blockOf.set(m, b)
    blocks.push(b)
  }

  // ---- rows, first in depth first order
  const maxGen = Math.max(...blocks.map((b) => b.gen))
  const rows: Block[][] = Array.from({ length: maxGen + 1 }, () => [])
  const visited = new Set<Block>()
  const famsMemo = new Map<Block, Family[]>()
  const famsOfBlock = (b: Block) => {
    let fs = famsMemo.get(b)
    if (!fs) {
      fs = [...new Set(b.members.flatMap((m) => ix.familiesOf(m)))].filter((fid) => vis.fams.has(fid)).map(fam)
      famsMemo.set(b, fs)
    }
    return fs
  }
  const birthYear = (id: string) => ix.person(id)?.birth?.date?.year ?? 0
  const byBirth = (x: string, y: string) => birthYear(x) - birthYear(y) || orderOf(x) - orderOf(y)
  const visit = (b: Block) => {
    if (visited.has(b)) return
    visited.add(b)
    rows[b.gen].push(b)
    // Children by birth, or in the order the family set (TODO.md F18)
    for (const f of famsOfBlock(b)) for (const c of f.childOrder ? visChildren(f) : [...visChildren(f)].sort(byBirth)) visit(blockOf.get(c)!)
  }
  blocks
    .filter((b) => b.members.every((m) => !visParentsFam(m)))
    .sort((x, y) => x.gen - y.gen || orderOf(x.members[0]) - orderOf(y.members[0]))
    .forEach(visit)
  blocks.forEach(visit)

  // ---- barycenter sweeps
  const indexMap = () => {
    const m = new Map<Block, number>()
    rows.forEach((r) => r.forEach((b, i) => m.set(b, i)))
    return m
  }
  for (let it = 0; it < 6; it++) {
    for (let r = 1; r <= maxGen; r++) {
      const ixm = indexMap()
      const bary = (b: Block) => {
        const ps = b.members
          .map(visParentsFam)
          .filter((x): x is string => !!x)
          .map(fam)
          .filter((f) => visPartners(f).length)
        if (!ps.length) return (ixm.get(b)! / Math.max(1, rows[r].length)) * rows[r - 1].length
        return ps.reduce((s, f) => s + ixm.get(blockOf.get(visPartners(f)[0])!)! + 0.5, 0) / ps.length
      }
      rows[r] = rows[r]
        .map((b, i) => ({ b, k: bary(b), i }))
        .sort((x, y) => x.k - y.k || x.i - y.i)
        .map((x) => x.b)
    }
    for (let r = maxGen - 1; r >= 0; r--) {
      const ixm = indexMap()
      const bary = (b: Block): number | null => {
        const kids = famsOfBlock(b).flatMap(visChildren)
        if (!kids.length) return null
        return kids.reduce((s, c) => s + ixm.get(blockOf.get(c)!)! + 0.5, 0) / kids.length
      }
      const keyed = rows[r].map((b, i) => ({ b, k: bary(b), i }))
      // Blocks without children keep their place relative to their neighbours
      keyed.forEach((x, i) => {
        if (x.k === null) x.k = i === 0 ? -0.5 : keyed[i - 1].k! + 0.001
      })
      rows[r] = keyed.sort((x, y) => x.k! - y.k! || x.i - y.i).map((x) => x.b)
    }
  }

  // ---- a family's own order of its children wins over the sweeps (TODO.md F18): their blocks keep
  // the slots they hold in the row, in the family's order, so the group can still move as a whole
  for (const f of visFams) {
    if (!f.childOrder) continue
    const kids = [...new Set(visChildren(f).map((c) => blockOf.get(c)!))]
    const row = kids[0] && rows[kids[0].gen]
    if (kids.length < 2 || !kids.every((b) => row.includes(b))) continue
    const slots = kids.map((b) => row.indexOf(b)).sort((x, y) => x - y)
    kids.forEach((b, i) => (row[slots[i]] = b))
  }

  // ---- order inside two person blocks: the in-law on the outside of the sibling group
  const ixFinal = indexMap()
  rows.forEach((row) =>
    row.forEach((b) => {
      if (b.members.length !== 2) return
      const [x, y] = b.members
      const px = visParentsFam(x)
      const py = visParentsFam(y)
      const parentBlockIndex = (fid: string) => {
        const ps = visPartners(fam(fid))
        return ps.length ? ixFinal.get(blockOf.get(ps[0])!)! : 0
      }
      if (px && py) {
        if (parentBlockIndex(px) > parentBlockIndex(py)) b.members.reverse()
      } else if (px || py) {
        const blood = px ? x : y
        const inlaw = px ? y : x
        const sibBlocks = row.filter((bb) => bb.members.some((m) => visParentsFam(m) === (px || py)))
        const leftmost = sibBlocks[0] === b && sibBlocks.length > 1
        b.members = leftmost ? [inlaw, blood] : [blood, inlaw]
      }
    }),
  )

  // ---- placement
  const step = nodeU + o.partnerGap
  const width = (b: Block) => b.members.length * nodeU + (b.members.length - 1) * o.partnerGap
  const slot = new Map<string, number>()
  for (const b of blocks) b.members.forEach((m, i) => slot.set(m, i))
  const memberOff = (_b: Block, m: string) => (slot.get(m) ?? 0) * step + nodeU / 2
  const famAnchorOff = (b: Block, f: Family) => {
    const ps = visPartners(f).filter((p) => b.members.includes(p))
    return ps.reduce((s, p) => s + memberOff(b, p), 0) / ps.length
  }
  const pos = new Map<Block, number>()
  rows.forEach((row) => {
    let x = 0
    row.forEach((b) => {
      pos.set(b, x)
      x += width(b) + o.blockGap
    })
  })
  // Siblings sit closer together than neighbouring families. The order is fixed from here on, so
  // each block's minimum offset from the start of its row is worked out once.
  const parentKey = new Map<Block, string>()
  for (const b of blocks) parentKey.set(b, b.members.map(visParentsFam).filter(Boolean).join('|'))
  const gapBetween = (b1: Block, b2: Block) => {
    const k = parentKey.get(b1)
    return k && k === parentKey.get(b2) ? o.blockGap : o.familyGap
  }
  const offsets = rows.map((row) => {
    const S = [0]
    for (let i = 1; i < row.length; i++) S[i] = S[i - 1] + width(row[i - 1]) + gapBetween(row[i - 1], row[i])
    return S
  })

  const place = (r: number, desired: number[], weights: number[]) => {
    const row = rows[r]
    const n = row.length
    if (!n) return
    const S = offsets[r]
    const pools: { sum: number; w: number; start: number; end: number }[] = []
    for (let i = 0; i < n; i++) {
      pools.push({ sum: (desired[i] - S[i]) * weights[i], w: weights[i], start: i, end: i })
      while (pools.length > 1) {
        const a = pools[pools.length - 2]
        const c = pools[pools.length - 1]
        if (a.sum / a.w <= c.sum / c.w) break
        pools.pop()
        pools[pools.length - 1] = { sum: a.sum + c.sum, w: a.w + c.w, start: a.start, end: c.end }
      }
    }
    for (const pl of pools) {
      const y = pl.sum / pl.w
      for (let i = pl.start; i <= pl.end; i++) pos.set(row[i], y + S[i])
    }
  }
  const centerOf = (id: string) => pos.get(blockOf.get(id)!)! + memberOff(blockOf.get(id)!, id)
  const anchorOf = (f: Family) => {
    const b = blockOf.get(visPartners(f)[0])!
    return pos.get(b)! + famAnchorOff(b, f)
  }

  for (let it = 0; it < 24; it++) {
    for (let r = 1; r <= maxGen; r++) {
      const des: number[] = []
      const wts: number[] = []
      for (const b of rows[r]) {
        const vals = b.members
          .filter((m) => {
            const pf = visParentsFam(m)
            return pf && visPartners(fam(pf)).length
          })
          .map((m) => anchorOf(fam(visParentsFam(m)!)) - memberOff(b, m))
        if (vals.length) {
          des.push(vals.reduce((s, v) => s + v, 0) / vals.length)
          wts.push(1)
        } else {
          des.push(pos.get(b)!)
          wts.push(0.05)
        }
      }
      place(r, des, wts)
    }
    for (let r = maxGen - 1; r >= 0; r--) {
      const des: number[] = []
      const wts: number[] = []
      for (const b of rows[r]) {
        const vals = famsOfBlock(b)
          .filter((f) => visChildren(f).length && visPartners(f).some((p) => b.members.includes(p)))
          .map((f) => {
            const cs = visChildren(f).map(centerOf)
            return (Math.min(...cs) + Math.max(...cs)) / 2 - famAnchorOff(b, f)
          })
        if (vals.length) {
          des.push(vals.reduce((s, v) => s + v, 0) / vals.length)
          wts.push(1)
        } else {
          des.push(pos.get(b)!)
          wts.push(0.05)
        }
      }
      place(r, des, wts)
    }
  }
  let minU = Infinity
  pos.forEach((v) => (minU = Math.min(minU, v)))
  pos.forEach((v, b) => pos.set(b, v - minU))

  // ---- output
  const P = (u: number, v: number): Pt => (o.dir === 'down' ? { x: u, y: v } : { x: v, y: u })
  const rowV = (r: number) => r * (nodeV + o.rowGap)
  const nodes: Record<string, NodeBox> = {}
  for (const b of blocks) {
    for (const m of b.members) {
      const u = pos.get(b)! + memberOff(b, m) - nodeU / 2
      const v = rowV(b.gen)
      const pt = P(u, v)
      nodes[m] = { id: m, x: pt.x, y: pt.y, w: o.nodeW, h: o.nodeH, gen: b.gen, cu: u + nodeU / 2, v }
    }
  }
  const R = 10
  const round = (n: number) => Math.round(n * 10) / 10
  const M = (p: Pt) => `M${round(p.x)},${round(p.y)}`
  const L = (p: Pt) => `L${round(p.x)},${round(p.y)}`
  const Q = (c: Pt, p: Pt) => `Q${round(c.x)},${round(c.y)} ${round(p.x)},${round(p.y)}`
  const line = homeLine(ix, anchor)
  const families: FamilyGeom[] = []
  for (const f of visFams) {
    const ps = visPartners(f)
    if (!ps.length) continue
    const b = blockOf.get(ps[0])!
    const au = anchorOf(f)
    const twoPartners = ps.length === 2 && b.members.includes(ps[1])
    const av = rowV(b.gen) + (twoPartners ? nodeV / 2 : nodeV)
    const halves: FamilyGeom['halves'] = []
    for (const p of ps) {
      if (!twoPartners) {
        halves.push({ pid: p, key: `h:${f.id}:${p}`, d: '' })
        continue
      }
      const n = nodes[p]
      const edgeU = n.cu < au ? n.cu + nodeU / 2 : n.cu - nodeU / 2
      halves.push({ pid: p, key: `h:${f.id}:${p}`, d: `${M(P(edgeU, av))} ${L(P(au, av))}` })
    }
    const busV = rowV(b.gen) + nodeV + o.rowGap / 2
    const childSegs = visChildren(f).map((cid) => {
      const n = nodes[cid]
      const cu = n.cu
      const cv = n.v
      const dx = cu - au
      let d: string
      if (Math.abs(dx) < 1) d = `${M(P(au, av))} ${L(P(cu, cv))}`
      else {
        const r = Math.min(R, Math.abs(dx) / 2)
        const s = Math.sign(dx)
        d = [
          M(P(au, av)),
          L(P(au, busV - r)),
          Q(P(au, busV), P(au + s * r, busV)),
          L(P(cu - s * r, busV)),
          Q(P(cu, busV), P(cu, busV + r)),
          L(P(cu, cv)),
        ].join(' ')
      }
      return { cid, key: `c:${f.id}:${cid}`, d, kind: ix.childKind(f.id, cid) }
    })
    families.push({
      id: f.id,
      anchor: P(au, av),
      bus: P(au, busV),
      halves,
      childSegs,
      status: f.status,
      twoPartners,
      collapsed: collapsedFams.has(f.id),
      canCollapse: childSegs.length > 0 && !line.fams.has(f.id),
    })
  }

  const pills: Pill[] = []
  for (const fid of collapsedFams) {
    const f = families.find((x) => x.id === fid)
    if (!f) continue
    const hidden = hiddenBy(ix, anchor, collapse, 'fam', fid)
    if (hidden.length) pills.push({ kind: 'fam', id: fid, at: { x: f.bus.x, y: f.bus.y - o.rowGap / 2 + 14 }, hidden })
  }
  for (const pid of collapsedAnc) {
    const n = nodes[pid]
    if (!n) continue
    const hidden = hiddenBy(ix, anchor, collapse, 'anc', pid)
    if (hidden.length) pills.push({ kind: 'anc', id: pid, at: P(n.cu, n.v - o.rowGap / 2 + 4), hidden })
  }
  spreadPills(pills)

  // A small fold above each person on the reference line whose parents are showing
  const ancestorFolds: AncestorFold[] = []
  for (const id of V) {
    const n = nodes[id]
    if (!n || !visParentsFam(id) || !line.persons.has(id)) continue
    ancestorFolds.push({ id, at: P(n.cu, n.v - 16) })
  }

  let maxX = 0
  let maxY = 0
  for (const n of Object.values(nodes)) {
    maxX = Math.max(maxX, n.x + n.w)
    maxY = Math.max(maxY, n.y + n.h)
  }
  return { nodes, families, pills, ancestorFolds, bounds: { x: 0, y: 0, w: maxX, h: maxY }, opts: o }
}

/** The box around some people, for flying the camera to them */
export function boundsOf(ids: Iterable<string>, layout: Layout) {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const id of ids) {
    const n = layout.nodes[id]
    if (!n) continue
    x1 = Math.min(x1, n.x)
    y1 = Math.min(y1, n.y)
    x2 = Math.max(x2, n.x + n.w)
    y2 = Math.max(y2, n.y + n.h)
  }
  if (x1 === Infinity) return null
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}
