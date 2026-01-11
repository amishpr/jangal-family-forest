import { describe, expect, it } from 'vitest'
import { indexOf } from './index'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { searchPeople } from './search'

const ix = indexOf(alvarezTree())
const top = (q: string) => searchPeople(ix, q)[0]?.id

describe('finding people', () => {
  it.each([
    ['iris', 'iris'],
    ['Lakshmy', 'lakshmi'], // a typo still matches (PLAN S-1)
    ['tomas', 'tomas'], // accents don't matter
    ['Whitfield', 'helen'], // maiden name
    ['Sevilla', 'esteban'], // birthplace
    ['1970', 'priya'], // birth year
    ['kent', 'marisol'], // surname, first in document order
  ])('"%s" finds %s', (q, id) => {
    expect(top(q)).toBe(id)
  })

  it('puts names that start with the query first', () => {
    expect(searchPeople(ix, 'ma').slice(0, 2).map((m) => m.id)).toEqual(['marisol', 'maya'])
  })

  it('finds someone by where they live now (TODO.md F15)', () => {
    const doc = alvarezTree()
    doc.people.iris.livesIn = 'Reykjavik'
    expect(searchPeople(indexOf(doc), 'reykjavik')[0]?.id).toBe('iris')
  })

  it('finds nothing for an empty query', () => {
    expect(searchPeople(ix, '  ')).toEqual([])
  })
})
