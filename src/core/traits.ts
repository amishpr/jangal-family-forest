import type { TreeIndex } from './index'

// Traits (TODO.md F2): "Black hair", "Left-handed", "Actor". They're kept in Person.tags, and this
// works out who has one and how it ran through the family: from a parent who has it to a child
// who has it, and across a generation that doesn't show it. It's what the family wrote down, not
// genetics, so adopted and step children count too.

/** Suggestions while typing, after the traits already in the tree. Plain and not medical. */
export const STARTER_TRAITS = [
  'Black hair', 'Brown hair', 'Blonde hair', 'Red hair', 'Curly hair', 'Straight hair',
  'Brown eyes', 'Black eyes', 'Hazel eyes', 'Green eyes', 'Blue eyes',
  'Left-handed', 'Right-handed', 'Dimples', 'Freckles', 'Tall', "Widow's peak", 'Twins', 'Musical', 'Artistic',
]

/** "  left   handed " becomes "left handed": the words, tidied */
export const tidyTrait = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The same trait however it's written: "Left-handed", "left handed" and "LEFT HANDED" match */
export const traitKey = (s: string) => tidyTrait(s.replace(/[-_]+/g, ' ')).toLowerCase()

export type TraitCount = { name: string; count: number }

const cache = new WeakMap<TreeIndex, TraitCount[]>()

/** Every trait in the tree, the most common first, spelled the way it was first written */
export function allTraits(ix: TreeIndex): TraitCount[] {
  let out = cache.get(ix)
  if (!out) {
    const seen = new Map<string, TraitCount>()
    for (const id of ix.ids) {
      for (const t of new Set((ix.person(id)?.tags ?? []).map(traitKey))) {
        const name = ix.person(id)!.tags!.find((x) => traitKey(x) === t)!
        const c = seen.get(t)
        if (c) c.count++
        else seen.set(t, { name: tidyTrait(name), count: 1 })
      }
    }
    out = [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    cache.set(ix, out)
  }
  return out
}

/**
 * The trait as it's already written in the tree, or in the starter list, or else tidied and with a
 * capital first letter (TR-2): "left handed" becomes "Left-handed", "has a lisp" becomes "Has a lisp"
 */
export function spellTrait(ix: TreeIndex, typed: string): string {
  const k = traitKey(typed)
  const known = allTraits(ix).find((t) => traitKey(t.name) === k)?.name ?? STARTER_TRAITS.find((t) => traitKey(t) === k)
  const t = tidyTrait(typed)
  return known ?? t.charAt(0).toUpperCase() + t.slice(1)
}

/** Matches the file format's cap (core/schema.ts) */
export const MAX_TRAITS = 50

/** What a Save keeps: each trait tidied and spelled as in the tree, once, empty ones dropped */
export function cleanTraits(ix: TreeIndex, list: string[]): string[] | undefined {
  const out: string[] = []
  for (const raw of list) {
    const t = spellTrait(ix, raw)
    if (t && !out.some((x) => traitKey(x) === traitKey(t))) out.push(t)
  }
  return out.length ? out.slice(0, MAX_TRAITS) : undefined
}

export const hasTrait = (ix: TreeIndex, id: string, trait: string) => {
  const k = traitKey(trait)
  return (ix.person(id)?.tags ?? []).some((t) => traitKey(t) === k)
}

export type TraitView = {
  /** Everyone with the trait, in tree order */
  carriers: string[]
  /** A parent with the trait, a child with it, and the family between them */
  links: { familyId: string; parentId: string; childId: string }[]
  /** Someone whose parents don't have it, but an ancestor further up does */
  skips: { personId: string; ancestorId: string; generations: number }[]
  /** The longest unbroken line of people with it, counted in generations */
  generations: number
}

const views = new WeakMap<TreeIndex, Map<string, TraitView>>()

/** Who has a trait and how it ran through the family. Cached per tree version and trait. */
export function traitView(ix: TreeIndex, trait: string): TraitView {
  let byTrait = views.get(ix)
  if (!byTrait) views.set(ix, (byTrait = new Map()))
  const k = traitKey(trait)
  let v = byTrait.get(k)
  if (!v) byTrait.set(k, (v = computeView(ix, trait)))
  return v
}

/** Where one person's trait came from, and who they passed it on to (TODO.md TR-7) */
export function traitLineage(ix: TreeIndex, id: string, trait: string): { from: string[]; skippedFrom: { id: string; generations: number } | null; to: string[] } {
  const v = traitView(ix, trait)
  const skip = v.skips.find((s) => s.personId === id)
  return {
    from: v.links.filter((l) => l.childId === id).map((l) => l.parentId),
    skippedFrom: skip ? { id: skip.ancestorId, generations: skip.generations } : null,
    to: v.links.filter((l) => l.parentId === id).map((l) => l.childId),
  }
}

function computeView(ix: TreeIndex, trait: string): TraitView {
  const carriers = ix.ids.filter((id) => hasTrait(ix, id, trait))
  const has = new Set(carriers)
  const links: TraitView['links'] = []
  const skips: TraitView['skips'] = []
  for (const c of carriers) {
    for (const f of ix.parentFamiliesOf(c)) {
      for (const p of ix.family(f)?.partnerIds ?? []) if (has.has(p)) links.push({ familyId: f, parentId: p, childId: c })
    }
    if (links.some((l) => l.childId === c)) continue
    // No parent has it: the nearest ancestor who does, two or more generations up
    let best: { id: string; d: number } | null = null
    for (const [a, d] of ix.ancestors(c)) if (has.has(a) && d >= 2 && (!best || d < best.d)) best = { id: a, d }
    if (best) skips.push({ personId: c, ancestorId: best.id, generations: best.d })
  }
  // A line's length: one more than the nearest ancestors on it
  const depth = new Map<string, number>()
  const lineOf = (c: string): number => {
    let n = depth.get(c)
    if (n === undefined) {
      depth.set(c, 1)
      // ancestors() includes the person at distance 0
      const ups = [...ix.ancestors(c).keys()].filter((a) => a !== c && has.has(a))
      n = 1 + Math.max(0, ...ups.map(lineOf))
      depth.set(c, n)
    }
    return n
  }
  return { carriers, links, skips, generations: Math.max(0, ...carriers.map(lineOf)) }
}
