import { describe, expect, it } from 'vitest'
import { birthdaysIcs, birthdaysInMonth, upcoming } from './calendar'
import { indexOf } from './index'
import { alvarezTree } from '../../tests/fixtures/alvarez'

const ix = indexOf(alvarezTree())
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d)

describe('upcoming birthdays', () => {
  it('lists the next few, soonest first, living people only by default', () => {
    const list = upcoming(ix, 20, {}, on(2026, 9, 30))
    expect(list.map((u) => u.id)).toEqual(['luis', 'june', 'daniel', 'maya', 'helen'])
    expect(list[0].next.days).toBe(0)
    // Helen turns 80: a milestone
    expect(list.find((u) => u.id === 'helen')).toMatchObject({ milestone: true, next: { turning: 80 } })
  })

  it('can include people who have died', () => {
    const list = upcoming(ix, 365, { includeDeceased: true }, on(2026, 9, 30))
    expect(list.some((u) => u.id === 'esteban' && u.deceased)).toBe(true)
  })

  it('groups a month by day', () => {
    const oct = birthdaysInMonth(ix, 10)
    expect(oct.get(9)).toEqual(['maya'])
    expect(oct.get(1)).toEqual(['june'])
  })
})

describe('the calendar file', () => {
  const ics = birthdaysIcs(ix, { appName: 'Jangal', slug: 'jangal', calendarName: 'Alvarez & Raman birthdays', now: new Date(Date.UTC(2026, 8, 30, 12)) })
  it('has one yearly event per living person with a full birthday', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Jangal//Birthdays//EN')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(19) // 23 people, 4 of whom have died
    expect(ics).toContain('X-WR-CALNAME:Alvarez & Raman birthdays')
    expect(ics).toContain('DTSTART;VALUE=DATE:19961009\r\nRRULE:FREQ=YEARLY\r\nSUMMARY:Maya Alvarez\'s birthday')
    expect(ics).toContain('UID:maya-birthday@jangal')
    expect(ics).not.toContain('Esteban')
  })

  it('keeps leap day birthdays every year', () => {
    const doc = alvarezTree()
    doc.people.maya.birth = { date: { year: 1996, month: 2, day: 29 } }
    const out = birthdaysIcs(indexOf(doc), { appName: 'Jangal', slug: 'jangal', calendarName: 'x' })
    expect(out).toContain('DTSTART;VALUE=DATE:19960229\r\nRRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1')
  })

  it('escapes commas and folds long lines', () => {
    const doc = alvarezTree()
    doc.people.maya.firstName = 'Maya, the one who started this tree and kept adding cousins until midnight'
    const out = birthdaysIcs(indexOf(doc), { appName: 'Jangal', slug: 'jangal', calendarName: 'x' })
    expect(out).toContain('SUMMARY:Maya\\, the one')
    expect(out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
  })
})
