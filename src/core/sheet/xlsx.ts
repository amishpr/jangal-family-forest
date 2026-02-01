import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

// Excel files (TODO.md F3b): just enough of the .xlsx format to write a sheet with a frozen header,
// column widths, dropdowns and text-only date columns, and to read the first sheet of any workbook
// back as rows of text. An .xlsx file is a zip of XML parts, so this is fflate (already used by the
// PDF export) and a few templates. No spreadsheet library, which would be far bigger.

export type SheetSpec = {
  name: string
  rows: string[][]
  /** Column widths in characters */
  widths?: number[]
  /** Columns (0-based) kept as text, so Excel doesn't turn "1990-05" into a date of its own */
  textColumns?: number[]
  /** Dropdowns: a column (0-based) and the choices */
  lists?: { col: number; values: string[] }[]
  /** Bold, frozen first row */
  header?: boolean
}

// XML can't hold control characters other than tab and line breaks, so they're left out
const xmlSafe = (c: string) => c >= ' ' || c === '\t' || c === '\n' || c === '\r'
const esc = (s: string) =>
  [...s].filter(xmlSafe).join('').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "A", "B", … "Z", "AA" */
const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + colName(i % 26))

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
// Styles: 0 plain, 1 bold (the header), 2 text (number format @), 3 bold text
const STYLES = `${XML}<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

function sheetXml(s: SheetSpec): string {
  const text = new Set(s.textColumns ?? [])
  const width = s.rows.reduce((n, r) => Math.max(n, r.length), 0)
  const cols = (s.widths ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${text.has(i) ? ' style="2"' : ''}/>`).join('')
  const rows = s.rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const style = (ri === 0 && s.header ? 1 : 0) + (text.has(ci) ? 2 : 0)
          return v === '' && !style ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`
        })
        .join('')
      return `<row r="${ri + 1}">${cells}</row>`
    })
    .join('')
  const freeze = s.header ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : ''
  const lists = (s.lists ?? [])
    .map(({ col, values }) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(col)}2:${colName(col)}2000"><formula1>"${esc(values.join(','))}"</formula1></dataValidation>`)
    .join('')
  return `${XML}<worksheet ${NS}><dimension ref="A1:${colName(Math.max(0, width - 1))}${Math.max(1, s.rows.length)}"/>${freeze}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData>${lists ? `<dataValidations count="${s.lists!.length}">${lists}</dataValidations>` : ''}</worksheet>`
}

/** A workbook with these sheets, as the bytes of an .xlsx file */
export function writeXlsx(sheets: SheetSpec[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML}<workbook ${NS}><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(STYLES),
  }
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))))
  return zipSync(files, { level: 6 })
}

// ---------------------------------------------------------------------------------------------
// Reading any workbook's first sheet
// ---------------------------------------------------------------------------------------------

const unesc = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** The text of a shared string or inline string, rich text runs joined, phonetic hints left out */
const textOf = (xml: string) =>
  unesc([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]

/** "B12" is column 1 */
const colIndex = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1

// Built-in number formats that show a date, and custom ones whose code has a day, month or year
const DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57])
const isDateCode = (code: string) => /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ''))

/**
 * Excel's day number as 1990-05-31. Counting from 30 December 1899 is right from March 1900 on
 * (Excel pretends 1900 had a 29 February). A time of day is dropped.
 */
export function serialToIso(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** The first sheet of an .xlsx file as rows of text, the way it shows in Excel */
export function readXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) })
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : '')
  // The first sheet in the workbook's order, found through its relationship
  const firstId = attr(/<sheet\b[^>]*>/.exec(read('xl/workbook.xml'))?.[0] ?? '', 'r:id')
  const rel = [...read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === firstId)
  const target = rel ? attr(rel, 'Target')!.replace(/^\/?(xl\/)?/, '') : 'worksheets/sheet1.xml'
  const sheet = read(`xl/${target}`)
  if (!sheet) throw new Error("This workbook's first sheet couldn't be found")
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
  const styles = read('xl/styles.xml')
  const custom = new Map([...styles.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode') ?? '']))
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? ''
  const dateStyle = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], 'numFmtId') ?? 0)
    return DATE_FORMATS.has(id) || (custom.has(id) && isDateCode(unesc(custom.get(id)!)))
  })

  const rows: string[][] = []
  for (const [, rowXml] of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const m of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, attrs, inner = ''] = m
      const i = colIndex(attr(attrs, 'r') ?? colName(row.length))
      const type = attr(attrs, 't')
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = textOf(inner)
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE'
      else if (v !== undefined) {
        const n = Number(v)
        value = !Number.isNaN(n) && dateStyle[Number(attr(attrs, 's') ?? 0)] && n >= 1 ? serialToIso(n) : unesc(v)
      }
      while (row.length < i) row.push('')
      row[i] = value
    }
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
}
