import { checkPartialDate, MONTHS_LONG } from '../dates'
import { indexOf } from '../index'
import type { ChildKind, ExportedTree, Family, Gender, PartialDate, Person, TreeDoc } from '../model'
import { emptyView, SCHEMA_VERSION } from '../model'
import { unprotect } from './csv'

// The family tree as a spreadsheet (TODO.md F3): one row per person, with their parents and
// partners given by ID. The template, the import and the export share these columns, so an export
// can always be read back in. It keeps people, parents and partners. Partnership dates and photos
// stay in the backup file.

type Col = { key: string; header: string; aliases?: string[]; example: [string, string, string] }

export const COLUMNS = [
  { key: 'id', header: 'ID', aliases: ['person id', 'no', 'number'], example: ['1', '2', '3'] },
  { key: 'first', header: 'First name', aliases: ['first', 'given name', 'given names', 'name'], example: ['Ravi', 'Meena', 'Asha'] },
  { key: 'middle', header: 'Middle name', aliases: ['middle'], example: ['', '', ''] },
  { key: 'last', header: 'Last name', aliases: ['last', 'surname', 'family name'], example: ['Shah', 'Shah', 'Shah'] },
  { key: 'maiden', header: 'Birth surname', aliases: ['maiden name', 'birth name', 'nee'], example: ['', 'Patel', ''] },
  { key: 'nickname', header: 'Nickname', aliases: ['known as'], example: ['', '', ''] },
  { key: 'called', header: 'Called', aliases: ['family title', 'title', 'what we call them', 'called by'], example: ['Pappa', '', ''] },
  { key: 'gender', header: 'Gender', aliases: ['sex'], example: ['Male', 'Female', 'Female'] },
  { key: 'species', header: 'Pet', aliases: ['species', 'animal', 'pet type'], example: ['', '', ''] },
  { key: 'born', header: 'Birth date', aliases: ['birthday', 'born', 'date of birth', 'dob'], example: ['1950-03-14', 'about 1953', '1980-07-02'] },
  { key: 'bornIn', header: 'Birth place', aliases: ['birthplace', 'place of birth', 'born in'], example: ['Ahmedabad', 'Vadodara', 'Mumbai'] },
  { key: 'deceased', header: 'Deceased', aliases: ['died', 'dead', 'passed away'], example: ['yes', '', ''] },
  { key: 'died', header: 'Death date', aliases: ['date of death', 'dod'], example: ['2019', '', ''] },
  { key: 'diedIn', header: 'Death place', aliases: ['place of death'], example: ['', '', ''] },
  { key: 'livesIn', header: 'Lives in', aliases: ['lives', 'current city', 'currently living in', 'home town', 'location'], example: ['Ahmedabad', 'Ahmedabad', 'London'] },
  { key: 'parent1', header: 'Parent 1 ID', aliases: ['father id', 'father', 'parent 1', 'parent id'], example: ['', '', '1'] },
  { key: 'parent2', header: 'Parent 2 ID', aliases: ['mother id', 'mother', 'parent 2'], example: ['', '', '2'] },
  { key: 'link', header: 'Parent link', aliases: ['relationship to parents', 'child type'], example: ['', '', 'Birth'] },
  { key: 'siblings', header: 'Sibling IDs', aliases: ['siblings', 'sibling id', 'brothers and sisters'], example: ['', '', ''] },
  { key: 'partners', header: 'Partner IDs', aliases: ['partner id', 'partner', 'spouse id', 'spouse', 'spouse ids'], example: ['2', '1', ''] },
  { key: 'former', header: 'Former partner IDs', aliases: ['former partner', 'ex partner ids', 'divorced from'], example: ['', '', ''] },
  { key: 'traits', header: 'Traits', aliases: ['tags'], example: ['', '', 'Left-handed; Curly hair'] },
  { key: 'notes', header: 'Notes', aliases: ['note', 'about'], example: ['An example: put your own family in these rows', '', ''] },
  { key: 'me', header: 'Is me', aliases: ['me', 'this is me', 'you'], example: ['', '', 'yes'] },
] as const satisfies readonly Col[]

type Key = (typeof COLUMNS)[number]['key']

/** The template: the header, and three example rows (a couple and their daughter) */
export const templateRows = (): string[][] => [COLUMNS.map((c) => c.header), ...[0, 1, 2].map((i) => COLUMNS.map((c) => c.example[i]))]

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const GENDERS: Record<string, Gender> = { m: 'male', male: 'male', man: 'male', boy: 'male', f: 'female', female: 'female', woman: 'female', girl: 'female', '': 'unknown', u: 'unknown', unknown: 'unknown', '?': 'unknown' }
const KINDS: Record<string, ChildKind> = { '': 'biological', birth: 'biological', biological: 'biological', adopted: 'adopted', adoptive: 'adopted', step: 'step', stepchild: 'step', foster: 'foster', unknown: 'unknown', notsure: 'unknown' }
const KIND_WORDS: Record<ChildKind, string> = { biological: 'Birth', adopted: 'Adopted', step: 'Step', foster: 'Foster', unknown: 'Not sure' }
const YES = /^(y|yes|true|1|x|✓|✔)$/i

// ---------------------------------------------------------------------------------------------
// Dates written by people and by spreadsheets
// ---------------------------------------------------------------------------------------------

export type SlashOrder = 'dmy' | 'mdy'

const monthOf = (w: string) => {
  const i = MONTHS_LONG.findIndex((m) => m.toLowerCase().startsWith(w.toLowerCase().replace(/\.$/, '').slice(0, 3)))
  return w.length >= 3 && i >= 0 ? i + 1 : undefined
}

/** The day and month order of a file's slash dates, or null when every one could be either */
export function slashOrder(cells: string[]): SlashOrder | null {
  for (const c of cells) {
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}\s*$/.exec(c)
    if (!m) continue
    if (+m[1] > 12) return 'dmy'
    if (+m[2] > 12) return 'mdy'
  }
  return null
}

/**
 * "1924-12-14", "1958-07", "1923", "about 1920", "14 December 1924", "December 14, 1924",
 * "Dec 1924", or a slash date like 14/12/1924 read in the file's order
 */
export function readDateText(raw: string, order: SlashOrder = 'dmy'): { date?: PartialDate; error?: string } {
  let s = raw.trim()
  if (!s) return {}
  let approx = false
  const about = /^(about|abt\.?|approx\.?|around|circa|ca\.?|c\.|~)\s*/i.exec(s)
  if (about) {
    approx = true
    s = s.slice(about[0].length)
  }
  const n = Number
  let m: RegExpExecArray | null
  const parts = (y: number, mo?: number, d?: number) => checkPartialDate({ year: y, month: mo, day: d, approx })
  if ((m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(s))) return parts(n(m[1]), m[2] ? n(m[2]) : undefined, m[3] ? n(m[3]) : undefined)
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) {
    const [a, b] = [n(m[1]), n(m[2])]
    return order === 'dmy' ? parts(n(m[3]), b, a) : parts(n(m[3]), a, b)
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z.]+),?\s+(\d{4})$/i.exec(s)) && monthOf(m[2])) return parts(n(m[3]), monthOf(m[2]), n(m[1]))
  if ((m = /^([a-z.]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s)) && monthOf(m[1])) return parts(n(m[3]), monthOf(m[1]), n(m[2]))
  if ((m = /^([a-z.]+),?\s+(\d{4})$/i.exec(s)) && monthOf(m[1])) return parts(n(m[2]), monthOf(m[1]))
  return { error: `"${raw.trim()}" isn't a date this can read. Use 1990-05-31, or just the year` }
}

/** "1924-12-14", "1958-07", "1923", "about 1920" */
export function writeDate(d: PartialDate | undefined): string {
  if (!d?.year) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  const s = d.month ? (d.day ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : `${d.year}-${pad(d.month)}`) : String(d.year)
  return d.approx ? `about ${s}` : s
}

// ---------------------------------------------------------------------------------------------
// Rows to a tree
// ---------------------------------------------------------------------------------------------

const ids = (cell: string) =>
  cell
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean)

/**
 * Turns the rows of a sheet into a tree, with a list of what couldn't be used and why, row by row.
 * The caller checks the result like any other imported file.
 */
export function rowsToTree(rows: string[][], now = new Date().toISOString()): { tree: ExportedTree; report: string[] } | { error: string } {
  const [head, ...body] = rows
  if (!head) return { error: 'This file is empty.' }
  const report: string[] = []
  const at = new Map<Key, number>()
  head.forEach((h, i) => {
    const k = squash(h)
    const col = COLUMNS.find((c) => squash(c.header) === k || c.aliases?.some((a) => squash(a) === k))
    if (!col) {
      if (h.trim()) report.push(`The column "${h.trim()}" isn't one this reads, so it was left out`)
    } else if (at.has(col.key)) report.push(`There are two "${col.header}" columns. The first one was used`)
    else at.set(col.key, i)
  })
  if (!at.has('first') && !at.has('last')) {
    return { error: 'This spreadsheet has no "First name" column. Start from the template, so the columns have the names this looks for.' }
  }
  const get = (r: string[], k: Key) => unprotect((at.has(k) ? r[at.get(k)!] : '') ?? '').trim()
  const dateCells = body.flatMap((r) => [get(r, 'born'), get(r, 'died')])
  const found = slashOrder(dateCells)
  const order = found ?? 'dmy'
  if (!found && dateCells.some((c) => /^\s*\d{1,2}[/.]\d{1,2}[/.]\d{4}\s*$/.test(c))) {
    report.push('Dates like 05/06/1990 could be read either way, so they were read day first (5 June 1990). Check them in the tree')
  }

  // People, keyed by the sheet's own IDs
  const people: Record<string, Person> = {}
  const rowOf = new Map<string, number>()
  const byRow: { id: string; r: string[]; n: number }[] = []
  let home: string | null = null
  body.forEach((r, i) => {
    const n = i + 2 // as the spreadsheet numbers it, after the header
    const sheetId = get(r, 'id') || `row ${n}`
    if (rowOf.has(sheetId)) {
      report.push(`Row ${n}: the ID ${sheetId} is already used on row ${rowOf.get(sheetId)}, so this row was left out`)
      return
    }
    rowOf.set(sheetId, n)
    const id = `p${byRow.length + 1}`
    byRow.push({ id, r, n })
    const g = get(r, 'gender')
    const gender = GENDERS[g.toLowerCase()] ?? 'other'
    const p: Person = { id, firstName: get(r, 'first'), gender, createdAt: now, updatedAt: now }
    if (!p.firstName) report.push(`Row ${n} has no first name`)
    if (gender === 'other' && !/^other$/i.test(g)) p.genderOther = g
    for (const [k, field] of [['middle', 'middleName'], ['last', 'lastName'], ['maiden', 'birthSurname'], ['nickname', 'nickname'], ['species', 'species'], ['called', 'calledBy'], ['livesIn', 'livesIn'], ['notes', 'notes']] as const) {
      const v = get(r, k)
      if (v) p[field] = v
    }
    for (const [k, place, field, label] of [['born', 'bornIn', 'birth', 'birth date'], ['died', 'diedIn', 'death', 'death date']] as const) {
      const { date, error } = readDateText(get(r, k), order)
      if (error) report.push(`Row ${n}, ${label}: ${error}`)
      const where = get(r, place)
      if (date || where) p[field] = { ...(date ? { date } : {}), ...(where ? { place: where } : {}) }
    }
    if (p.death || YES.test(get(r, 'deceased'))) p.deceased = true
    const traits = get(r, 'traits').split(/[;,]/).map((t) => t.trim()).filter(Boolean)
    if (traits.length) p.tags = traits
    if (YES.test(get(r, 'me'))) {
      if (home) report.push(`Row ${n} is marked as you too. Only the first one counts`)
      else home = id
    }
    people[id] = p
  })
  if (!byRow.length) return { error: 'This spreadsheet has no people in it.' }
  const idOf = new Map(byRow.map(({ id, r, n }) => [get(r, 'id') || `row ${n}`, id]))

  // Families: a couple (or one parent) and their children, then partners with no children listed
  const families: Record<string, Family> = {}
  const famOf = new Map<string, Family>()
  const coupleKey = (ps: string[]) => [...ps].sort().join('+')
  const familyFor = (ps: string[]) => {
    const k = coupleKey(ps)
    let f = famOf.get(k)
    if (!f) {
      f = { id: `f${famOf.size + 1}`, partnerIds: ps, children: [] }
      if (ps.length === 2) f.status = 'married'
      famOf.set(k, f)
      families[f.id] = f
    }
    return f
  }
  const lookup = (n: number, sheetId: string, what: string) => {
    const id = idOf.get(sheetId)
    if (!id) report.push(`Row ${n}: ${what} ${sheetId} isn't in the sheet, so it was left out`)
    return id
  }
  for (const { id, r, n } of byRow) {
    const ps = [get(r, 'parent1'), get(r, 'parent2')]
      .filter(Boolean)
      .map((x) => lookup(n, x, 'the parent ID'))
      .filter((x): x is string => !!x)
    const parents = [...new Set(ps)].filter((x) => {
      if (x !== id) return true
      report.push(`Row ${n} names this person as their own parent, so that was left out`)
      return false
    })
    if (parents.length) {
      const word = get(r, 'link').toLowerCase().replace(/[^a-z]/g, '')
      const kind = KINDS[word]
      if (!kind) report.push(`Row ${n}: "${get(r, 'link')}" isn't a parent link this knows, so it says Birth. Use Birth, Adopted, Step or Foster`)
      familyFor(parents).children.push({ personId: id, kind: kind ?? 'biological' })
    }
    for (const [k, status] of [['partners', 'married'], ['former', 'divorced']] as const) {
      for (const other of ids(get(r, k))) {
        const o = lookup(n, other, 'the partner ID')
        if (!o || o === id) continue
        const f = familyFor([id, o])
        if (status === 'divorced') f.status = 'divorced'
      }
    }
  }

  // A child listed as their own ancestor would loop forever: those links are dropped
  const childrenOf = new Map<string, string[]>()
  for (const f of Object.values(families)) for (const p of f.partnerIds) childrenOf.set(p, [...(childrenOf.get(p) ?? []), ...f.children.map((c) => c.personId)])
  const below = (from: string, target: string, seen = new Set<string>()): boolean =>
    (childrenOf.get(from) ?? []).some((c) => c === target || (!seen.has(c) && seen.add(c) && below(c, target, seen)))
  for (const f of Object.values(families)) {
    f.children = f.children.filter((c) => {
      const loop = f.partnerIds.some((p) => below(c.personId, p))
      if (loop) {
        const row = byRow.find((x) => x.id === c.personId)!.n
        report.push(`Row ${row}: a parent here is also this person's child or grandchild, so the parents were left out`)
        childrenOf.forEach((list, p) => childrenOf.set(p, list.filter((x) => !(x === c.personId && f.partnerIds.includes(p)))))
      }
      return !loop
    })
  }

  // Brothers and sisters whose parents aren't in the sheet share a family with no parents recorded.
  // Anyone with parents gets their brothers and sisters through them.
  const withParents = new Set(Object.values(families).filter((f) => f.partnerIds.length).flatMap((f) => f.children.map((c) => c.personId)))
  const link = new Map<string, string>()
  const root = (x: string): string => {
    const up = link.get(x)
    return up && up !== x ? root(up) : x
  }
  for (const { id, r, n } of byRow) {
    for (const sib of ids(get(r, 'siblings'))) {
      const o = lookup(n, sib, 'the sibling ID')
      if (!o || o === id) continue
      if (withParents.has(id) || withParents.has(o)) {
        report.push(`Row ${n}: Sibling IDs are for people whose parents aren't in the sheet, so ${sib} was left out`)
        continue
      }
      const [a, b] = [root(id), root(o)]
      link.set(a, a)
      link.set(b, b)
      if (a !== b) link.set(b, a)
    }
  }
  const groups = new Map<string, string[]>()
  for (const { id } of byRow) if (link.has(id)) groups.set(root(id), [...(groups.get(root(id)) ?? []), id])
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const f: Family = { id: `f${Object.keys(families).length + 1}`, partnerIds: [], children: members.map((m) => ({ personId: m, kind: 'biological' })) }
    families[f.id] = f
  }

  const tree: ExportedTree = {
    schemaVersion: SCHEMA_VERSION,
    id: 'sheet',
    title: '',
    titleAuto: true,
    showStats: true,
    homePersonId: home,
    people,
    families,
    view: emptyView(),
    meta: { createdAt: now, updatedAt: now, app: 'jangal' },
  }
  return { tree, report }
}

// ---------------------------------------------------------------------------------------------
// A tree to rows
// ---------------------------------------------------------------------------------------------

/** The tree as spreadsheet rows, people in tree order and numbered from 1 */
export function treeToRows(doc: Pick<TreeDoc, 'people' | 'families' | 'homePersonId'>): string[][] {
  const ix = indexOf(doc)
  const num = new Map(ix.ids.map((id, i) => [id, String(i + 1)]))
  const rows = ix.ids.map((id) => {
    const p = ix.person(id)!
    const bf = ix.birthFamilyOf(id)
    const parents = bf ? ix.family(bf)!.partnerIds : []
    const partners: string[] = []
    const former: string[] = []
    for (const f of ix.familiesOf(id)) {
      const fam = ix.family(f)!
      for (const o of fam.partnerIds) if (o !== id) (fam.status === 'divorced' || fam.status === 'separated' ? former : partners).push(num.get(o)!)
    }
    const gender = p.gender === 'other' ? p.genderOther || 'Other' : p.gender === 'male' ? 'Male' : p.gender === 'female' ? 'Female' : ''
    const cells: Record<Key, string> = {
      id: num.get(id)!,
      first: p.firstName,
      middle: p.middleName ?? '',
      last: p.lastName ?? '',
      maiden: p.birthSurname ?? '',
      nickname: p.nickname ?? '',
      species: p.species ?? '',
      called: p.calledBy ?? '',
      gender,
      born: writeDate(p.birth?.date),
      bornIn: p.birth?.place ?? '',
      deceased: p.deceased || p.death ? 'yes' : '',
      died: writeDate(p.death?.date),
      diedIn: p.death?.place ?? '',
      livesIn: p.livesIn ?? '',
      parent1: parents[0] ? num.get(parents[0])! : '',
      parent2: parents[1] ? num.get(parents[1])! : '',
      link: parents.length && bf ? KIND_WORDS[ix.childKind(bf, id)] : '',
      siblings: bf && !parents.length ? ix.family(bf)!.children.filter((c) => c.personId !== id).map((c) => num.get(c.personId)!).join('; ') : '',
      partners: partners.join('; '),
      former: former.join('; '),
      traits: (p.tags ?? []).join('; '),
      notes: p.notes ?? '',
      me: doc.homePersonId === id ? 'yes' : '',
    }
    return COLUMNS.map((c) => cells[c.key])
  })
  return [COLUMNS.map((c) => c.header), ...rows]
}
