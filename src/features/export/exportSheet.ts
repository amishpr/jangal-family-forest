import { stamp } from '../../core/dates'
import { toCsv } from '../../core/sheet/csv'
import { COLUMNS, templateRows, treeToRows } from '../../core/sheet/rows'
import { writeXlsx } from '../../core/sheet/xlsx'
import { currentTreeDoc } from '../../store/treeStore'
import { download } from './download'
import { fileBase } from './exportJson'

// The spreadsheet (TODO.md F3): the open tree as one row per person, or the empty template with a
// worked example. An Excel file has dropdowns, text-only date columns, and a tab of instructions;
// CSV opens anywhere.

export type SheetFormat = 'xlsx' | 'csv'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const col = (key: (typeof COLUMNS)[number]['key']) => COLUMNS.findIndex((c) => c.key === key)

const HOW = [
  ['How to fill in the People sheet'],
  ['One row per person. Give everyone an ID: any number or short word, as long as each one is different.'],
  ['Parent 1 ID and Parent 2 ID are the IDs of their two parents. Leave them empty when you don\'t know.'],
  ['Parent link says how they\'re related to those parents: Birth, Adopted, Step, Foster or Not sure. Empty means Birth.'],
  ['Sibling IDs are for brothers and sisters whose parents aren\'t in the sheet. Separate several IDs with ;'],
  ['Partner IDs are their husband, wife or partner. Former partner IDs are for divorced or separated partners. Separate several IDs with ;'],
  ['Dates can be 1990-05-31, 1990-05 or just 1990. Write about 1920 when you\'re not sure.'],
  ['Gender is Male, Female or Other, or empty. Traits are separated with ;, like Left-handed; Curly hair.'],
  ['Write yes in Is me on your own row. Write yes in Deceased for someone who has died, even without a date.'],
  ['Called is what the family calls them, like Moti Ba. Lives in is where they live now.'],
  ['For a pet, write what it is in Pet, like Dog or Cat, and its owners in Parent 1 ID and Parent 2 ID.'],
  ['The three example rows (Ravi, Meena and Asha) show the idea. Replace them with your family.'],
  ['Then open Jangal, choose Import a file, and pick this file. You\'ll see what\'s in it before anything changes.'],
]

function workbook(rows: string[][]): Uint8Array {
  return writeXlsx([
    {
      name: 'People',
      rows,
      header: true,
      widths: COLUMNS.map((c) => (c.key === 'notes' ? 40 : c.key === 'id' || c.key === 'me' ? 8 : Math.max(12, c.header.length + 2))),
      textColumns: [col('id'), col('born'), col('died'), col('parent1'), col('parent2'), col('siblings'), col('partners'), col('former')],
      lists: [
        { col: col('gender'), values: ['Male', 'Female', 'Other'] },
        { col: col('link'), values: ['Birth', 'Adopted', 'Step', 'Foster', 'Not sure'] },
        { col: col('deceased'), values: ['yes'] },
        { col: col('me'), values: ['yes'] },
      ],
    },
    { name: 'How to fill this in', rows: HOW, widths: [110] },
  ])
}

function save(name: string, rows: string[][], format: SheetFormat) {
  if (format === 'csv') download(`${name}.csv`, toCsv(rows), 'text/csv')
  else download(`${name}.xlsx`, new Blob([workbook(rows) as BlobPart], { type: XLSX_TYPE }), XLSX_TYPE)
}

export function exportSheet(format: SheetFormat = 'xlsx') {
  const doc = currentTreeDoc()
  if (!doc) return
  save(`${fileBase(doc)}-${stamp()}`, treeToRows(doc), format)
}

export function downloadTemplate(format: SheetFormat = 'xlsx') {
  save('jangal-family-template', templateRows(), format)
}
