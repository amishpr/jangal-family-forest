// CSV, the plain spreadsheet format (TODO.md F3, F4): RFC 4180, which is what Excel, Google Sheets
// and Numbers read and write. Quoted cells can hold commas, quotes and line breaks. Excel in some
// countries uses semicolons instead of commas, so the separator is whichever the first line uses.

/** The cells of each row. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, '')
  const firstLine = s.slice(0, s.search(/\r?\n|$/))
  const sep = [',', ';', '\t'].map((c) => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && !cell) quoted = true
    else if (c === sep) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  row.push(cell)
  rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

// A cell starting with one of these is a formula to a spreadsheet. Exports put an apostrophe in
// front so a name like "=HYPERLINK(...)" stays text (CSV injection), and imports take it off again.
const FORMULA = /^[=+\-@\t\r]/

/** One CSV file, with Windows line endings and a byte order mark, so Excel reads it as UTF-8 */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const safe = FORMULA.test(v) ? `'${v}` : v
    return /[",;\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** A cell as it was before toCsv protected it */
export const unprotect = (v: string) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v)

/** Bytes from a file as text: UTF-8, or the older Windows encoding Excel used to save CSV in */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}
