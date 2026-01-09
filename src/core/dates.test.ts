import { describe, expect, it } from 'vitest'
import { age, formatDate, fromIsoDate, isMilestone, nextBirthday, toIsoDate, yearsLabel } from './dates'
import type { Person } from './model'

const person = (birth?: Person['birth'], death?: Person['death'], deceased?: boolean): Person => ({
  id: 'x', firstName: 'X', birth, death, deceased, createdAt: '', updatedAt: '',
})
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('formatting partial dates', () => {
  it.each([
    [{ year: 1911, month: 3, day: 2 }, 'Mar 2, 1911'],
    [{ year: 1955, month: 3 }, 'Mar 1955'],
    [{ year: 1920, approx: true }, 'about 1920'],
    [{ year: 1920, month: 5, approx: true }, 'about May 1920'],
    [undefined, ''],
  ])('%o is "%s"', (d, want) => expect(formatDate(d)).toBe(want))

  it('can write the month in full', () => {
    expect(formatDate({ year: 1955, month: 3 }, true)).toBe('March 1955')
  })

  it('writes lifespans', () => {
    expect(yearsLabel(person({ date: { year: 1970 } }))).toBe('b. 1970')
    expect(yearsLabel(person({ date: { year: 1911 } }, { date: { year: 1979 } }))).toBe('1911 - 1979')
    expect(yearsLabel(person({ date: { year: 1911 } }, undefined, true))).toBe('1911 - ?')
    expect(yearsLabel(person())).toBe('')
  })
})

describe('ages', () => {
  it('counts birthdays that have not happened yet this year', () => {
    const p = person({ date: { year: 1996, month: 10, day: 9 } })
    expect(age(p, on(2026, 10, 8))).toBe(29)
    expect(age(p, on(2026, 10, 9))).toBe(30)
  })
  it('uses the year alone when that is all there is', () => {
    expect(age(person({ date: { year: 1990 } }), on(2026, 1, 1))).toBe(36)
  })
  it('stops at death', () => {
    const p = person({ date: { year: 1911, month: 3, day: 2 } }, { date: { year: 1979, month: 11, day: 20 } })
    expect(age(p, on(2026, 1, 1))).toBe(68)
  })
  it("doesn't guess when a death date is missing", () => {
    expect(age(person({ date: { year: 1911 } }, undefined, true))).toBeNull()
  })
})

describe('next birthday', () => {
  it('counts days and the age they turn', () => {
    const p = person({ date: { year: 1946, month: 10, day: 12 } })
    expect(nextBirthday(p, on(2026, 9, 30))).toMatchObject({ days: 12, turning: 80 })
  })
  it('is today when it is today', () => {
    const p = person({ date: { year: 2023, month: 10, day: 1 } })
    expect(nextBirthday(p, on(2026, 10, 1))).toMatchObject({ days: 0, turning: 3 })
  })
  it('rolls over to next year', () => {
    const p = person({ date: { year: 1941, month: 1, day: 23 } })
    const nb = nextBirthday(p, on(2026, 9, 30))!
    expect(nb.date.getFullYear()).toBe(2027)
    expect(nb.turning).toBe(86)
  })
  it('puts Feb 29 birthdays on Feb 28 in other years', () => {
    const p = person({ date: { year: 2000, month: 2, day: 29 } })
    expect(nextBirthday(p, on(2027, 1, 1))!.date).toEqual(on(2027, 2, 28))
    expect(nextBirthday(p, on(2028, 1, 1))!.date).toEqual(on(2028, 2, 29))
  })
  it('needs a month and a day', () => {
    expect(nextBirthday(person({ date: { year: 1990, month: 5 } }))).toBeNull()
  })
  it('knows the milestones', () => {
    expect([18, 21, 30, 50, 75, 80].every(isMilestone)).toBe(true)
    expect([17, 22, 33].some(isMilestone)).toBe(false)
  })
})

describe('date inputs', () => {
  it('round trips full dates only', () => {
    expect(toIsoDate({ year: 1970, month: 2, day: 18 })).toBe('1970-02-18')
    expect(toIsoDate({ year: 1970 })).toBe('')
    expect(fromIsoDate('1970-02-18')).toEqual({ year: 1970, month: 2, day: 18 })
    expect(fromIsoDate('')).toBeUndefined()
  })
})
