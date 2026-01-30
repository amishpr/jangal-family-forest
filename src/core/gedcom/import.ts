import type { ImportFailure, ImportPreview } from '../importTree'
import type { ChildKind, ExportedTree, Family, FamilyStatus, Gender, LifeEvent, Person } from '../model'
import { SCHEMA_VERSION, emptyView } from '../model'
import { parseGedcomDate } from './dates'
import { child, childrenOf, decodeGedcom, parseGedcom, ref, type GedNode } from './parse'

// Mapping GEDCOM records to people and families (PLAN 8.12), with a report of everything that was
// skipped: sources, media files, and events other than birth and death.

const LIFE_EVENTS = new Set(['BIRT', 'DEAT', 'NAME', 'SEX', 'FAMS', 'FAMC', 'NOTE', 'NICK', 'CHAN', 'RIN', '_UID', 'UID', 'REFN'])

const tidy = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** "Raj /Kapoor/" has the surname between slashes */
function splitName(value: string, node: GedNode) {
  const givn = tidy(child(node, 'GIVN')?.value)
  const surn = tidy(child(node, 'SURN')?.value)
  const nick = tidy(child(node, 'NICK')?.value)
  const m = /^(.*?)\/(.*?)\/(.*)$/.exec(value)
  const given = givn || tidy(m ? `${m[1]} ${m[3]}` : value)
  const surname = surn || tidy(m?.[2])
  return { given, surname, nick }
}

function event(node: GedNode | undefined): LifeEvent | undefined {
  if (!node) return undefined
  const date = parseGedcomDate(child(node, 'DATE')?.value)
  const place = tidy(child(node, 'PLAC')?.value)
  if (!date && !place) return undefined
  return { ...(date ? { date } : {}), ...(place ? { place } : {}) }
}

function pedigree(value: string | undefined): ChildKind | undefined {
  const v = tidy(value).toLowerCase()
  if (!v) return undefined
  if (v.startsWith('adopt')) return 'adopted'
  if (v.startsWith('foster')) return 'foster'
  if (v.startsWith('step')) return 'step'
  if (v.startsWith('birth') || v.startsWith('natural') || v.startsWith('bio')) return 'biological'
  return 'unknown'
}

export function readGedcomFile(buf: ArrayBuffer): { ok: true; preview: ImportPreview; report: string[] } | ImportFailure {
  const { text, encoding } = decodeGedcom(buf)
  const { records, badLines } = parseGedcom(text)
  if (!records.length || records[0].tag !== 'HEAD') {
    return { ok: false, error: "This doesn't look like a GEDCOM file. It should start with a line that says 0 HEAD." }
  }
  const byXref = new Map<string, GedNode>()
  for (const r of records) if (r.xref) byXref.set(r.xref, r)
  // A note is written inline, or points to a NOTE record
  const noteText = (n: GedNode) => {
    const r = ref(n.value)
    return (r ? (byXref.get(r)?.value ?? '') : n.value).trim()
  }

  const now = new Date().toISOString()
  const people: Record<string, Person> = {}
  const idOf = (xref: string) => `g_${xref.replace(/[^A-Za-z0-9_-]/g, '')}`
  const skipped = new Map<string, number>()
  const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1)
  const media: string[] = []
  const unnamed: string[] = []
  const famcKind = new Map<string, ChildKind>() // "<famXref>|<indiXref>"

  for (const r of records.filter((x) => x.tag === 'INDI' && x.xref)) {
    const names = childrenOf(r, 'NAME')
    const primary = names.find((n) => !/married/i.test(child(n, 'TYPE')?.value ?? '')) ?? names[0]
    const married = names.find((n) => /married/i.test(child(n, 'TYPE')?.value ?? '')) ?? childrenOf(r, '_MARNM')[0]
    const nm = primary ? splitName(primary.value, primary) : { given: '', surname: '', nick: '' }
    const p: Person = { id: idOf(r.xref!), firstName: nm.given, createdAt: now, updatedAt: now }
    const marriedSurname = married ? (married.tag === '_MARNM' ? tidy(married.value.replace(/\//g, '')) : splitName(married.value, married).surname) : ''
    if (marriedSurname && marriedSurname !== nm.surname) {
      p.lastName = marriedSurname
      if (nm.surname) p.birthSurname = nm.surname
    } else if (nm.surname) p.lastName = nm.surname
    const nick = nm.nick || tidy(child(r, 'NICK')?.value)
    if (nick) p.nickname = nick
    const sex = tidy(child(r, 'SEX')?.value).toUpperCase()
    p.gender = (sex === 'M' ? 'male' : sex === 'F' ? 'female' : sex === 'X' ? 'other' : 'unknown') as Gender
    const birth = event(child(r, 'BIRT'))
    if (birth) p.birth = birth
    const deat = child(r, 'DEAT')
    if (deat) {
      p.deceased = true
      const d = event(deat)
      if (d) p.death = d
    }
    const notes = childrenOf(r, 'NOTE').map(noteText).filter(Boolean)
    if (notes.length) p.notes = notes.join('\n\n')
    for (const famc of childrenOf(r, 'FAMC')) {
      const fx = ref(famc.value)
      const kind = pedigree(child(famc, 'PEDI')?.value)
      if (fx && kind) famcKind.set(`${fx}|${r.xref}`, kind)
    }
    for (const c of r.children) {
      if (c.tag === 'OBJE') {
        const file = child(c, 'FILE')?.value ?? (ref(c.value) ? child(byXref.get(ref(c.value)!) ?? c, 'FILE')?.value : '')
        if (file) media.push(`${nm.given || 'Someone'} ${nm.surname}: ${file}`.trim())
        continue
      }
      if (c.tag === 'SOUR') skip('source citations')
      else if (!LIFE_EVENTS.has(c.tag) && !c.tag.startsWith('_')) skip(EVENT_NAMES[c.tag] ?? c.tag.toLowerCase())
    }
    if (!p.firstName) {
      unnamed.push(r.xref!)
      p.firstName = ''
    }
    people[p.id] = p
  }

  const families: Record<string, Family> = {}
  for (const r of records.filter((x) => x.tag === 'FAM' && x.xref)) {
    const partnerIds = ['HUSB', 'WIFE']
      .flatMap((t) => childrenOf(r, t))
      .map((n) => ref(n.value))
      .filter((x): x is string => !!x && people[idOf(x)] !== undefined)
      .map(idOf)
    const children = childrenOf(r, 'CHIL')
      .map((n) => {
        const x = ref(n.value)
        if (!x || !people[idOf(x)]) return null
        // Ancestry writes _FREL and _MREL on the child line; others write PEDI on the person
        const rel = pedigree(child(n, '_FREL')?.value) ?? pedigree(child(n, '_MREL')?.value)
        const kind = famcKind.get(`${r.xref}|${x}`) ?? (rel && rel !== 'biological' ? rel : undefined) ?? 'biological'
        return { personId: idOf(x), kind }
      })
      .filter((c): c is { personId: string; kind: ChildKind } => !!c)
      // A child listed twice, or a parent listed as their own child, is dropped
      .filter((c, i, all) => !partnerIds.includes(c.personId) && all.findIndex((d) => d.personId === c.personId) === i)
    if (!partnerIds.length && !children.length) continue
    const f: Family = { id: `f_${r.xref!.replace(/[^A-Za-z0-9_-]/g, '')}`, partnerIds: [...new Set(partnerIds)], children }
    // Children listed in an order other than by birth were arranged that way: keep it (TODO.md F18)
    const year = (id: string) => people[id].birth?.date?.year ?? 0
    const byBirth = [...children].sort((a, b) => year(a.personId) - year(b.personId))
    if (byBirth.some((c, i) => c !== children[i])) f.childOrder = 'set'
    const marr = child(r, 'MARR')
    const div = child(r, 'DIV')
    let status: FamilyStatus | undefined = marr ? 'married' : partnerIds.length === 2 ? 'partners' : undefined
    if (child(r, 'ENGA') && !marr) status = 'engaged'
    if (div) status = 'divorced'
    if (status) f.status = status
    const start = parseGedcomDate(child(marr ?? child(r, 'ENGA') ?? r, 'DATE')?.value)
    if (start && (marr || child(r, 'ENGA'))) f.start = start
    const end = parseGedcomDate(child(div ?? r, 'DATE')?.value)
    if (end && div) f.end = end
    for (const c of r.children) {
      if (c.tag === 'SOUR') skip('source citations')
      else if (!['HUSB', 'WIFE', 'CHIL', 'MARR', 'DIV', 'ENGA', 'CHAN', 'RIN', 'NOTE', 'NCHI', '_UID', 'UID', 'REFN'].includes(c.tag) && !c.tag.startsWith('_')) {
        skip(EVENT_NAMES[c.tag] ?? c.tag.toLowerCase())
      }
    }
    families[f.id] = f
  }

  const count = (tag: string) => records.filter((r) => r.tag === tag).length
  const report: string[] = [`Read as ${encoding}`]
  if (unnamed.length) report.push(`${unnamed.length} ${unnamed.length === 1 ? 'person has' : 'people have'} no name (${unnamed.slice(0, 5).join(', ')}${unnamed.length > 5 ? '...' : ''}). They show as "Someone" until you name them.`)
  const sources = count('SOUR')
  if (sources) report.push(`Skipped ${sources} source ${sources === 1 ? 'record' : 'records'}. Jangal doesn't track sources yet.`)
  for (const [what, n] of [...skipped].sort((a, b) => b[1] - a[1])) report.push(`Skipped ${n} ${what}`)
  if (media.length) {
    report.push(`${media.length} ${media.length === 1 ? 'photo is' : 'photos are'} linked by a file path, which a browser can't open. Add ${media.length === 1 ? 'it' : 'them'} from each person's card:`)
    report.push(...media.slice(0, 20).map((m) => `  ${m}`))
  }
  if (badLines) report.push(`${badLines} ${badLines === 1 ? 'line' : 'lines'} couldn't be read and were ignored`)

  const tree: ExportedTree = {
    schemaVersion: SCHEMA_VERSION,
    id: 'imported',
    title: '',
    titleAuto: true,
    showStats: true,
    homePersonId: null,
    people,
    families,
    view: emptyView(),
    meta: { createdAt: now, updatedAt: now, app: 'jangal' },
  }
  const n = Object.keys(people).length
  if (!n) return { ok: false, error: 'This GEDCOM file has no people in it.' }
  return { ok: true, preview: { ok: true, tree, people: n, photos: 0, warnings: [], source: 'json' }, report }
}

const EVENT_NAMES: Record<string, string> = {
  BURI: 'burials', CHR: 'christenings', BAPM: 'baptisms', RESI: 'residences', OCCU: 'occupations', EDUC: 'education records',
  CENS: 'census records', EMIG: 'emigrations', IMMI: 'immigrations', NATU: 'naturalizations', GRAD: 'graduations',
  RETI: 'retirements', RELI: 'religion records', EVEN: 'other events', FACT: 'other facts', TITL: 'titles', CONF: 'confirmations',
  PROB: 'probate records', WILL: 'wills', CREM: 'cremations', ADOP: 'adoption events', DSCR: 'descriptions', NATI: 'nationalities',
  SSN: 'ID numbers', ASSO: 'associations', ALIA: 'aliases', MARB: 'marriage banns', MARC: 'marriage contracts', MARL: 'marriage licenses',
  MARS: 'marriage settlements', ANUL: 'annulments', DIVF: 'divorce filings', RESN: 'privacy flags',
}
