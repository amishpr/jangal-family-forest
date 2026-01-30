import type { PartialDate } from '../model'

// GEDCOM dates (PLAN 8.12): "12 MAR 1955", "MAR 1955", "1955", "ABT 1920", "BEF 1900", "AFT 1880",
// "BET 1900 AND 1910" and "FROM 1900 TO 1910" all become a PartialDate. Anything that isn't exact
// is marked "about". Returns undefined for text it can't read, like "(when she was young)".

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}
const FULL = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']

/** JAN, or a full month name some programs write instead, like JANUARY */
const month = (s: string) => MONTHS[s] ?? (s.length > 3 && FULL.includes(s) ? MONTHS[s.slice(0, 3)] : undefined)

function exact(s: string): PartialDate | undefined {
  // Calendar escapes like @#DGREGORIAN@ are dropped; "B.C." dates aren't supported
  const t = s.replace(/@#D[A-Z ]+@/g, '').trim().toUpperCase()
  if (/B\.?C\.?/.test(t)) return undefined
  // Dual years like 1750/51 keep the first
  let m = /^(\d{1,2})\s+([A-Z]{3,9})\s+(\d{3,4})(?:\/\d+)?$/.exec(t)
  if (m && month(m[2])) {
    const day = Number(m[1])
    return day >= 1 && day <= 31 ? { year: Number(m[3]), month: month(m[2]), day } : { year: Number(m[3]), month: month(m[2]) }
  }
  m = /^([A-Z]{3,9})\s+(\d{3,4})(?:\/\d+)?$/.exec(t)
  if (m && month(m[1])) return { year: Number(m[2]), month: month(m[1]) }
  m = /^(\d{3,4})(?:\/\d+)?$/.exec(t)
  if (m) return { year: Number(m[1]) }
  return undefined
}

export function parseGedcomDate(raw: string | undefined): PartialDate | undefined {
  if (!raw) return undefined
  const s = raw.trim().toUpperCase()
  if (!s || s.startsWith('(')) return undefined
  let m = /^(ABT|EST|CAL|BEF|AFT|INT)\s+(.+)$/.exec(s)
  if (m) {
    // INT is an interpreted date followed by the original text in brackets
    const d = exact(m[2].replace(/\(.*\)$/, ''))
    if (!d) return undefined
    return m[1] === 'INT' ? d : { ...d, approx: true }
  }
  m = /^(?:BET|FROM)\s+(.+?)\s+(?:AND|TO)\s+(.+)$/.exec(s)
  if (m) {
    const d = exact(m[1])
    return d ? { ...d, approx: true } : undefined
  }
  m = /^(?:FROM|TO)\s+(.+)$/.exec(s)
  if (m) {
    const d = exact(m[1])
    return d ? { ...d, approx: true } : undefined
  }
  return exact(s)
}
