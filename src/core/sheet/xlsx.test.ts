import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { templateRows } from './rows'
import { readXlsx, serialToIso, writeXlsx } from './xlsx'

// Excel files (TODO.md F3b)

/** A workbook the way Excel writes one: shared strings, styles, a date cell and a number */
function excelStyle(): Uint8Array {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zipSync({
    'xl/workbook.xml': strToU8(`${xml}<workbook><sheets><sheet name="People" sheetId="1" r:id="rId3"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`${xml}<Relationships><Relationship Id="rId3" Type="x" Target="worksheets/sheet7.xml"/></Relationships>`),
    'xl/sharedStrings.xml': strToU8(`${xml}<sst><si><t>First name</t></si><si><t>Birth date</t></si><si><r><t>Ti</t></r><r><rPr><b/></rPr><t>m &amp; Co</t></r></si></sst>`),
    'xl/styles.xml': strToU8(`${xml}<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>`),
    'xl/worksheets/sheet7.xml': strToU8(
      `${xml}<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>32963</v></c><c r="D2"><v>1990</v></c><c r="E2" t="b"><v>1</v></c></row>` +
        `<row r="3"><c r="A3" t="inlineStr"><is><t>Asha</t></is></c><c r="B3" s="2"><v>45000.75</v></c></row><row r="4"><c r="A4"/></row></sheetData></worksheet>`,
    ),
  })
}

describe('Excel files', () => {
  it('reads back what it writes, header, text and all', () => {
    const rows = [...templateRows(), ['4', 'Tom & "Jerry" <x>', '', '', '', '', '', '', 'Ahmedabad, India', '', '', '', '', '', '', '', '', '', 'Line one\nline two']]
    const bytes = writeXlsx([
      { name: 'People', rows, header: true, widths: [6, 14], textColumns: [7, 10], lists: [{ col: 6, values: ['Male', 'Female', 'Other'] }] },
      { name: 'How to fill this in', rows: [['One row per person']] },
    ])
    expect(bytes[0]).toBe(0x50) // "PK", a zip
    const back = readXlsx(bytes)
    const trim = (r: string[]) => {
      const out = [...r]
      while (out.length && out[out.length - 1] === '') out.pop()
      return out
    }
    expect(back.map(trim)).toEqual(rows.map(trim))
  })

  it("reads Excel's own files: shared strings, rich text, booleans, and dates only where the cell is a date", () => {
    expect(readXlsx(excelStyle())).toEqual([
      ['First name', 'Birth date'],
      ['Tim & Co', '1990-03-31', '', '1990', 'TRUE'],
      ['Asha', '2023-03-15'],
    ])
  })

  it('turns Excel day numbers into dates', () => {
    expect(serialToIso(61)).toBe('1900-03-01')
    expect(serialToIso(32963)).toBe('1990-03-31')
  })
})
