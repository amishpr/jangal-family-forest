import { describe, expect, it } from 'vitest'
import { anchorId, canCollapseFamily, hiddenBy, revealPerson, visibleSets } from './collapse'
import { indexOf } from './index'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { foundingLines, sidesOf } from './sides'
import { calendarName, generations, suggestedTitle, titleSlug, treeStats, treeTitle } from './title'

const doc = alvarezTree()
const ix = indexOf(doc)

describe('branch sides from Maya', () => {
  const s = sidesOf(ix, 'maya')
  it.each([
    ['maya', 'own'], ['nico', 'own'], ['june', 'own'], ['sam', 'own'],
    ['daniel', 'paternal'], ['tomas', 'paternal'], ['esteban', 'paternal'], ['iris', 'paternal'], ['theo', 'paternal'],
    ['owen', 'paternal'], ['rebecca', 'paternal'],
    ['priya', 'maternal'], ['raghav', 'maternal'], ['anika', 'maternal'], ['dev', 'maternal'], ['chloe', 'maternal'],
  ])('%s is on the %s side', (id, side) => expect(s.side(id)).toBe(side))

  it('knows who married in', () => {
    expect(s.info('owen')).toEqual({ side: 'paternal', blood: false })
    expect(s.info('iris')).toEqual({ side: 'paternal', blood: true })
  })

  it("names the sides after the father's surname and the mother's birth surname", () => {
    expect(s.names).toMatchObject({ paternal: 'Alvarez side', maternal: 'Raman side', own: 'Your family' })
  })

  it('follows whoever is marked as you', () => {
    const fromIris = sidesOf(ix, 'iris')
    expect(fromIris.side('owen')).toBe('paternal') // Owen is Iris's father
    expect(fromIris.side('marisol')).toBe('maternal')
    expect(fromIris.side('felix')).toBe('own')
    expect(fromIris.names.paternal).toBe('Kent side')
  })
})

describe('the neutral view', () => {
  const s = sidesOf(ix, null)
  it('finds the founding lines, largest first', () => {
    const lines = foundingLines(ix)
    expect(lines.map((l) => l.surname)).toEqual(['Alvarez', 'Raman'])
    expect(lines[0].roots).toEqual(['esteban', 'carmen'])
  })
  it('shades by line, with both lines where they meet', () => {
    expect(s.side('iris')).toBe('paternal')
    expect(s.side('anika')).toBe('maternal')
    expect(s.side('maya')).toBe('own')
    expect(s.side('june')).toBe('own')
    expect(s.info('sam')).toEqual({ side: 'own', blood: false })
    expect(s.names).toMatchObject({ paternal: 'Alvarez line', maternal: 'Raman line', own: 'Both lines' })
  })
  it('measures collapse from the person with the most recorded ancestors', () => {
    expect(anchorId(ix, null)).toBe('june')
    expect(anchorId(ix, 'iris')).toBe('iris')
  })
})

describe('tucking branches away', () => {
  const none = { collapsedFamilies: [], collapsedAncestors: [] }
  it("won't tuck away your own line", () => {
    expect(canCollapseFamily(ix, 'maya', 'f_daniel')).toBe(false)
    expect(canCollapseFamily(ix, 'maya', 'f_marisol')).toBe(true)
  })
  it('hides the descendants of a tucked family', () => {
    const c = { ...none, collapsedFamilies: ['f_arjun'] }
    const v = visibleSets(ix, 'maya', c)
    expect(v.persons.has('anika')).toBe(false)
    expect(v.persons.has('arjun')).toBe(true)
    expect(hiddenBy(ix, 'maya', c, 'fam', 'f_arjun').sort()).toEqual(['anika', 'dev'])
  })
  it('hides the ancestors above someone', () => {
    const c = { ...none, collapsedAncestors: ['priya'] }
    const v = visibleSets(ix, 'maya', c)
    expect(['raghav', 'lakshmi', 'arjun', 'anika'].some((id) => v.persons.has(id))).toBe(false)
    expect(v.persons.has('priya')).toBe(true)
  })
  it('opens only the folds that hide someone', () => {
    const c = { collapsedFamilies: ['f_arjun', 'f_marisol'], collapsedAncestors: [] }
    expect(revealPerson(ix, 'maya', c, 'dev')).toEqual({ collapsedFamilies: ['f_marisol'], collapsedAncestors: [] })
    expect(revealPerson(ix, 'maya', c, 'maya')).toBeNull()
  })
})

describe('the tree title', () => {
  it('is suggested from the two largest lines', () => {
    expect(suggestedTitle(ix)).toBe('The Alvarez & Raman Family')
  })
  it('keeps a renamed title, and goes back to the suggestion when cleared', () => {
    expect(treeTitle({ title: 'Our Lot', titleAuto: false }, ix)).toBe('Our Lot')
    expect(treeTitle({ title: '  ', titleAuto: false }, ix)).toBe('The Alvarez & Raman Family')
    expect(treeTitle({ title: 'Old', titleAuto: true }, ix)).toBe('The Alvarez & Raman Family')
  })
  it('falls back to a surname, then to a plain title', () => {
    const one = indexOf({ people: { a: { id: 'a', firstName: 'A', lastName: 'Shah', createdAt: '', updatedAt: '' } }, families: {} })
    expect(suggestedTitle(one)).toBe('The Shah Family')
    expect(suggestedTitle(indexOf({ people: {}, families: {} }))).toBe('Our Family Tree')
  })
  it('writes the stats line', () => {
    expect(treeStats(ix)).toBe('23 people · 5 generations · since 1911')
    expect(generations(ix).get('june')).toBe(4)
  })
  it('makes file names and a calendar name', () => {
    expect(titleSlug('The Alvarez & Raman Family')).toBe('alvarez-raman-family')
    expect(titleSlug('The Núñez Family!')).toBe('nunez-family')
    expect(titleSlug('પટેલ પરિવાર')).toBe('પટેલ-પરિવાર')
    expect(titleSlug('!!!')).toBe('family-tree')
    expect(calendarName('The Alvarez & Raman Family')).toBe('Alvarez & Raman birthdays')
  })
  it("doesn't depend on who is marked as you", () => {
    const asIris = { ...doc, homePersonId: 'iris' }
    expect(treeTitle(asIris, indexOf(asIris))).toBe(treeTitle(doc, ix))
  })
})
