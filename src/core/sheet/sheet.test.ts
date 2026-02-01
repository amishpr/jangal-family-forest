import { describe, expect, it } from 'vitest'
import { alvarezTree } from '../../../tests/fixtures/alvarez'
import { indexOf } from '../index'
import type { TreeDoc } from '../model'
import { sampleTree } from '../sample'
import { decodeText, parseCsv, toCsv, unprotect } from './csv'
import { COLUMNS, readDateText, rowsToTree, slashOrder, templateRows, treeToRows, writeDate } from './rows'

// Spreadsheets (TODO.md F3)

describe('CSV', () => {
  it('reads quotes, commas, line breaks, CRLF, a BOM, and semicolons', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"\nthere'],
    ])
    expect(parseCsv('ID;First name\n1;Asha\n')).toEqual([
      ['ID', 'First name'],
      ['1', 'Asha'],
    ])
    expect(parseCsv('a,b\n1,')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ])
  })

  it('writes what it reads, and keeps formulas as text', () => {
    const rows = [['ID', 'Notes'], ['1', 'Line one\nline "two", with a comma'], ['2', '=HYPERLINK("x")']]
    const text = toCsv(rows)
    expect(text.startsWith('﻿')).toBe(true)
    expect(text).toContain(`'=HYPERLINK`)
    expect(parseCsv(text).map((r) => r.map(unprotect))).toEqual(rows)
  })

  it('reads old Windows files as well as UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('Tomás').buffer)).toBe('Tomás')
    expect(decodeText(new Uint8Array([0x54, 0x6f, 0x6d, 0xe1, 0x73]).buffer)).toBe('Tomás')
  })
})

describe('dates in a sheet', () => {
  it('reads the ways people and spreadsheets write them', () => {
    const cases: [string, object | undefined][] = [
      ['1924-12-14', { year: 1924, month: 12, day: 14 }],
      ['1958-07', { year: 1958, month: 7 }],
      ['1923', { year: 1923 }],
      ['about 1920', { year: 1920, approx: true }],
      ['c. 1880', { year: 1880, approx: true }],
      ['14 December 1924', { year: 1924, month: 12, day: 14 }],
      ['December 14, 1924', { year: 1924, month: 12, day: 14 }],
      ['Dec 1924', { year: 1924, month: 12 }],
      ['14/12/1924', { year: 1924, month: 12, day: 14 }],
      ['', undefined],
    ]
    for (const [text, want] of cases) expect(readDateText(text).date, text).toEqual(want)
    expect(readDateText('3/4/1990', 'mdy').date).toEqual({ year: 1990, month: 3, day: 4 })
    expect(readDateText('31/02/1990').error).toBe('February 1990 has 28 days')
    expect(readDateText('next tuesday').error).toMatch(/isn't a date/)
  })

  it('works out a file’s day and month order from any date that can only be one way', () => {
    expect(slashOrder(['05/06/1990', '25/12/1980'])).toBe('dmy')
    expect(slashOrder(['05/06/1990', '12/25/1980'])).toBe('mdy')
    expect(slashOrder(['05/06/1990', '1990-01-01'])).toBeNull()
  })

  it('writes dates back the same way', () => {
    for (const s of ['1924-12-14', '1958-07', '1923', 'about 1920']) expect(writeDate(readDateText(s).date)).toBe(s)
  })
})

describe('a tree as rows', () => {
  it('reads the template into a couple and their daughter, marked as you', () => {
    const res = rowsToTree(templateRows())
    if ('error' in res) throw new Error(res.error)
    const { tree, report } = res
    expect(report).toEqual([])
    const ix = indexOf(tree)
    const asha = ix.ids.find((id) => ix.person(id)!.firstName === 'Asha')!
    expect(tree.homePersonId).toBe(asha)
    expect(ix.parentsOf(asha).map((id) => ix.person(id)!.firstName).sort()).toEqual(['Meena', 'Ravi'])
    expect(ix.person(asha)!.tags).toEqual(['Left-handed', 'Curly hair'])
    // Where she lives now goes both ways (TODO.md F15)
    expect(ix.person(asha)!.livesIn).toBe('London')
    expect(treeToRows(tree).find((r) => r.includes('Asha'))).toContain('London')
    const ravi = ix.person(ix.parentsOf(asha).find((id) => ix.person(id)!.firstName === 'Ravi')!)!
    expect(ravi.deceased).toBe(true)
    // What the family calls him (TODO.md CT-6), both ways
    expect(ravi.calledBy).toBe('Pappa')
    expect(treeToRows(tree).find((r) => r.includes('Ravi'))).toContain('Pappa')
    expect(ravi.death?.date).toEqual({ year: 2019 })
    expect(Object.values(tree.families)).toHaveLength(1)
  })

  it('says, row by row, what it couldn’t use, and never loops', () => {
    const res = rowsToTree([
      ['id', 'Given name', 'Sex', 'DOB', 'Father ID', 'Mother ID', 'Spouse', 'Favourite food'],
      ['a', 'Ann', 'F', 'not a date', '', '', 'zz', 'Dal'],
      ['b', 'Bo', 'M', '', 'a', 'b', '', ''],
      ['b', 'Bob', 'M', '', '', '', '', ''],
      ['c', 'Cy', 'Nonbinary', '', 'd', '', '', ''],
      ['d', 'Di', 'F', '', 'c', '', '', ''],
    ])
    if ('error' in res) throw new Error(res.error)
    expect(res.report).toEqual([
      'The column "Favourite food" isn\'t one this reads, so it was left out',
      'Row 2, birth date: "not a date" isn\'t a date this can read. Use 1990-05-31, or just the year',
      'Row 4: the ID b is already used on row 3, so this row was left out',
      "Row 2: the partner ID zz isn't in the sheet, so it was left out",
      'Row 3 names this person as their own parent, so that was left out',
      "Row 5: a parent here is also this person's child or grandchild, so the parents were left out",
    ])
    const ix = indexOf(res.tree)
    const cy = ix.ids.find((id) => ix.person(id)!.firstName === 'Cy')!
    expect(ix.person(cy)).toMatchObject({ gender: 'other', genderOther: 'Nonbinary' })
  })

  it('keeps brothers and sisters whose parents aren’t in the sheet together', () => {
    const res = rowsToTree([
      ['ID', 'First name', 'Sibling IDs', 'Parent 1 ID'],
      ['1', 'Shirin', '2; 3', ''],
      ['2', 'Purnima', '', ''],
      ['3', 'Kamal', '1', ''],
      ['4', 'Asha', '5', ''],
      ['5', 'Mahesh', '', '1'],
    ])
    if ('error' in res) throw new Error(res.error)
    expect(res.report).toEqual(["Row 5: Sibling IDs are for people whose parents aren't in the sheet, so 5 was left out"])
    const ix = indexOf(res.tree)
    const first = (id: string) => ix.person(id)!.firstName
    expect(ix.siblingsOf(ix.ids.find((id) => first(id) === 'Shirin')!).map(first).sort()).toEqual(['Kamal', 'Purnima'])
    expect(Object.values(res.tree.families).filter((f) => !f.partnerIds.length)).toHaveLength(1)
  })

  it('refuses a sheet with nothing to read', () => {
    expect(rowsToTree([['Colour'], ['red']])).toEqual({ error: expect.stringContaining('no "First name" column') })
    expect(rowsToTree([COLUMNS.map((c) => c.header)])).toEqual({ error: 'This spreadsheet has no people in it.' })
  })

  // Everything a sheet keeps comes back, apart from the ids, family statuses other than married and
  // divorced, and partnership dates
  const shape = (doc: Pick<TreeDoc, 'people' | 'families' | 'homePersonId'>) => {
    const ix = indexOf(doc)
    const name = (id: string) => `${ix.person(id)!.firstName} ${ix.person(id)!.lastName ?? ''}`
    return {
      people: ix.ids.map((id) => {
        const { id: _id, createdAt: _c, updatedAt: _u, photoId: _ph, ...rest } = ix.person(id)!
        return rest
      }),
      parents: ix.ids.map((id) => [name(id), ix.parentsOf(id).map(name).sort(), ix.birthFamilyOf(id) ? ix.childKind(ix.birthFamilyOf(id)!, id) : null]),
      partners: ix.ids.map((id) => ix.partnersOf(id).map(name).sort()),
      home: doc.homePersonId ? name(doc.homePersonId) : null,
    }
  }

  it.each([
    ['the Alvarez family', alvarezTree()],
    ['the Kapoor family', sampleTree()],
  ])('round trips %s through CSV', (_, doc) => {
    const back = rowsToTree(parseCsv(toCsv(treeToRows(doc))).map((r) => r.map(unprotect)))
    if ('error' in back) throw new Error(back.error)
    expect(back.report).toEqual([])
    expect(shape(back.tree)).toEqual(shape(doc))
  })
})
