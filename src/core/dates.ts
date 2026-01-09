import type { PartialDate, Person } from './model'
import { isDeceased } from './model'

// Partial dates (PLAN P-2): a full date, a month and year, a year only, or "about 1920". The native
// Date can't hold those, so this module does the formatting, ages and birthdays itself.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Midnight today, local time */
export function today(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export const isLeapYear = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)

/** "Mar 2, 1911", "March 1955", "about 1920" */
export function formatDate(d: PartialDate | undefined, long = false): string {
  if (!d?.year) return ''
  const names = long ? MONTHS_LONG : MONTHS
  const pre = d.approx ? 'about ' : ''
  if (d.month && d.day) return `${pre}${names[d.month - 1]} ${d.day}, ${d.year}`
  if (d.month) return `${pre}${names[d.month - 1]} ${d.year}`
  return `${pre}${d.year}`
}

const birthYear = (p: Person) => p.birth?.date?.year
const deathYear = (p: Person) => p.death?.date?.year

/** "b. 1970", "1911 - 1979", "1911 - ?" */
export function yearsLabel(p: Person): string {
  const b = birthYear(p)
  const d = deathYear(p)
  if (d) return `${b ?? '?'} - ${d}`
  if (isDeceased(p)) return b ? `${b} - ?` : ''
  return b ? `b. ${b}` : ''
}

/** Age today, or at death. Null when it can't be known. */
export function age(p: Person, at = today()): number | null {
  const b = p.birth?.date
  if (!b?.year) return null
  let ref = at
  if (isDeceased(p)) {
    const d = p.death?.date
    if (!d?.year) return null
    ref = new Date(d.year, (d.month ?? 7) - 1, d.day ?? 1)
  }
  let years = ref.getFullYear() - b.year
  if (b.month) {
    const m = ref.getMonth() + 1
    if (m < b.month || (m === b.month && ref.getDate() < (b.day ?? 1))) years--
  }
  return years
}

export type NextBirthday = { date: Date; days: number; turning: number | null }

/** The next birthday on or after `from`. Feb 29 birthdays fall on Feb 28 in other years. */
export function nextBirthday(p: Person, from = today()): NextBirthday | null {
  const b = p.birth?.date
  if (!b?.month || !b.day) return null
  const on = (y: number) =>
    new Date(y, b.month! - 1, b.month === 2 && b.day === 29 && !isLeapYear(y) ? 28 : b.day!)
  let year = from.getFullYear()
  let date = on(year)
  if (date < from) date = on(++year)
  const days = Math.round((date.getTime() - from.getTime()) / 86_400_000)
  return { date, days, turning: b.year ? year - b.year : null }
}

/** Round birthdays worth a callout: 18, 21, every tenth, and every 25th */
export const isMilestone = (n: number | null) =>
  n != null && n >= 18 && (n % 10 === 0 || n === 18 || n === 21 || n % 25 === 0)

export const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/** For <input type="date">: only full dates have an ISO form */
export function toIsoDate(d: PartialDate | undefined): string {
  if (!d?.year || !d.month || !d.day) return ''
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

export function fromIsoDate(s: string): PartialDate | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return undefined
  return { year: +m[1], month: +m[2], day: +m[3] }
}

/** "2026-09-30", for file names */
export function stamp(d = today()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Years as a decimal, for timelines: 1970.5 is the middle of 1970 */
export function decimalYear(d: PartialDate | undefined): number | null {
  if (!d?.year) return null
  return d.year + ((d.month ?? 7) - 1) / 12 + ((d.day ?? 1) - 1) / 365
}

/**
 * Checks a date put together from parts (TODO.md F1, F3): the edit card, quick add and spreadsheet
 * import all use it, so the same date gets the same answer everywhere. NaN means the part wasn't
 * a number.
 */
export function checkPartialDate(p: { year?: number; month?: number; day?: number; approx?: boolean }): { date?: PartialDate; error?: string } {
  const { year, month, day, approx } = p
  if (year === undefined && month === undefined && day === undefined) return {}
  if (Number.isNaN(year) || Number.isNaN(day) || Number.isNaN(month)) return { error: 'Use numbers for the day and year' }
  if (year === undefined) return { error: 'Add the year, even a rough one' }
  if (year < 1 || year > new Date().getFullYear() + 1) return { error: 'That year looks off' }
  if (month !== undefined && (month < 1 || month > 12)) return { error: 'Use a month from 1 to 12' }
  if (day !== undefined && month === undefined) return { error: 'Add the month too' }
  if (day !== undefined && month !== undefined) {
    const max = new Date(year, month, 0).getDate()
    if (day < 1 || day > max) return { error: `${MONTHS_LONG[month - 1]} ${year} has ${max} days` }
  }
  const date: PartialDate = { year }
  if (month) date.month = month
  if (day) date.day = day
  if (approx) date.approx = true
  return { date }
}
