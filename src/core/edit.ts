import { nanoid } from 'nanoid'
import { indexOf, type TreeIndex } from './index'
import type { ChildKind, Family, Gender, Person, TreeCore } from './model'
import { fullName, isPet } from './model'

// Edits to the tree (PLAN 8.4, "add relative" choices). Each one mutates a draft document, so the
// store can run it through immer and undo gets one step per edit. They're plain functions, so the
// tests call them directly.

export type RelativeType = 'parent' | 'partner' | 'child' | 'sibling' | 'pet'

export type EditResult = { ok: true; id: string } | { ok: false; reason: string }

export const newPersonId = () => nanoid(10)
export const newFamilyId = () => `f_${nanoid(10)}`

const now = () => new Date().toISOString()

export function blankPerson(fields: Partial<Person> = {}): Person {
  const t = now()
  return { id: newPersonId(), firstName: '', gender: 'unknown', createdAt: t, updatedAt: t, ...fields }
}

function addFamily(doc: TreeCore, f: Omit<Family, 'id'> & { id?: string }): Family {
  const fam: Family = { id: f.id ?? newFamilyId(), ...f } as Family
  doc.families[fam.id] = fam
  return fam
}

/** The families someone could have a new child in, newest first */
export function childFamiliesFor(ix: TreeIndex, id: string): Family[] {
  return ix
    .familiesOf(id)
    .map((fid) => ix.family(fid)!)
    .slice()
    .reverse()
}

/** The families where someone is the only parent recorded */
const soloFamilies = (doc: TreeCore, id: string) =>
  Object.values(doc.families).filter((f) => f.partnerIds.length === 1 && f.partnerIds[0] === id)
const withChildren = (f: Family) => f.children.length > 0

/**
 * A partner joins someone's single parent family. Its status and dates belonged to a partnership
 * that's gone (a removed or unknown partner), so the new one starts out married.
 */
function joinAsPartner(f: Family, id: string) {
  f.partnerIds.push(id)
  f.status = 'married'
  delete f.start
  delete f.end
}

/** True if `id` joining family `f` as a child would make someone their own ancestor */
const cyclesAsChild = (ix: TreeIndex, f: Family, id: string) => f.partnerIds.some((q) => wouldCycle(ix, q, id))

const OPPOSITE: Partial<Record<Gender, Gender>> = { male: 'female', female: 'male' }

/**
 * A first guess at the gender of a relative about to be added (TODO.md QA-2): a second parent is
 * the opposite of the one already there, and a partner the opposite of the person. It's only a
 * starting point that quick add shows selected, one click to change. Children and siblings, and
 * anyone next to a person of unknown gender, get no guess.
 */
export function guessGender(ix: TreeIndex, id: string, type: RelativeType): Gender | undefined {
  if (type === 'partner') return OPPOSITE[ix.person(id)?.gender ?? 'unknown']
  if (type !== 'parent') return undefined
  const parents = ix.parentsOf(id)
  return parents.length === 1 ? OPPOSITE[ix.person(parents[0])?.gender ?? 'unknown'] : undefined
}

export type AddOptions = {
  /** For a child: which of the person's families. Omit for their newest one. 'solo' means with an unknown partner. */
  familyId?: string | 'solo'
  /** For a half sibling: the one parent they share */
  halfWith?: string
  kind?: ChildKind
  fields?: Partial<Person>
}

/** Adds a new, unnamed relative. Returns the new person's id. */
export function addRelative(doc: TreeCore, id: string, type: RelativeType, opts: AddOptions = {}): EditResult {
  const base = doc.people[id]
  if (!base) return { ok: false, reason: 'That person is no longer in the tree' }
  if (isPet(base)) return { ok: false, reason: "Pets don't have relatives of their own in the tree" }
  const ix = indexOf(doc)
  const kind = opts.kind ?? 'biological'
  // A pet joins its owners' family like a child, and starts as just a pet until its kind is chosen
  const p = blankPerson(type === 'pet' ? { species: 'Pet', ...opts.fields } : opts.fields)

  if (type === 'parent') {
    let fid = ix.birthFamilyOf(id)
    if (fid && doc.families[fid].partnerIds.length >= 2) {
      return { ok: false, reason: `${base.firstName || 'They'} already has two parents` }
    }
    if (!fid) fid = addFamily(doc, { partnerIds: [], status: 'married', children: [{ personId: id, kind: 'biological' }] }).id
    if (!opts.fields?.lastName && base.lastName) p.lastName = base.lastName
    doc.people[p.id] = p
    doc.families[fid].partnerIds.push(p.id)
    return { ok: true, id: p.id }
  }

  if (type === 'partner') {
    doc.people[p.id] = p
    // Children with only one parent recorded get the new partner as their other parent. The edit
    // card can make them a step parent instead (setParentOf).
    const solo = soloFamilies(doc, id).find(withChildren)
    if (solo) joinAsPartner(solo, p.id)
    else addFamily(doc, { partnerIds: [id, p.id], status: 'married', children: [] })
    return { ok: true, id: p.id }
  }

  if (type === 'child' || type === 'pet') {
    let fam: Family | undefined
    if (opts.familyId && opts.familyId !== 'solo') fam = doc.families[opts.familyId]
    else if (!opts.familyId) fam = childFamiliesFor(ix, id)[0] && doc.families[childFamiliesFor(ix, id)[0].id]
    if (!fam) {
      // A single parent family, or one with an unknown partner
      fam = ix
        .familiesOf(id)
        .map((f) => doc.families[f])
        .find((f) => f.partnerIds.length === 1)
      if (!fam) fam = addFamily(doc, { partnerIds: [id], children: [] })
    }
    if (!opts.fields?.lastName && base.lastName && type !== 'pet') p.lastName = base.lastName
    doc.people[p.id] = p
    fam.children.push({ personId: p.id, kind })
    return { ok: true, id: p.id }
  }

  // sibling
  if (!opts.fields?.lastName && base.lastName) p.lastName = base.lastName
  if (opts.halfWith) {
    if (!ix.parentsOf(id).includes(opts.halfWith)) return { ok: false, reason: 'A half sibling shares one of their parents' }
    doc.people[p.id] = p
    const [existing] = soloFamilies(doc, opts.halfWith)
    if (existing) existing.children.push({ personId: p.id, kind })
    else addFamily(doc, { partnerIds: [opts.halfWith], children: [{ personId: p.id, kind }] })
    return { ok: true, id: p.id }
  }
  let fid = ix.birthFamilyOf(id)
  // No parents yet: an "unknown parents" family keeps the siblings grouped (PLAN R-6)
  if (!fid) fid = addFamily(doc, { partnerIds: [], children: [{ personId: id, kind: 'biological' }] }).id
  doc.people[p.id] = p
  doc.families[fid].children.push({ personId: p.id, kind })
  return { ok: true, id: p.id }
}

/**
 * Shows a family's children in the order given, as the family arranged them (TODO.md F18), instead
 * of by birth. ids are some or all of its children, in the new order; any it leaves out keep their
 * places after them. Only the order changes: who is related to whom stays the same.
 */
export function setChildOrder(doc: TreeCore, familyId: string, ids: string[]): EditResult {
  const f = doc.families[familyId]
  if (!f) return { ok: false, reason: 'That family is no longer in the tree' }
  const listed = new Set(ids)
  if (listed.size !== ids.length || ids.some((id) => !f.children.some((c) => c.personId === id))) {
    return { ok: false, reason: 'Only brothers and sisters can be put in order' }
  }
  const link = (id: string) => f.children.find((c) => c.personId === id)!
  f.children = [...ids.map(link), ...f.children.filter((c) => !listed.has(c.personId))]
  f.childOrder = 'set'
  return { ok: true, id: ids[0] ?? familyId }
}

/** Goes back to showing a family's children by birth (TODO.md DR-6) */
export function resetChildOrder(doc: TreeCore, familyId: string): EditResult {
  const f = doc.families[familyId]
  if (!f?.childOrder) return { ok: false, reason: 'They are already in birth order' }
  delete f.childOrder
  return { ok: true, id: familyId }
}

/** True if making `parent` a parent of `child` would make someone their own ancestor */
export function wouldCycle(ix: TreeIndex, parent: string, child: string) {
  return parent === child || ix.descendants(child).has(parent)
}

/** Links two people who are both already in the tree (PLAN R-5) */
export function linkExisting(doc: TreeCore, id: string, type: RelativeType, otherId: string, opts: AddOptions = {}): EditResult {
  const a = doc.people[id]
  const b = doc.people[otherId]
  if (!a || !b) return { ok: false, reason: 'That person is no longer in the tree' }
  if (id === otherId) return { ok: false, reason: "Someone can't be their own relative" }
  // A pet can only be linked as someone's pet
  if (type === 'pet' ? !isPet(b) || isPet(a) : isPet(a) || isPet(b)) return { ok: false, reason: 'A pet can only be linked as a pet of its owners' }
  const ix = indexOf(doc)
  const kind = opts.kind ?? 'biological'
  const name = (p: Person) => p.firstName || fullName(p)

  if (type === 'partner') {
    if (ix.partnerFamilyBetween(id, otherId)) return { ok: false, reason: `${name(a)} and ${name(b)} are already partners` }
    // Like adding a partner: one side's children with a single parent get the other as a parent.
    // Two single parents keep each other's children as stepchildren.
    const sa = soloFamilies(doc, id).find(withChildren)
    const sb = soloFamilies(doc, otherId).find(withChildren)
    const [solo, joiner] = sa && !sb ? [sa, otherId] : sb && !sa ? [sb, id] : []
    if (solo && joiner && !solo.children.some((c) => wouldCycle(ix, joiner, c.personId))) joinAsPartner(solo, joiner)
    else addFamily(doc, { partnerIds: [id, otherId], status: 'married', children: [] })
    return { ok: true, id: otherId }
  }

  if (type === 'parent') {
    if (wouldCycle(ix, otherId, id)) return { ok: false, reason: `${name(b)} is already a descendant of ${name(a)}` }
    let fid = ix.birthFamilyOf(id)
    if (fid && doc.families[fid].partnerIds.includes(otherId)) return { ok: false, reason: `${name(b)} is already a parent of ${name(a)}` }
    if (fid && doc.families[fid].partnerIds.length >= 2) return { ok: false, reason: `${name(a)} already has two parents` }
    if (!fid) {
      // Join a single parent family of theirs if there is one, so siblings stay together
      const [solo] = soloFamilies(doc, otherId)
      if (solo) {
        solo.children.push({ personId: id, kind })
        return { ok: true, id: otherId }
      }
      fid = addFamily(doc, { partnerIds: [], status: 'married', children: [{ personId: id, kind }] }).id
    }
    doc.families[fid].partnerIds.push(otherId)
    return { ok: true, id: otherId }
  }

  if (type === 'child' || type === 'pet') {
    if (wouldCycle(ix, id, otherId)) return { ok: false, reason: `${name(b)} is already an ancestor of ${name(a)}` }
    if (ix.birthFamilyOf(otherId)) {
      const bf = doc.families[ix.birthFamilyOf(otherId)!]
      if (bf.partnerIds.length === 0) {
        // Unknown parents so far: this person becomes the parent of the whole group
        bf.partnerIds.push(id)
        return { ok: true, id: otherId }
      }
      if (bf.partnerIds.length === 1 && !bf.partnerIds.includes(id)) {
        bf.partnerIds.push(id)
        return { ok: true, id: otherId }
      }
      return { ok: false, reason: `${name(b)} already has parents` }
    }
    const fam =
      (opts.familyId && opts.familyId !== 'solo' ? doc.families[opts.familyId] : undefined) ??
      (childFamiliesFor(ix, id)[0] ? doc.families[childFamiliesFor(ix, id)[0].id] : undefined) ??
      addFamily(doc, { partnerIds: [id], children: [] })
    fam.children.push({ personId: otherId, kind })
    return { ok: true, id: otherId }
  }

  // sibling: whoever has no parents yet joins the other's family
  const fa = ix.birthFamilyOf(id)
  const fb = ix.birthFamilyOf(otherId)
  const ownAncestor = { ok: false as const, reason: `${name(a)} and ${name(b)} can't be siblings: one is the other's parent or ancestor` }
  if (opts.halfWith) {
    // A half sibling: the other joins the one shared parent's single parent family
    if (!ix.parentsOf(id).includes(opts.halfWith)) return { ok: false, reason: 'A half sibling shares one of their parents' }
    if (fb) return { ok: false, reason: `${name(b)} already has parents` }
    if (wouldCycle(ix, opts.halfWith, otherId)) return ownAncestor
    const solo = soloFamilies(doc, opts.halfWith)[0] ?? addFamily(doc, { partnerIds: [opts.halfWith], children: [] })
    solo.children.push({ personId: otherId, kind })
    return { ok: true, id: otherId }
  }
  if (fa && fa === fb) return { ok: false, reason: `${name(a)} and ${name(b)} are already siblings` }
  if (fa && fb) return { ok: false, reason: `${name(a)} and ${name(b)} both already have parents` }
  if (fa) {
    if (cyclesAsChild(ix, doc.families[fa], otherId)) return ownAncestor
    doc.families[fa].children.push({ personId: otherId, kind })
  } else if (fb) {
    if (cyclesAsChild(ix, doc.families[fb], id)) return ownAncestor
    doc.families[fb].children.push({ personId: id, kind })
  } else addFamily(doc, { partnerIds: [], children: [{ personId: id, kind: 'biological' }, { personId: otherId, kind }] })
  return { ok: true, id: otherId }
}

/**
 * Makes someone a parent of their partner's child (on), or their step parent (off). The child
 * moves between the couple's family and the partner's single parent family.
 */
export function setParentOf(doc: TreeCore, familyId: string, parentId: string, childId: string, on: boolean): EditResult {
  const fam = doc.families[familyId]
  const other = fam?.partnerIds.find((x) => x !== parentId)
  if (!fam || !other || !fam.partnerIds.includes(parentId)) return { ok: false, reason: 'They are no longer partners' }
  const solos = soloFamilies(doc, other)
  const from = on ? solos.find((f) => f.children.some((c) => c.personId === childId)) : fam
  const link = from?.children.find((c) => c.personId === childId)
  if (!from || !link) return { ok: false, reason: 'That child is no longer in this family' }
  if (on && wouldCycle(indexOf(doc), parentId, childId)) return { ok: false, reason: "Someone can't be their own ancestor" }
  const moved = { personId: childId, kind: link.kind }
  from.children = from.children.filter((c) => c.personId !== childId)
  if (on) {
    fam.children.push(moved)
    if (!from.children.length) delete doc.families[from.id]
  } else (solos[0] ?? addFamily(doc, { partnerIds: [other], children: [] })).children.push(moved)
  return { ok: true, id: childId }
}

/** Families left meaningless after someone leaves them */
function pruneFamilies(doc: TreeCore) {
  for (const f of Object.values(doc.families)) {
    const partners = f.partnerIds.length
    const kids = f.children.length
    // Keep partnerships, single parents with children, and unknown parents grouping 2+ siblings
    const keep = partners >= 2 || (partners === 1 && kids > 0) || (partners === 0 && kids >= 2)
    if (!keep) delete doc.families[f.id]
  }
}

/** Removes someone and every link to them. Their relatives stay. */
export function removePerson(doc: TreeCore, id: string): EditResult {
  if (!doc.people[id]) return { ok: false, reason: 'That person is no longer in the tree' }
  delete doc.people[id]
  // What they called anyone goes with them (TODO.md CT-4)
  for (const p of Object.values(doc.people)) {
    if (!p.calledByFrom || !(id in p.calledByFrom)) continue
    delete p.calledByFrom[id]
    if (!Object.keys(p.calledByFrom).length) delete p.calledByFrom
  }
  for (const f of Object.values(doc.families)) {
    f.partnerIds = f.partnerIds.filter((x) => x !== id)
    f.children = f.children.filter((c) => c.personId !== id)
  }
  pruneFamilies(doc)
  if (doc.homePersonId === id) doc.homePersonId = null
  return { ok: true, id }
}

/** What deleting someone will do, in words, before it happens (PLAN P-6) */
export function deletePreview(ix: TreeIndex, id: string, homeId: string | null): string[] {
  const p = ix.person(id)
  if (!p) return []
  const out: string[] = []
  const first = (pid: string) => ix.person(pid)?.firstName || 'someone'
  for (const fid of ix.familiesOf(id)) {
    const f = ix.family(fid)!
    const kids = f.children.map((c) => c.personId)
    if (!kids.length) continue
    const others = f.partnerIds.filter((x) => x !== id)
    const n = kids.length
    const their = n === 1 ? first(kids[0]) : `Their ${n} children`
    out.push(
      others.length
        ? `${their} will stay, connected to ${others.map((o) => fullName(ix.person(o)!)).join(' and ')} only.`
        : `${their} will stay in the tree, with no parent recorded on this side.`,
    )
  }
  const partners = ix.partnersOf(id)
  const childless = partners.filter((q) => !ix.familiesOf(id).some((fid) => ix.family(fid)!.partnerIds.includes(q) && ix.family(fid)!.children.length))
  if (childless.length) out.push(`${childless.map(first).join(' and ')} will stay, without this partnership.`)
  if (id === homeId) out.push('You are marked as this person, so the tree will switch to the neutral view.')
  return out
}

/** Applies a patch to someone, stamping updatedAt */
export function updatePerson(doc: TreeCore, id: string, patch: Partial<Person>): EditResult {
  const p = doc.people[id]
  if (!p) return { ok: false, reason: 'That person is no longer in the tree' }
  for (const [k, v] of Object.entries(patch) as [keyof Person, unknown][]) {
    if (k === 'id') continue
    if (v === undefined || v === '') delete p[k]
    else (p as Record<string, unknown>)[k] = v
  }
  if (!p.firstName) p.firstName = ''
  p.updatedAt = now()
  return { ok: true, id }
}
