import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { build } from '../../tests/fixtures/build'
import { indexOf } from './index'
import { diffPeople, findMatches, mergeTrees, type MergeResult } from './merge'
import type { TreeDoc } from './model'

// Combining two trees (TODO.md F12)

const merge = (base: TreeDoc, other: TreeDoc, pairs: [string, string][]) => {
  let r: MergeResult | undefined
  const doc = produce(base, (d) => void (r = mergeTrees(d, other, pairs)))
  return { doc, r: r! }
}
const pairsOf = (base: TreeDoc, other: TreeDoc) => findMatches(base, other).map((m): [string, string] => [m.base, m.other])
const named = (doc: TreeDoc, first: string) => Object.values(doc.people).filter((p) => p.firstName === first)

describe('finding people in both trees', () => {
  it('matches names with accents and case ignored, by birth year or a missing year', () => {
    const base = build('tomas:m helen:f ravi:m', [], null, { tomas: 1943, helen: 1946, ravi: 1950 })
    base.people.tomas.firstName = 'Tomás'
    const other = build('t:m h:f r:m', [], null, { t: 1943, r: 1951 })
    Object.assign(other.people.t, { firstName: 'TOMAS', lastName: 'test' })
    Object.assign(other.people.h, { firstName: 'Helen' })
    Object.assign(other.people.r, { firstName: 'Ravi' })
    expect(findMatches(base, other)).toEqual([
      { base: 'tomas', other: 't', strong: true },
      { base: 'helen', other: 'h', strong: false },
    ])
  })

  it('matches a maiden name, matches each person once, and keeps pets to pets', () => {
    const base = build('priya:f p2:f dog:u', [], null, { priya: 1970 })
    base.people.priya.birthSurname = 'Raman'
    Object.assign(base.people.p2, { firstName: 'Priya' })
    Object.assign(base.people.dog, { firstName: 'Priya', species: 'Dog' })
    const other = build('x:f', [], null, { x: 1970 })
    Object.assign(other.people.x, { firstName: 'Priya', lastName: 'Raman' })
    expect(findMatches(base, other)).toEqual([{ base: 'priya', other: 'x', strong: true }])
  })
})

describe('combining two trees', () => {
  it('adds a cousin’s branch to the tree, joined at the people in both', () => {
    const base = alvarezTree()
    // The cousin's tree: Iris's family, plus her new partner and their baby
    const other = build('owen:m marisol:f iris:f felix:m ben:m rosa:f', [[['owen', 'marisol'], ['iris', 'felix']], [['iris', 'ben'], ['rosa']]], null, { owen: 1964, marisol: 1966, iris: 1993, felix: 1997 })
    for (const p of Object.values(other.people)) p.lastName = base.people[p.id]?.lastName ?? 'Kent'
    const pairs = pairsOf(base, other)
    expect(pairs).toHaveLength(4)
    const { doc, r } = merge(base, other, pairs)
    if (!r.ok) throw new Error(r.reason)
    expect(Object.keys(doc.people)).toHaveLength(25)
    expect(r.report).toMatchObject({ added: 2, joined: 4, skipped: [] })
    // The couple's family here took in nothing new, and Iris has a partner and a daughter
    const ix = indexOf(doc)
    expect(ix.childrenOf('owen').sort()).toEqual(['felix', 'iris'])
    const [rosa] = named(doc, 'Rosa')
    expect(ix.parentsOf(rosa.id)).toContain('iris')
    expect(Object.keys(doc.families)).toHaveLength(Object.keys(base.families).length + 1)
  })

  it('fills blanks, lists differences instead of overwriting, and joins the same couple’s children', () => {
    const base = build('ann:f bob:m kid:m', [[['ann', 'bob'], ['kid']]], null, { ann: 1950 })
    const other = build('a:f b:m k2:f', [[['a', 'b'], ['k2']]], null, { a: 1951 })
    other.people.a.firstName = 'Ann'
    other.people.b.firstName = 'Bob'
    other.people.a.birth = { date: { year: 1951 }, place: 'Pune' }
    other.people.b.notes = 'Loved cricket'
    other.people.a.tags = ['Left-handed']
    const { doc, r } = merge(base, other, [['ann', 'a'], ['bob', 'b']])
    if (!r.ok) throw new Error(r.reason)
    expect(doc.people.ann.birth).toEqual({ date: { year: 1950 }, place: 'Pune' })
    expect(doc.people.bob.notes).toBe('Loved cricket')
    expect(doc.people.ann.tags).toEqual(['Left-handed'])
    expect(r.report.conflicts).toEqual(['Ann Test: the birth date is 1950 here and 1951 in the other tree. 1950 was kept.'])
    expect(indexOf(doc).childrenOf('ann')).toHaveLength(2)
    expect(Object.keys(doc.families)).toHaveLength(1)
  })

  it('leaves out links that would make someone their own ancestor, or give someone second parents', () => {
    const base = build('gp:m par:m kid:m', [[['gp'], ['par']], [['par'], ['kid']]])
    // The other tree has the kid as the grandparent's father, and other parents for par
    const other = build('k:m g:m p:m x:f', [[['k'], ['g']], [['x'], ['p']]])
    const { doc, r } = merge(base, other, [['kid', 'k'], ['gp', 'g'], ['par', 'p']])
    if (!r.ok) throw new Error(r.reason)
    expect(r.report.skipped).toHaveLength(2)
    expect(r.report.skipped[0]).toContain('their own ancestor')
    expect(r.report.skipped[1]).toContain('already has parents')
    const ix = indexOf(doc)
    expect(ix.parentsOf('gp')).toEqual([])
    expect(ix.parentsOf('par')).toEqual(['gp'])
  })

  it('needs at least one person in both trees, and changes nothing without one', () => {
    const base = build('ann:f', [])
    const { doc, r } = merge(base, build('zed:m', []), [])
    expect(r.ok).toBe(false)
    expect(doc).toBe(base)
  })
})

describe('reviewing a relative’s reply (SHARE.md SH-13 to SH-15)', () => {
  // The tree has Ann and Bob, married. Ann's reply spells Bob differently, gives her birthplace and a
  // new one for Bob, a wedding day, and their new baby.
  const base = () => {
    const doc = build('ann:f bob:m', [[['ann', 'bob'], [], 'married']], null, { ann: 1980, bob: 1978 })
    doc.people.ann.birth = { date: { year: 1980 }, place: 'Bombay' }
    doc.people.bob.photoId = 'ph_old'
    doc.families.f1.start = { year: 2012 }
    return doc
  }
  const reply = () => {
    const doc = build('ann:f bob:m baby:f', [[['ann', 'bob'], ['baby'], 'married']], null, { ann: 1980, bob: 1978, baby: 2024 })
    doc.people.ann.birth = { date: { year: 1980, month: 9, day: 21 }, place: 'Mumbai' }
    doc.people.ann.livesIn = 'Mumbai'
    doc.people.bob.firstName = 'Robert'
    doc.people.bob.photoId = 'ph_new'
    doc.families.f1.start = { year: 2012, month: 10, day: 16 }
    return doc
  }

  it('matches the people the link carried by id, even when a name changed', () => {
    const matches = findMatches(base(), reply(), ['ann', 'bob'])
    expect(matches).toEqual([
      { base: 'ann', other: 'ann', strong: true },
      { base: 'bob', other: 'bob', strong: true },
    ])
  })

  it('lists each difference, and counts the blanks it fills', () => {
    const { changes, fills } = diffPeople(base(), reply(), [['ann', 'ann'], ['bob', 'bob']], { photos: true })
    expect(changes.map((c) => [c.key, c.here, c.theirs])).toEqual([
      ['ann:birth.date', '1980', 'September 21, 1980'],
      ['ann:birth.place', 'Bombay', 'Mumbai'],
      ['bob:firstName', 'Bob', 'Robert'],
      ['bob:photoId', 'ph_old', 'ph_new'],
      ['fam:f1:start', '2012', 'October 16, 2012'],
    ])
    expect(changes.find((c) => c.key === 'bob:photoId')?.photo).toBe(true)
    // Ann's home
    expect(fills).toBe(1)
    // Another tree's photos aren't offered, and the same photo never is
    expect(diffPeople(base(), reply(), [['bob', 'bob']]).changes.map((c) => c.key)).toEqual(['bob:firstName'])
    const same = reply()
    same.people.bob.photoId = 'ph_old'
    expect(diffPeople(base(), same, [['bob', 'bob']], { photos: true }).changes.map((c) => c.key)).toEqual(['bob:firstName'])
  })

  it('takes only the picked differences, and doesn’t list the rest again', () => {
    const take = new Set(['ann:birth.place', 'bob:photoId', 'fam:f1:start'])
    let r: MergeResult | undefined
    const doc = produce(base(), (d) => void (r = mergeTrees(d, reply(), [['ann', 'ann'], ['bob', 'bob']], take)))
    if (!r?.ok) throw new Error('not combined')
    expect(doc.people.ann.birth).toEqual({ date: { year: 1980 }, place: 'Mumbai' })
    expect(doc.people.ann.livesIn).toBe('Mumbai')
    expect(doc.people.bob.firstName).toBe('Bob')
    expect(doc.people.bob.photoId).toBe('ph_new')
    expect(doc.families.f1.start).toEqual({ year: 2012, month: 10, day: 16 })
    expect(r.report).toMatchObject({ added: 1, joined: 2, conflicts: [] })
    expect(indexOf(doc).childrenOf('ann')).toHaveLength(1)
  })
})
