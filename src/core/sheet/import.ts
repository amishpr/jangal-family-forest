import { checkTree, type ImportFailure, type ImportPreview } from '../importTree'
import { decodeText, parseCsv } from './csv'
import { rowsToTree } from './rows'
import { readXlsx } from './xlsx'

// Reading a spreadsheet someone picked (TODO.md F3): CSV, or the first sheet of an Excel file.
// Loaded only when one is imported. The tree it makes goes through the same checks as a backup
// file, and the report says what was left out.

/** An .xlsx file is a zip, which starts "PK" */
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b

export function readSheetFile(buf: ArrayBuffer): { ok: true; preview: ImportPreview; report: string[] } | ImportFailure {
  const bytes = new Uint8Array(buf)
  let rows: string[][]
  try {
    rows = isZip(bytes) ? readXlsx(bytes) : parseCsv(decodeText(buf))
  } catch {
    return { ok: false, error: "This spreadsheet couldn't be read. Save it again from Excel as .xlsx or CSV UTF-8, and try once more." }
  }
  const res = rowsToTree(rows)
  if ('error' in res) return { ok: false, error: res.error }
  const preview = checkTree(res.tree, 'sheet')
  if (!preview.ok) return preview
  return { ok: true, preview, report: res.report }
}
