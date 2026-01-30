import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { indexOf } from '../index'
import { relation } from '../kinship'
import { parseGedcomDate } from './dates'
import { readGedcomFile } from './import'

const load = (name: string) => {
  const buf = readFileSync(new URL(`../../../tests/fixtures/gedcom/${name}`, import.meta.url))
  const res = readGedcomFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  if (!res.ok) throw new Error(res.error)
  return res
}

describe('GEDCOM dates', () => {
  it.each([
    ['12 MAR 1955', { year: 1955, month: 3, day: 12 }],
    ['MAR 1955', { year: 1955, month: 3 }],
    ['1955', { year: 1955 }],
    ['ABT 1920', { year: 1920, approx: true }],
    ['EST 1880', { year: 1880, approx: true }],
    ['BEF 1900', { year: 1900, approx: true }],
    ['AFT 1880', { year: 1880, approx: true }],
    ['BET 1900 AND 1910', { year: 1900, approx: true }],
    ['FROM 1900 TO 1910', { year: 1900, approx: true }],
    ['14 May 1943', { year: 1943, month: 5, day: 14 }],
    ['11 FEB 1750/51', { year: 1750, month: 2, day: 11 }],
    ['INT 1920 (about when the war ended)', { year: 1920 }],
    ['23 January 1941', { year: 1941, month: 1, day: 23 }],
  ])('"%s"', (raw, want) => expect(parseGedcomDate(raw)).toEqual(want))

  it("leaves text it can't read", () => {
    expect(parseGedcomDate('(when she was young)')).toBeUndefined()
    expect(parseGedcomDate('23 Janvier 1941')).toBeUndefined()
  })
})

describe('an Ancestry export', () => {
  const res = load('ancestry.ged')
  const { people, families } = res.preview.tree
  it('reads people, names and dates', () => {
    expect(res.preview.people).toBe(5)
    expect(people.g_I1).toMatchObject({ firstName: 'Tomás', lastName: 'Alvarez', gender: 'male', deceased: true })
    expect(people.g_I1.birth).toEqual({ date: { year: 1943, month: 5, day: 14 }, place: 'Sevilla, Andalucía, Spain' })
    expect(people.g_I3.birth?.date).toEqual({ year: 1966, month: 4 })
  })
  it('makes the married name the last name and keeps the birth surname', () => {
    expect(people.g_I2).toMatchObject({ firstName: 'Helen', lastName: 'Alvarez', birthSurname: 'Whitfield' })
    expect(people.g_I2.notes).toBe('Taught third grade for 31 years.\nStill hosts Sunday lunch.')
  })
  it('reads families, marriage, and adoption', () => {
    expect(families.f_F1).toMatchObject({ partnerIds: ['g_I1', 'g_I2'], status: 'married', start: { year: 1965 } })
    expect(families.f_F1.children).toEqual([
      { personId: 'g_I3', kind: 'biological' },
      { personId: 'g_I4', kind: 'adopted' },
    ])
    const ix = indexOf(res.preview.tree)
    expect(relation(ix, 'g_I3', 'g_I4').label).toBe('brother')
  })
  it('reports what it skipped', () => {
    expect(res.report).toContain('Skipped 1 source record. Jangal doesn\'t track sources yet.')
    expect(res.report).toContain('Skipped 1 occupations')
    expect(res.report).toContain('Skipped 1 residences')
    expect(res.report.some((l) => l.includes('1 person has no name (I5)'))).toBe(true)
    expect(res.report.some((l) => l.includes('tomas-1965.jpg'))).toBe(true)
  })
})

describe('a FamilySearch export', () => {
  const res = load('familysearch.ged')
  const { people, families } = res.preview.tree
  it('reads full month names', () => {
    expect(people.g_P1.birth?.date).toEqual({ year: 1941, month: 1, day: 23 })
  })
  it('reads a death with no date, a range, and a divorce', () => {
    expect(people.g_P2).toMatchObject({ firstName: 'Lakshmi', lastName: 'Iyer', deceased: true })
    expect(people.g_P2.death).toBeUndefined()
    expect(people.g_P3.birth?.date).toEqual({ year: 1972, approx: true })
    expect(families.f_F2).toMatchObject({ status: 'divorced', end: { year: 1990 } })
    expect(families.f_F2.children.map((c) => c.kind)).toEqual(['biological', 'biological'])
  })
})

describe('an ANSEL file', () => {
  it('decodes accents written before their letters', () => {
    const res = load('ansel.ged')
    expect(res.report[0]).toBe('Read as ANSEL')
    expect(res.preview.tree.people.g_I1).toMatchObject({ firstName: 'José', lastName: 'Muñoz' })
    expect(res.preview.tree.people.g_I1.birth).toEqual({ date: { year: 1880, approx: true }, place: 'Málaga, Spain' })
  })
})

describe('awkward files', () => {
  const ged = (body: string) => new TextEncoder().encode(`0 HEAD\n1 CHAR UNICODE\n${body}0 TRLR\n`).buffer as ArrayBuffer

  it('reads an 8-bit file that says it is UNICODE as UTF-8', () => {
    const res = readGedcomFile(ged('0 @I1@ INDI\n1 NAME Jos\u00e9 /Mu\u00f1oz/\n'))
    if (!res.ok) throw new Error(res.error)
    expect(res.preview.tree.people.g_I1).toMatchObject({ firstName: 'José', lastName: 'Muñoz' })
  })

  it('drops a child listed twice, and a parent listed as their own child', () => {
    const res = readGedcomFile(ged('0 @I1@ INDI\n1 NAME Ann\n0 @I2@ INDI\n1 NAME Ben\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@\n1 CHIL @I2@\n1 CHIL @I1@\n'))
    if (!res.ok) throw new Error(res.error)
    expect(res.preview.tree.families.f_F1.children).toEqual([{ personId: 'g_I2', kind: 'biological' }])
  })
})

describe('the order of children (TODO.md F18)', () => {
  const ged = (body: string) => new TextEncoder().encode(`0 HEAD\n1 CHAR UTF-8\n${body}0 TRLR\n`).buffer as ArrayBuffer
  const people = '0 @I1@ INDI\n1 NAME Ann\n1 BIRT\n2 DATE 1950\n0 @I2@ INDI\n1 NAME Ben\n1 BIRT\n2 DATE 1952\n0 @I3@ INDI\n1 NAME Cal\n1 BIRT\n2 DATE 1955\n0 @I4@ INDI\n1 NAME Dad\n'
  const fam = (kids: string[]) => `0 @F1@ FAM\n1 HUSB @I4@\n${kids.map((k) => `1 CHIL @${k}@\n`).join('')}`

  it('keeps an order the file gives that isn’t birth order', () => {
    const res = readGedcomFile(ged(people + fam(['I3', 'I1', 'I2'])))
    if (!res.ok) throw new Error(res.error)
    const f = res.preview.tree.families.f_F1
    expect(f.childOrder).toBe('set')
    expect(f.children.map((c) => c.personId)).toEqual(['g_I3', 'g_I1', 'g_I2'])
  })

  it('leaves children listed by birth to be shown by birth', () => {
    const res = readGedcomFile(ged(people + fam(['I1', 'I2', 'I3'])))
    if (!res.ok) throw new Error(res.error)
    expect(res.preview.tree.families.f_F1.childOrder).toBeUndefined()
  })
})

describe('files that are not GEDCOM', () => {
  it('says so', () => {
    const buf = new TextEncoder().encode('hello there').buffer as ArrayBuffer
    expect(readGedcomFile(buf)).toMatchObject({ ok: false })
  })
})
