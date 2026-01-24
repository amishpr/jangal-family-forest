import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { cousinsMarried, generated, remarriage, unknownParents } from '../../../tests/fixtures/families'
import { anchorId, visibleSets } from '../collapse'
import { indexOf } from '../index'
import type { TreeDoc } from '../model'
import { alvarezTree } from '../../../tests/fixtures/alvarez'
import { sampleTree } from '../sample'
import { addRelative, setChildOrder } from '../edit'
import { layoutTree, PILL_H, PILL_W, pillTop, TILE_LAYOUT, type Layout } from './layout'

function lay(doc: TreeDoc, collapse = { collapsedFamilies: [] as string[], collapsedAncestors: [] as string[] }) {
  const ix = indexOf(doc)
  const anchor = anchorId(ix, doc.homePersonId)
  return { ix, layout: layoutTree(ix, visibleSets(ix, anchor, collapse), collapse, anchor) }
}

function checkInvariants(doc: TreeDoc, layout: Layout) {
  const ix = indexOf(doc)
  const nodes = Object.values(layout.nodes)
  // No two tiles overlap
  const overlaps: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${a.id}/${b.id}`)
    }
  }
  expect(overlaps).toEqual([])
  for (const f of Object.values(doc.families)) {
    const ps = f.partnerIds.filter((p) => layout.nodes[p])
    // Partners share a row and sit next to each other
    if (ps.length === 2) {
      const [a, b] = ps.map((p) => layout.nodes[p])
      expect(a.y, `${a.id} and ${b.id} share a row`).toBe(b.y)
      const between = nodes.filter((n) => n.y === a.y && n.x > Math.min(a.x, b.x) && n.x < Math.max(a.x, b.x))
      expect(between.map((n) => n.id), `nobody between ${a.id} and ${b.id}`).toEqual([])
    }
    // Children sit below their parents
    for (const c of f.children) {
      const child = layout.nodes[c.personId]
      if (!child || ix.birthFamilyOf(c.personId) !== f.id) continue
      for (const p of ps) expect(child.y, `${c.personId} below ${p}`).toBeGreaterThan(layout.nodes[p].y)
    }
  }
}

describe('layout', () => {
  it('keeps partners together and children below parents in the sample family', () => {
    const doc = alvarezTree()
    const { layout } = lay(doc)
    expect(Object.keys(layout.nodes)).toHaveLength(23)
    checkInvariants(doc, layout)
    // Five generations make five rows
    expect(new Set(Object.values(layout.nodes).map((n) => n.y)).size).toBe(5)
  })

  it('puts a family point over the middle of its children, give or take a few pixels', () => {
    const { layout } = lay(alvarezTree())
    const f = layout.families.find((x) => x.id === 'f_arjun')!
    const kids = ['anika', 'dev'].map((id) => layout.nodes[id].cu)
    // Placement balances parents over children against children under parents, so it's close, not exact
    expect(Math.abs(f.anchor.x - (Math.min(...kids) + Math.max(...kids)) / 2)).toBeLessThan(8)
  })

  it('handles remarriage, pedigree collapse, and unknown parents', () => {
    for (const doc of [remarriage(), cousinsMarried(), unknownParents()]) {
      const { layout } = lay(doc)
      expect(Object.keys(layout.nodes)).toHaveLength(Object.keys(doc.people).length)
      checkInvariants(doc, layout)
    }
  })

  it('leaves tucked away branches out and puts a pill where they were', () => {
    const doc = alvarezTree()
    const { layout } = lay(doc, { collapsedFamilies: ['f_arjun'], collapsedAncestors: [] })
    expect(layout.nodes.anika).toBeUndefined()
    expect(layout.pills).toEqual([expect.objectContaining({ kind: 'fam', id: 'f_arjun', hidden: ['anika', 'dev'] })])
  })

  it('keeps the order a family set for its children, through the untangling sweeps (TODO.md F18)', () => {
    const base = sampleTree()
    const all = { collapsedFamilies: [], collapsedAncestors: [] }
    const x = (doc: TreeDoc, id: string) => lay(doc, all).layout.nodes[id].x
    const order = (doc: TreeDoc) => ['randhir', 'ritu', 'rishi', 'rima', 'rajiv'].sort((a, b) => x(doc, a) - x(doc, b))
    // By birth when nothing is set
    expect(order(base)).toEqual(['randhir', 'ritu', 'rishi', 'rima', 'rajiv'])
    const doc = structuredClone(base)
    setChildOrder(doc, 'f_raj', ['rishi', 'rajiv', 'randhir', 'ritu', 'rima'])
    expect(order(doc)).toEqual(['rishi', 'rajiv', 'randhir', 'ritu', 'rima'])
    // A couple moves together: Neetu stays beside Rishi
    expect(Math.abs(x(doc, 'neetu') - x(doc, 'rishi'))).toBe(TILE_LAYOUT.nodeW + TILE_LAYOUT.partnerGap)
    // The same order with branches tucked away, as the sample opens
    const tucked = lay(doc, doc.view).layout.nodes
    expect(tucked.rishi.x).toBeLessThan(tucked.rajiv.x)
    expect(tucked.rajiv.x).toBeLessThan(tucked.randhir.x)
    // A child added later goes at the end. Edits run through immer, as in the app, since the index
    // is cached per version of the document.
    const later = produce(doc, (d) => void addRelative(d, 'raj', 'child', { familyId: 'f_raj', fields: { firstName: 'Late', birth: { date: { year: 1940 } } } }))
    const late = Object.values(later.people).find((p) => p.firstName === 'Late')!.id
    expect(x(later, late)).toBeGreaterThan(x(later, 'rima'))
  })

  it('never cuts the person in the middle off from their own line (TODO.md F17)', () => {
    const doc = sampleTree()
    const ix = indexOf(doc)
    // In the neutral view the anchor has the most recorded ancestors: Agastya, inside Ritu's
    // tucked branch. That tuck is on his own line, so it doesn't apply.
    const anchor = anchorId(ix, null)
    expect(anchor).toBe('agastya')
    const shown = visibleSets(ix, anchor, doc.view).persons
    for (const id of ['agastya', 'nikhil', 'ritu', 'raj', 'ranbir']) expect(shown.has(id), id).toBe(true)
    // Marking someone in a tucked branch as you works the same way
    const kareena = visibleSets(ix, 'kareena', doc.view).persons
    for (const id of ['randhir', 'babita', 'karisma']) expect(kareena.has(id), id).toBe(true)
    const { layout } = lay({ ...doc, homePersonId: 'kareena' }, doc.view)
    expect(layout.nodes.kareena.y).toBeGreaterThan(layout.nodes.randhir.y)
  })

  it('keeps the sample’s pills from covering each other (TODO.md F17)', () => {
    const doc = sampleTree()
    const { layout } = lay(doc, doc.view)
    expect(layout.pills.length).toBe(6)
    for (const a of layout.pills) {
      for (const b of layout.pills) {
        if (a === b) continue
        const apart = Math.abs(a.at.x - b.at.x) >= PILL_W - 0.5 || Math.abs(pillTop(a) - pillTop(b)) >= PILL_H
        expect(apart, `${a.id} and ${b.id}`).toBe(true)
      }
    }
  })

  it('offers folds on other families but never on your own line', () => {
    const { layout } = lay(alvarezTree())
    const foldable = layout.families.filter((f) => f.canCollapse).map((f) => f.id).sort()
    expect(foldable).toEqual(['f_arjun', 'f_luis', 'f_marisol', 'f_maya'])
    expect(layout.ancestorFolds.map((a) => a.id).sort()).toEqual(['daniel', 'maya', 'priya', 'tomas'])
  })

  it('lays out 500 people quickly, with no overlaps', () => {
    const doc = generated(500)
    lay(generated(500, 11)) // warm up, so the timing isn't the first run's compile time
    // The best of three, so a busy machine running the other test files at the same time
    // doesn't fail it
    let ms = Infinity
    let layout = lay(doc).layout
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now()
      layout = lay(doc).layout
      ms = Math.min(ms, performance.now() - t0)
    }
    expect(Object.keys(layout.nodes)).toHaveLength(500)
    checkInvariants(doc, layout)
    // PLAN 8.14 allows 120 ms for 300 people. This is 500 on the main thread (about 40 ms).
    expect(ms).toBeLessThan(250)
    console.log(`500 people laid out in ${ms.toFixed(0)} ms`)
  })
})
