import type { TreeIndex } from './index'

// Shortest path between two people (PLAN 8.5), over a graph of person nodes and family nodes.
// Birth links are a little cheaper than partner links, so a route through blood wins a tie and the
// highlighted path matches the relationship label.
//
// Edge keys name the exact connector segments the canvas draws:
//   h:<family>:<partner>  the half of the partner line from that partner to the family point
//   c:<family>:<child>    the drop from the family point to a child

export type NodeKey = `p:${string}` | `f:${string}`
export type EdgeKey = string

export type PathResult = {
  /** Alternating person and family nodes, from a to b */
  nodes: NodeKey[]
  persons: string[]
  families: string[]
  edges: EdgeKey[]
}

const BIRTH = 0.5
const PARTNER = 0.6

export function edgeKey(ix: TreeIndex, familyId: string, personId: string): EdgeKey {
  const f = ix.family(familyId)
  return f?.partnerIds.includes(personId) ? `h:${familyId}:${personId}` : `c:${familyId}:${personId}`
}

export function neighbors(ix: TreeIndex, node: NodeKey): [NodeKey, number][] {
  const id = node.slice(2)
  const out: [NodeKey, number][] = []
  if (node[0] === 'p') {
    for (const fid of ix.parentFamiliesOf(id)) out.push([`f:${fid}`, BIRTH])
    for (const fid of ix.familiesOf(id)) out.push([`f:${fid}`, PARTNER])
  } else {
    const f = ix.family(id)
    if (!f) return out
    for (const pid of f.partnerIds) if (ix.person(pid)) out.push([`p:${pid}`, PARTNER])
    for (const c of f.children) if (ix.person(c.personId)) out.push([`p:${c.personId}`, BIRTH])
  }
  return out
}

/** A tiny binary heap keyed by distance */
class Heap {
  private items: [number, NodeKey][] = []
  get size() {
    return this.items.length
  }
  push(d: number, n: NodeKey) {
    const a = this.items
    a.push([d, n])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p][0] <= a[i][0]) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop(): [number, NodeKey] {
    const a = this.items
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l][0] < a[m][0]) m = l
        if (r < a.length && a[r][0] < a[m][0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

export function findPath(ix: TreeIndex, a: string, b: string): PathResult | null {
  if (!ix.person(a) || !ix.person(b)) return null
  const start: NodeKey = `p:${a}`
  const goal: NodeKey = `p:${b}`
  const dist = new Map<NodeKey, number>([[start, 0]])
  const prev = new Map<NodeKey, NodeKey>()
  const done = new Set<NodeKey>()
  const heap = new Heap()
  heap.push(0, start)
  while (heap.size) {
    const [d, cur] = heap.pop()
    if (done.has(cur)) continue
    if (cur === goal) break
    done.add(cur)
    for (const [n, w] of neighbors(ix, cur)) {
      const nd = d + w
      const known = dist.get(n)
      if (known === undefined || nd < known - 1e-9) {
        dist.set(n, nd)
        prev.set(n, cur)
        heap.push(nd, n)
      }
    }
  }
  if (!dist.has(goal)) return null
  const nodes: NodeKey[] = [goal]
  while (nodes[0] !== start) nodes.unshift(prev.get(nodes[0])!)
  const persons = nodes.filter((n) => n[0] === 'p').map((n) => n.slice(2))
  const families = nodes.filter((n) => n[0] === 'f').map((n) => n.slice(2))
  const edges: EdgeKey[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    const [pn, fn] = nodes[i][0] === 'p' ? [nodes[i], nodes[i + 1]] : [nodes[i + 1], nodes[i]]
    edges.push(edgeKey(ix, fn.slice(2), pn.slice(2)))
  }
  return { nodes, persons, families, edges }
}

/** Someone's parents, partners and children, and the connector segments between them */
export function immediateFamily(ix: TreeIndex, id: string) {
  const persons = new Set([id])
  const edges = new Set<EdgeKey>()
  const families = new Set<string>()
  const bf = ix.birthFamilyOf(id)
  if (bf) {
    families.add(bf)
    edges.add(`c:${bf}:${id}`)
    for (const pid of ix.family(bf)!.partnerIds) {
      persons.add(pid)
      edges.add(`h:${bf}:${pid}`)
    }
  }
  for (const fid of ix.familiesOf(id)) {
    const f = ix.family(fid)!
    families.add(fid)
    for (const pid of f.partnerIds) {
      persons.add(pid)
      edges.add(`h:${fid}:${pid}`)
    }
    for (const c of f.children) {
      persons.add(c.personId)
      edges.add(`c:${fid}:${c.personId}`)
    }
  }
  return { persons, edges, families }
}
