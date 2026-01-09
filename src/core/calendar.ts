import type { TreeIndex } from './index'
import { fullName, isDeceased, isLiving } from './model'
import { isMilestone, nextBirthday, type NextBirthday } from './dates'

// Birthdays (PLAN X-3, 8.11): who has one coming up, and a calendar file with one yearly event per
// person, so birthdays land in Apple or Google Calendar.

export type BirthdayOptions = { includeDeceased?: boolean; includeAnniversaries?: boolean }

export type Upcoming = {
  id: string
  /** A person's birthday, or a couple's anniversary (id is then the family id) */
  kind: 'birthday' | 'anniversary'
  next: NextBirthday
  deceased: boolean
  milestone: boolean
  label: string
}

export function upcoming(ix: TreeIndex, withinDays = 60, opts: BirthdayOptions = {}, from?: Date): Upcoming[] {
  const out: Upcoming[] = []
  for (const id of ix.ids) {
    const p = ix.person(id)!
    const dead = isDeceased(p)
    if (dead && !opts.includeDeceased) continue
    const nb = nextBirthday(p, from)
    if (!nb || nb.days > withinDays) continue
    out.push({ id, kind: 'birthday', next: nb, deceased: dead, milestone: !dead && isMilestone(nb.turning), label: p.firstName || fullName(p) })
  }
  if (opts.includeAnniversaries) {
    for (const f of Object.values(ix.families)) {
      if (f.partnerIds.length !== 2 || !f.start?.month || !f.start.day) continue
      if (f.status === 'divorced' || f.status === 'separated') continue
      const nb = nextBirthday({ id: f.id, firstName: '', birth: { date: f.start }, createdAt: '', updatedAt: '' }, from)
      if (!nb || nb.days > withinDays) continue
      const names = f.partnerIds.map((x) => ix.person(x)?.firstName ?? '').join(' and ')
      out.push({ id: f.id, kind: 'anniversary', next: nb, deceased: false, milestone: isMilestone(nb.turning), label: names })
    }
  }
  return out.sort((a, b) => a.next.days - b.next.days)
}

/** Everyone whose birthday falls in a month, by day (for the month grid) */
export function birthdaysInMonth(ix: TreeIndex, month: number, opts: BirthdayOptions = {}): Map<number, string[]> {
  const out = new Map<number, string[]>()
  for (const id of ix.ids) {
    const p = ix.person(id)!
    if (isDeceased(p) && !opts.includeDeceased) continue
    const d = p.birth?.date
    if (d?.month !== month || !d.day) continue
    out.set(d.day, [...(out.get(d.day) ?? []), id])
  }
  return out
}

// ---- iCalendar (RFC 5545)

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 bytes continue on the next line, starting with a space */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let cur = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ''
      size = 0
    }
    cur += ch
    size += n
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const pad = (n: number) => String(n).padStart(2, '0')

export type IcsOptions = BirthdayOptions & { appName: string; slug: string; calendarName: string; now?: Date }

export function birthdaysIcs(ix: TreeIndex, o: IcsOptions): string {
  const now = o.now ?? new Date()
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${o.appName}//Birthdays//EN`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(o.calendarName)}`,
  ]
  const event = (uid: string, y: number | undefined, m: number, d: number, summary: string) => {
    // With no year, the event starts this year. Feb 29 falls on the last day of February, so it
    // shows up every year: Feb 28, or Feb 29 in leap years.
    const leapDay = m === 2 && d === 29
    const start = y && (!leapDay || (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) ? y : leapDay ? 2024 : now.getFullYear()
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@${o.slug}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${String(start).padStart(4, '0')}${pad(m)}${pad(d)}`,
      leapDay ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY',
      `SUMMARY:${esc(summary)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  for (const id of ix.ids) {
    const p = ix.person(id)!
    if (!isLiving(p) && !o.includeDeceased) continue
    const b = p.birth?.date
    if (!b?.month || !b.day) continue
    event(`${id}-birthday`, b.year, b.month, b.day, `${fullName(p)}'s birthday`)
  }
  if (o.includeAnniversaries) {
    for (const f of Object.values(ix.families)) {
      if (f.partnerIds.length !== 2 || !f.start?.month || !f.start.day) continue
      if (f.status === 'divorced' || f.status === 'separated') continue
      const names = f.partnerIds.map((x) => ix.person(x)?.firstName ?? '').join(' and ')
      event(`${f.id}-anniversary`, f.start.year, f.start.month, f.start.day, `${names}'s anniversary`)
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
