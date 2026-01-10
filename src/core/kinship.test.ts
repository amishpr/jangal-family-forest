import { describe, expect, it } from 'vitest'
import { cousins, cousinsMarried, fourGenerations, remarriage, sameSexParents, singleParent, unknownParents } from '../../tests/fixtures/families'
import { indexOf } from './index'
import { chain, headline, relation, sentence } from './kinship'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { build } from '../../tests/fixtures/build'
import { titleKey } from './titles'
import { treeStats } from './title'

const sample = indexOf(alvarezTree())
const label = (ix = sample, a: string, b: string) => relation(ix, a, b).label

// "B is A's ___" in the sample family, seen from Maya
describe('labels in the sample family', () => {
  it.each([
    ['maya', 'priya', 'mother'],
    ['maya', 'daniel', 'father'],
    ['maya', 'nico', 'sibling'], // Nico's gender is Other, so the word is neutral
    ['nico', 'maya', 'sister'],
    ['maya', 'sam', 'husband'],
    ['sam', 'maya', 'wife'],
    ['maya', 'june', 'daughter'],
    ['june', 'maya', 'mother'],
    ['maya', 'tomas', 'grandfather'],
    ['maya', 'helen', 'grandmother'],
    ['maya', 'raghav', 'grandfather'],
    ['maya', 'lakshmi', 'grandmother'],
    ['maya', 'esteban', 'great-grandfather'],
    ['maya', 'carmen', 'great-grandmother'],
    ['june', 'esteban', 'great-great-grandfather'],
    ['esteban', 'june', 'great-great-granddaughter'],
    ['helen', 'maya', 'granddaughter'],
    ['maya', 'marisol', 'aunt'],
    ['maya', 'luis', 'uncle'],
    ['maya', 'arjun', 'uncle'],
    ['anika', 'priya', 'aunt'],
    ['priya', 'anika', 'niece'],
    ['priya', 'dev', 'nephew'],
    ['maya', 'iris', 'first cousin'],
    ['maya', 'theo', 'first cousin'],
    ['maya', 'anika', 'first cousin'],
    ['maya', 'dev', 'first cousin'], // adoption counts as a full link (PLAN 8.5 rule 6)
    ['iris', 'june', 'first cousin once removed'],
    ['june', 'iris', 'first cousin once removed'],
    ['anika', 'dev', 'brother'],
    ['chloe', 'dev', 'son'],
    ['dev', 'chloe', 'mother'],
    ['maya', 'owen', 'uncle by marriage'],
    ['maya', 'chloe', 'aunt by marriage'],
    ['maya', 'rebecca', "uncle's former wife"],
    ['rebecca', 'luis', 'former husband'],
    ['luis', 'rebecca', 'former wife'],
    ['sam', 'priya', 'mother-in-law'],
    ['sam', 'daniel', 'father-in-law'],
    ['sam', 'nico', 'sibling-in-law'],
    ['nico', 'sam', 'brother-in-law'],
    ['owen', 'tomas', 'father-in-law'],
    ['tomas', 'owen', 'son-in-law'],
    ['helen', 'esteban', 'father-in-law'],
    ['esteban', 'helen', 'daughter-in-law'],
    ['helen', 'sam', "granddaughter's husband"],
    ['sam', 'june', 'daughter'],
    ['maya', 'maya', 'you'],
  ])('%s → %s is %s', (a, b, want) => {
    expect(label(sample, a, b)).toBe(want)
  })

  it('names in-law chains by marriage', () => {
    expect(relation(sample, 'iris', 'anika').kind).toBe('marriage')
    expect(sentence(sample, 'iris', 'anika', null)).toBe("Iris's uncle Daniel is married to Anika's aunt Priya")
    expect(headline(sample, 'iris', 'anika')).toBe('Family by marriage')
  })

  it('writes sentences from you, or in the third person in the neutral view', () => {
    expect(sentence(sample, 'maya', 'anika', 'maya')).toBe('Anika is your first cousin')
    expect(sentence(sample, 'iris', 'june', null)).toBe("June is Iris's first cousin once removed")
    expect(sentence(sample, 'maya', 'maya', 'maya')).toBe('This is you')
    expect(headline(sample, 'maya', 'iris')).toBe('First cousin')
  })

  it('shows the hop chain behind a label', () => {
    const hops = chain(sample, 'maya', 'anika')
    // PLAN R-8: "Maya, her mother Priya, Priya's brother Arjun, his daughter Anika"
    expect(hops.map((h) => h.id)).toEqual(['maya', 'priya', 'arjun', 'anika'])
    expect(hops.map((h) => h.rel)).toEqual([null, 'mother', 'brother', 'daughter'])
  })

  it('says how an adopted link was made in the chain', () => {
    const hops = chain(sample, 'chloe', 'dev')
    expect(hops[1]).toEqual({ id: 'dev', rel: 'adopted son' })
    expect(chain(sample, 'dev', 'arjun')[1]).toEqual({ id: 'arjun', rel: 'adoptive father' })
  })
})

describe('remarriage and step family', () => {
  const ix = indexOf(remarriage())
  it.each([
    ['cal', 'eve', 'half sister'],
    ['eve', 'cal', 'half brother'],
    ['cal', 'dana', 'stepmother'],
    ['dana', 'cal', 'stepson'],
    ['cal', 'finn', 'stepbrother'],
    ['beth', 'adam', 'former husband'],
    ['beth', 'eve', "former husband's daughter"],
    ['finn', 'gus', 'father'],
    ['dana', 'gus', 'former husband'],
  ])('%s → %s is %s', (a, b, want) => {
    expect(label(ix, a, b)).toBe(want)
  })
})

describe('other family shapes', () => {
  it('handles two mothers', () => {
    const ix = indexOf(sameSexParents())
    expect(label(ix, 'kit', 'pat')).toBe('mother')
    expect(label(ix, 'kit', 'quinn')).toBe('mother')
    expect(label(ix, 'pat', 'quinn')).toBe('wife')
  })

  it('keeps a single parent’s children full siblings', () => {
    const ix = indexOf(singleParent())
    expect(label(ix, 'tia', 'uri')).toBe('brother')
    expect(label(ix, 'uri', 'sol')).toBe('father')
  })

  it('groups siblings whose parents are unknown, and their children are cousins', () => {
    const ix = indexOf(unknownParents())
    expect(label(ix, 'vera', 'walt')).toBe('brother')
    expect(label(ix, 'xena', 'yuri')).toBe('first cousin')
    expect(label(ix, 'xena', 'walt')).toBe('uncle')
    expect(label(ix, 'ada', 'walt')).toBe('brother-in-law')
  })

  it('finds the closest link when cousins married', () => {
    const ix = indexOf(cousinsMarried())
    expect(label(ix, 'quil', 'gil')).toBe('great-grandfather')
    expect(label(ix, 'quil', 'jo')).toBe('grandmother')
    expect(label(ix, 'mona', 'ned')).toBe('husband')
    expect(label(ix, 'quil', 'mona')).toBe('mother')
  })

  it('uses neutral words for unknown gender', () => {
    const ix = indexOf(fourGenerations())
    expect(label(ix, 'g4', 'g1')).toBe('great-grandparent')
    expect(label(ix, 'g1', 'g4')).toBe('great-grandchild')
    expect(label(ix, 'g4', 'g3')).toBe('parent')
  })

  it.each([
    ['dee', 'gus', 'second cousin'],
    ['eli', 'gus', 'second cousin once removed'],
    ['eli', 'fay', 'first cousin twice removed'],
    ['cal', 'fay', 'first cousin'],
    ['dee', 'ben', 'great-uncle'],
    ['ben', 'dee', 'grandniece'],
    ['cal', 'sis', "parent's sibling"],
    ['sis', 'cal', 'nephew'],
    ['ann', 'nib', "sibling's child"],
    ['dee', 'sis', "grandparent's sibling"],
    ['sis', 'dee', 'grandniece'],
    ['ann', 'hal', 'great-grandnephew'],
  ])('cousins: %s → %s is %s', (a, b, want) => {
    expect(label(indexOf(cousins()), a, b)).toBe(want)
  })

  it('says when two people are not connected at all', () => {
    const doc = singleParent()
    doc.people.zed = { id: 'zed', firstName: 'Zed', createdAt: '', updatedAt: '' }
    const ix = indexOf(doc)
    expect(relation(ix, 'tia', 'zed').kind).toBe('none')
    expect(sentence(ix, 'tia', 'zed', 'tia')).toBe("There's no link between Tia and Zed in this tree yet")
  })
})

describe('pets (TODO.md F14)', () => {
  const doc = build('gran:f ann:f bob:m kid:m cuz:f dog:u cat:u', [[['gran'], ['ann', 'cuzmom']], [['ann', 'bob'], ['kid', 'dog']], [['cuzmom'], ['cuz']], [['cuz'], ['cat']]], 'kid')
  doc.people.cuzmom = { ...doc.people.gran, id: 'cuzmom', firstName: 'Cuzmom' }
  doc.people.dog.species = 'Dog'
  doc.people.cat.species = 'Cat'
  const ix = indexOf(doc)

  it('aren’t anyone’s brother or sister', () => {
    expect(ix.siblingsOf('kid')).toEqual([])
    expect(ix.siblingsOf('dog')).toEqual([])
  })

  it('are named from their owners', () => {
    expect(label(ix, 'ann', 'dog')).toBe('dog')
    expect(label(ix, 'kid', 'dog')).toBe("mother's dog")
    expect(label(ix, 'kid', 'cat')).toBe("first cousin's cat")
    expect(label(ix, 'dog', 'ann')).toBe('owner')
    expect(relation(ix, 'dog', 'kid').kind).toBe('none')
    expect(sentence(ix, 'kid', 'dog', 'kid')).toBe("Dog is your mother's dog")
  })

  it('get no family title, and are counted apart', () => {
    expect(titleKey(ix, 'ann', 'dog')).toBeNull()
    expect(treeStats(ix)).toBe('6 people · 2 pets · 3 generations')
  })
})
