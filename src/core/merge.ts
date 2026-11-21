import { newFamilyId, newPersonId } from './edit'
import type { Family, FamilyStatus, LifeEvent, Person, TreeCore } from './model'
import { fullName, isPet } from './model'
import { formatDate } from './dates'

// Combining two trees (TODO.md F12): a backup a cousin sent, or another tree in this browser, joined
// to the open one. People in both become one person, picked by the family in a review first, and
// everyone else comes over with new ids. Relationships stay facts: families are remapped and
// joined, never worked out again.

export type Match = { base: string; other: string; strong: boolean }

/** All a tree needs to be combined: its people and families */
type Graph = Pick<TreeCore, 'people' | 'families'>

const squash = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** "ravi shah", and "ravi patel" for someone born Patel */
const nameKeys = (p: Person) => {
  const first = squash(p.firstName)
  if (!first) return []
  return [...new Set([p.lastName, p.birthSurname, ''].map((l) => squash(`${first} ${l ?? ''}`)))]
}

/**
 * People who look like the same person in both trees (TODO.md CM-2): the same name, accents and case
 * ignored, and the same birth year (strong), or no year on one side (not strong). Different years
 * are different people, and pets only match pets. Each person matches once, strong matches first.
 * sameIds are people known to be the same in both, like those a fill-in link carried (SHARE.md
 * SH-13): they match by id whatever their names say, ahead of everyone else.
 */
export function findMatches(base: Graph, other: Graph, sameIds: string[] = []): Match[] {
  const byKey = new Map<string, Person[]>()
  for (const p of Object.values(base.people)) for (const k of nameKeys(p)) byKey.set(k, [...(byKey.get(k) ?? []), p])
  const found: Match[] = sameIds
    .filter((id) => base.people[id] && other.people[id] && isPet(base.people[id]) === isPet(other.people[id]))
    .map((id) => ({ base: id, other: id, strong: true }))
  for (const o of Object.values(other.people)) {
    const oy = o.birth?.date?.year
    const seen = new Set<string>()
    for (const k of nameKeys(o)) {
      for (const b of byKey.get(k) ?? []) {
        if (seen.has(b.id) || isPet(b) !== isPet(o)) continue
        seen.add(b.id)
        const by = b.birth?.date?.year
        if (by && oy && by !== oy) continue
        found.push({ base: b.id, other: o.id, strong: !!by && by === oy })
      }
    }
  }
  // Strong ones first (the sort keeps the same ids ahead), then each person only once on each side
  found.sort((a, b) => Number(b.strong) - Number(a.strong))
  const usedBase = new Set<string>()
  const usedOther = new Set<string>()
  return found.filter((m) => {
    if (usedBase.has(m.base) || usedOther.has(m.other)) return false
    usedBase.add(m.base)
    usedOther.add(m.other)
    return true
  })
}

export type MergeReport = { added: number; joined: number; conflicts: string[]; skipped: string[] }
export type MergeResult = { ok: true; id: string; report: MergeReport } | { ok: false; reason: string }

const blank = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Two values that really differ: not just in case, accents or spacing */
const differ = (a: unknown, b: unknown) => !same(a, b) && squash(String(a)) !== squash(String(b))

// Fields a matched person takes from the other tree when they're blank here, and how to name them
// in the list of differences
const FIELDS: [keyof Person, string][] = [
  ['firstName', 'first name'],
  ['middleName', 'middle name'],
  ['lastName', 'last name'],
  ['birthSurname', 'birth surname'],
  ['nickname', 'nickname'],
  ['calledBy', 'title'],
  ['genderOther', 'gender'],
  ['species', 'kind of pet'],
  ['livesIn', 'home'],
  ['notes', 'notes'],
  ['photoId', 'photo'],
]

/** take: the keys picked in the review (key is "<their id>:birth"), or undefined to keep this tree's and list the rest */
function fillEvent(here: LifeEvent | undefined, there: LifeEvent | undefined, name: string, what: string, key: string, conflicts: string[], take?: Set<string>): LifeEvent | undefined {
  if (!there) return here
  const out: LifeEvent = { ...here }
  if (there.date) {
    if (!out.date || take?.has(`${key}.date`)) out.date = there.date
    else if (!take && !same(out.date, there.date)) conflicts.push(`${name}: the ${what} date is ${formatDate(out.date)} here and ${formatDate(there.date)} in the other tree. ${formatDate(out.date)} was kept.`)
  }
  if (there.place) {
    if (!out.place || take?.has(`${key}.place`)) out.place = there.place
    else if (!take && out.place !== there.place) conflicts.push(`${name}: the ${what} place is ${out.place} here and ${there.place} in the other tree. ${out.place} was kept.`)
  }
  return out
}

/** One difference the review offers (SHARE.md SH-14), named for people to read */
export type Change = { key: string; personId: string; who: string; label: string; here: string; theirs: string; photo?: boolean }

const STATUS_WORDS: Record<FamilyStatus, string> = {
  married: 'Married',
  partners: 'Partners',
  engaged: 'Engaged',
  divorced: 'Divorced',
  separated: 'Separated',
  widowed: 'Widowed',
}
const partnerKey = (ids: string[]) => [...ids].sort().join('+')

/**
 * What combining would change for the people in both trees, before anything changes: each value
 * that differs, as a choice, and how many blanks the other tree fills in. Keys are what mergeTrees
 * takes: "<their id>:<field>", and "fam:<their family id>:start" or ":status" for a partnership.
 * Photos are offered only when asked (a reply's photos are new; another tree's are usually the
 * same pictures under new ids). For a photo, here and theirs are the two photo ids.
 */
export function diffPeople(base: Graph, other: Graph, pairs: [string, string][], opts: { photos?: boolean } = {}): { changes: Change[]; fills: number } {
  const changes: Change[] = []
  let fills = 0
  const toHere = new Map(pairs.map(([here, there]) => [there, here]))
  for (const [hid, oid] of pairs) {
    const h = base.people[hid]
    const o = other.people[oid]
    if (!h || !o) continue
    const who = h.firstName || fullName(h)
    const offer = (field: string, label: string, here: string, theirs: string, photo?: boolean) =>
      changes.push({ key: `${oid}:${field}`, personId: hid, who, label, here, theirs, ...(photo ? { photo } : {}) })
    for (const [k, label] of FIELDS) {
      const mine = h[k]
      const theirs = o[k]
      if (blank(theirs)) continue
      if (blank(mine)) fills++
      else if (k === 'photoId') {
        if (opts.photos && mine !== theirs) offer(k, label, String(mine), String(theirs), true)
      }
      else if (differ(mine, theirs)) offer(k, label, String(mine), String(theirs))
    }
    if (o.gender && o.gender !== 'unknown') {
      if (!h.gender || h.gender === 'unknown') fills++
      else if (h.gender !== o.gender) offer('gender', 'gender', h.gender, o.gender)
    }
    for (const [ev, what] of [['birth', 'birthday'], ['death', 'date of passing']] as const) {
      const a = h[ev]
      const b = o[ev]
      if (b?.date) {
        if (!a?.date) fills++
        else if (!same(a.date, b.date)) offer(`${ev}.date`, what, formatDate(a.date, true), formatDate(b.date, true))
      }
      if (b?.place) {
        if (!a?.place) fills++
        else if (differ(a.place, b.place)) offer(`${ev}.place`, ev === 'birth' ? 'born in' : 'place of passing', a.place, b.place)
      }
    }
  }
  // Partnerships both trees have: the same two people, as matched
  const famHere = new Map(Object.values(base.families).filter((f) => f.partnerIds.length === 2).map((f) => [partnerKey(f.partnerIds), f]))
  for (const theirs of Object.values(other.families)) {
    if (theirs.partnerIds.length !== 2 || !theirs.partnerIds.every((id) => toHere.has(id))) continue
    const ids = theirs.partnerIds.map((id) => toHere.get(id)!)
    const here = famHere.get(partnerKey(ids))
    if (!here) continue
    const who = ids.map((id) => base.people[id]?.firstName || 'Someone').join(' and ')
    const offer = (field: string, label: string, a: string, b: string) => changes.push({ key: `fam:${theirs.id}:${field}`, personId: ids[0], who, label, here: a, theirs: b })
    if (theirs.status) {
      if (!here.status) fills++
      else if (here.status !== theirs.status) offer('status', 'together as', STATUS_WORDS[here.status], STATUS_WORDS[theirs.status])
    }
    if (theirs.start) {
      if (!here.start) fills++
      else if (!same(here.start, theirs.start)) offer('start', ['married', 'divorced', 'widowed'].includes(theirs.status ?? here.status ?? '') ? 'wedding day' : 'together since', formatDate(here.start, true), formatDate(theirs.start, true))
    }
  }
  return { changes, fills }
}

/**
 * Adds the other tree to this one (TODO.md CM-4 to CM-6), as one edit. pairs are [here, there]
 * ids of the same person, and at least one is needed: the other tree has to join this one
 * somewhere to be seen. Matched people keep what's here, take what's blank from the other tree,
 * and any differences are listed. Links that would make someone their own ancestor, or give
 * someone a second set of parents, are left out and listed too.
 * take is the differences picked in the review (diffPeople's keys, SHARE.md SH-15): those take the
 * other tree's value. With take given, the review already showed every difference, so the ones
 * left unpicked aren't listed again.
 */
export function mergeTrees(doc: Graph, other: Graph, pairs: [string, string][], take?: Set<string>): MergeResult {
  // Check everything before changing anything
  if (!pairs.length) return { ok: false, reason: 'Choose at least one person who is in both trees' }
  const map = new Map<string, string>()
  for (const [here, there] of pairs) {
    if (!doc.people[here] || !other.people[there]) return { ok: false, reason: 'Someone in the list is no longer in the tree' }
    if (map.has(there) || [...map.values()].includes(here)) return { ok: false, reason: 'Each person can be matched only once' }
    map.set(there, here)
  }

  const report: MergeReport = { added: 0, joined: pairs.length, conflicts: [], skipped: [] }
  for (const id of Object.keys(other.people)) if (!map.has(id)) map.set(id, newPersonId())
  const to = (id: string) => map.get(id)!
  const remapWords = (words: Record<string, string> | undefined) =>
    words && Object.fromEntries(Object.entries(words).filter(([v]) => map.has(v)).map(([v, w]) => [to(v), w]))

  // People
  for (const o of Object.values(other.people)) {
    const id = to(o.id)
    const here = doc.people[id]
    if (!here) {
      const p: Person = { ...o, id }
      const words = remapWords(o.calledByFrom)
      if (words && Object.keys(words).length) p.calledByFrom = words
      else delete p.calledByFrom
      doc.people[id] = p
      report.added++
      continue
    }
    const name = fullName(here)
    for (const [k, label] of FIELDS) {
      const mine = here[k]
      const theirs = o[k]
      if (blank(theirs)) continue
      if (blank(mine) || take?.has(`${o.id}:${k}`)) (here as Record<string, unknown>)[k] = theirs
      else if (!take && differ(mine, theirs) && k !== 'photoId') report.conflicts.push(`${name}: the ${label} is ${String(mine).slice(0, 60)} here and ${String(theirs).slice(0, 60)} in the other tree. This tree's was kept.`)
    }
    if (o.gender && o.gender !== 'unknown' && ((here.gender ?? 'unknown') === 'unknown' || take?.has(`${o.id}:gender`))) here.gender = o.gender
    const birth = fillEvent(here.birth, o.birth, name, 'birth', `${o.id}:birth`, report.conflicts, take)
    if (birth) here.birth = birth
    const death = fillEvent(here.death, o.death, name, 'death', `${o.id}:death`, report.conflicts, take)
    if (death) here.death = death
    if (o.deceased) here.deceased = true
    const tags = [...new Set([...(here.tags ?? []), ...(o.tags ?? [])])]
    if (tags.length) here.tags = tags
    const words = { ...remapWords(o.calledByFrom), ...here.calledByFrom }
    if (Object.keys(words).length) here.calledByFrom = words
  }

  // Families, joined where the same partners are already a family here
  const birthFam = new Map<string, string>()
  for (const f of Object.values(doc.families)) for (const c of f.children) birthFam.set(c.personId, f.id)
  const key = (ids: string[]) => [...ids].sort().join('+')
  const byPartners = new Map(Object.values(doc.families).filter((f) => f.partnerIds.length).map((f) => [key(f.partnerIds), f]))
  // Everyone's children as the families are now, kept up to date as links are added
  const kids = new Map<string, string[]>()
  const link = (parent: string, child: string) => kids.set(parent, [...(kids.get(parent) ?? []), child])
  for (const f of Object.values(doc.families)) for (const par of f.partnerIds) for (const c of f.children) link(par, c.personId)
  // Whether a is b or one of b's ancestors
  const ancestorOf = (a: string, b: string) => {
    const seen = new Set([a])
    const queue = [a]
    for (let i = 0; i < queue.length; i++) {
      if (queue[i] === b) return true
      for (const c of kids.get(queue[i]) ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        queue.push(c)
      }
    }
    return false
  }
  const first = (id: string) => doc.people[id]?.firstName || 'Someone'

  for (const theirs of Object.values(other.families)) {
    const partners = theirs.partnerIds.map(to)
    let fam: Family | undefined
    if (partners.length) fam = byPartners.get(key(partners))
    else {
      // Brothers and sisters whose parents the other tree doesn't know join the family one of them
      // already has here, the way linking a sibling does
      const fid = theirs.children.map((c) => birthFam.get(to(c.personId))).find(Boolean)
      fam = fid ? doc.families[fid] : undefined
    }
    if (fam) {
      if (theirs.status && (!fam.status || take?.has(`fam:${theirs.id}:status`))) fam.status = theirs.status
      if (theirs.start && (!fam.start || take?.has(`fam:${theirs.id}:start`))) fam.start = theirs.start
      if (!fam.end && theirs.end) fam.end = theirs.end
    } else {
      fam = { ...theirs, id: newFamilyId(), partnerIds: partners, children: [] }
      doc.families[fam.id] = fam
      if (partners.length) byPartners.set(key(partners), fam)
    }
    for (const c of theirs.children) {
      const child = to(c.personId)
      const had = birthFam.get(child)
      if (had === fam.id) continue
      if (had) {
        report.skipped.push(`${first(child)} already has parents in this tree, so the other tree's ${partners.length ? `parents (${partners.map(first).join(' and ')})` : 'brothers and sisters'} weren't linked.`)
        continue
      }
      if (fam.partnerIds.some((par) => ancestorOf(child, par))) {
        report.skipped.push(`${first(child)} can't be a child of ${fam.partnerIds.map(first).join(' and ')}: it would make someone their own ancestor.`)
        continue
      }
      fam.children.push({ personId: child, kind: c.kind })
      birthFam.set(child, fam.id)
      for (const par of fam.partnerIds) link(par, child)
    }
    if (!fam.partnerIds.length && !fam.children.length) delete doc.families[fam.id]
  }
  return { ok: true, id: pairs[0][0], report }
}
