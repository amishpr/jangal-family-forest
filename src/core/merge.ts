import { newFamilyId, newPersonId } from './edit'
import type { Family, LifeEvent, Person, TreeCore } from './model'
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
 */
export function findMatches(base: Graph, other: Graph): Match[] {
  const byKey = new Map<string, Person[]>()
  for (const p of Object.values(base.people)) for (const k of nameKeys(p)) byKey.set(k, [...(byKey.get(k) ?? []), p])
  const found: Match[] = []
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
  // Strong ones first, then each person only once on each side
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

function fillEvent(here: LifeEvent | undefined, there: LifeEvent | undefined, name: string, what: string, conflicts: string[]): LifeEvent | undefined {
  if (!there) return here
  const out: LifeEvent = { ...here }
  if (there.date) {
    if (!out.date) out.date = there.date
    else if (!same(out.date, there.date)) conflicts.push(`${name}: the ${what} date is ${formatDate(out.date)} here and ${formatDate(there.date)} in the other tree. ${formatDate(out.date)} was kept.`)
  }
  if (there.place) {
    if (!out.place) out.place = there.place
    else if (out.place !== there.place) conflicts.push(`${name}: the ${what} place is ${out.place} here and ${there.place} in the other tree. ${out.place} was kept.`)
  }
  return out
}

/**
 * Adds the other tree to this one (TODO.md CM-4 to CM-6), as one edit. pairs are [here, there]
 * ids of the same person, and at least one is needed: the other tree has to join this one
 * somewhere to be seen. Matched people keep what's here, take what's blank from the other tree,
 * and any differences are listed. Links that would make someone their own ancestor, or give
 * someone a second set of parents, are left out and listed too.
 */
export function mergeTrees(doc: Graph, other: Graph, pairs: [string, string][]): MergeResult {
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
      if (blank(mine)) (here as Record<string, unknown>)[k] = theirs
      else if (!same(mine, theirs) && squash(String(mine)) !== squash(String(theirs)) && k !== 'photoId') report.conflicts.push(`${name}: the ${label} is ${String(mine).slice(0, 60)} here and ${String(theirs).slice(0, 60)} in the other tree. This tree's was kept.`)
    }
    if ((here.gender ?? 'unknown') === 'unknown' && o.gender && o.gender !== 'unknown') here.gender = o.gender
    const birth = fillEvent(here.birth, o.birth, name, 'birth', report.conflicts)
    if (birth) here.birth = birth
    const death = fillEvent(here.death, o.death, name, 'death', report.conflicts)
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
      if (!fam.status && theirs.status) fam.status = theirs.status
      if (!fam.start && theirs.start) fam.start = theirs.start
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
