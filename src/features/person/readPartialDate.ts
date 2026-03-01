import { checkPartialDate } from '../../core/dates'
import type { PartialDate } from '../../core/model'

/** Reads a PartialDateField back. Returns the date, or an error to show under it. */
export function readPartialDate(f: FormData, name: string): { date?: PartialDate; error?: string } {
  const num = (k: string) => {
    const raw = String(f.get(`${name}.${k}`) ?? '').trim()
    if (!raw) return undefined
    return /^\d+$/.test(raw) ? Number(raw) : NaN
  }
  return checkPartialDate({ year: num('year'), month: num('month'), day: num('day'), approx: f.get(`${name}.approx`) === 'on' })
}
