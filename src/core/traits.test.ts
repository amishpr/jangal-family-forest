import { describe, expect, it } from 'vitest'
import { build } from '../../tests/fixtures/build'
import { indexOf } from './index'
import type { TreeDoc } from './model'
import { allTraits, cleanTraits, hasTrait, spellTrait, traitKey, traitLineage, traitView } from './traits'

// Traits (TODO.md F2)

/** gran -> mum -> kid -> baby, with dad married in, and kid's sister sis */
function family(tags: Record<string, string[]>): TreeDoc {
  const doc = build('gran:f mum:f dad:m kid:m sis:f baby:u pal:f', [
    [['gran'], ['mum']],
    [['mum', 'dad'], ['kid', 'sis']],
    [['kid', 'pal'], ['baby'], undefined, { baby: 'adopted' }],
  ])
  for (const [id, t] of Object.entries(tags)) doc.people[id].tags = t
  return doc
}

describe('traits', () => {
  it('matches a trait however it was written, and keeps the first spelling', () => {
    expect(traitKey('  Left-handed ')).toBe(traitKey('left   handed'))
    const ix = indexOf(family({ gran: ['Left-handed'], kid: ['left handed', 'Brown eyes'], sis: ['Brown eyes'] }))
    expect(allTraits(ix)).toEqual([
      { name: 'Brown eyes', count: 2 },
      { name: 'Left-handed', count: 2 },
    ])
    expect(spellTrait(ix, 'LEFT HANDED')).toBe('Left-handed')
    expect(spellTrait(ix, '  red   hair ')).toBe('Red hair') // from the starter list
    expect(spellTrait(ix, 'has a lisp')).toBe('Has a lisp')
    expect(hasTrait(ix, 'kid', 'Left-Handed')).toBe(true)
    expect(cleanTraits(ix, ['left handed', ' ', 'Tall', 'LEFT-HANDED', 'tall '])).toEqual(['Left-handed', 'Tall'])
    expect(cleanTraits(ix, ['', '  '])).toBeUndefined()
  })

  it('follows a trait down a line, and counts its generations', () => {
    const v = traitView(indexOf(family({ gran: ['Curly hair'], mum: ['Curly hair'], kid: ['Curly hair'], baby: ['Curly hair'] })), 'curly hair')
    expect(v.carriers).toEqual(expect.arrayContaining(['gran', 'mum', 'kid', 'baby']))
    expect(v.links.map((l) => `${l.parentId}>${l.childId}`).sort()).toEqual(['gran>mum', 'kid>baby', 'mum>kid'])
    expect(v.skips).toEqual([])
    expect(v.generations).toBe(4)
  })

  it('notices a skipped generation, and leaves people who married in unlinked', () => {
    const v = traitView(indexOf(family({ gran: ['Dimples'], kid: ['Dimples'], dad: ['Dimples'], pal: ['Dimples'] })), 'Dimples')
    // kid gets it from dad, so that's a link, not a skip
    expect(v.links.map((l) => `${l.parentId}>${l.childId}`)).toEqual(['dad>kid'])
    expect(v.skips).toEqual([])
    const skip = traitView(indexOf(family({ gran: ['Dimples'], kid: ['Dimples'] })), 'Dimples')
    expect(skip.links).toEqual([])
    expect(skip.skips).toEqual([{ personId: 'kid', ancestorId: 'gran', generations: 2 }])
    expect(skip.generations).toBe(2)
    // pal married in and nobody above her has it: no link, no skip, a line of one
    const alone = traitView(indexOf(family({ pal: ['Freckles'] })), 'Freckles')
    expect(alone).toEqual({ carriers: ['pal'], links: [], skips: [], generations: 1 })
  })

  it('has nothing to show for a trait nobody has', () => {
    expect(traitView(indexOf(family({})), 'Tall')).toEqual({ carriers: [], links: [], skips: [], generations: 0 })
  })

  it('tells one person where a trait came from, and who they passed it on to (TR-7)', () => {
    const ix = indexOf(family({ gran: ['Dimples'], mum: ['Dimples'], dad: ['Dimples'], kid: ['Dimples'], baby: ['Dimples'], sis: ['Tall'] }))
    expect(traitLineage(ix, 'kid', 'dimples')).toEqual({ from: ['mum', 'dad'], skippedFrom: null, to: ['baby'] })
    expect(traitLineage(ix, 'gran', 'dimples')).toEqual({ from: [], skippedFrom: null, to: ['mum'] })
    const skip = indexOf(family({ gran: ['Tall'], kid: ['Tall'] }))
    expect(traitLineage(skip, 'kid', 'Tall')).toEqual({ from: [], skippedFrom: { id: 'gran', generations: 2 }, to: [] })
  })
})

