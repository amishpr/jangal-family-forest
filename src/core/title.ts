import type { TreeIndex } from './index'
import type { TreeCore } from './model'
import { isPet } from './model'
import { foundingLines } from './sides'

// The tree's own title (PLAN 6.12). It's suggested from the two largest founding lines until you
// rename it, it never depends on who is marked as you, and file names follow it.

/** A generation number for everyone, 0 being the oldest. Partners share a row. */
export function generations(ix: TreeIndex): Map<string, number> {
  const gen = new Map<string, number>(ix.ids.map((id) => [id, 0]))
  const g = (id: string) => gen.get(id) ?? 0
  for (let it = 0; it < 60; it++) {
    let changed = false
    const raise = (id: string, want: number) => {
      if (g(id) < want) {
        gen.set(id, want)
        changed = true
      }
    }
    for (const id of ix.ids) {
      const ps = ix.parentsOf(id)
      if (ps.length) raise(id, Math.max(...ps.map(g)) + 1)
    }
    for (const f of Object.values(ix.families)) {
      const ps = f.partnerIds.filter((p) => gen.has(p))
      if (ps.length > 1) {
        const m = Math.max(...ps.map(g))
        for (const p of ps) raise(p, m)
      }
    }
    // Someone with no recorded parents sits one row above their eldest child's row
    for (const id of ix.ids) {
      if (ix.parentsOf(id).length) continue
      const kids = ix.childrenOf(id)
      if (kids.length) raise(id, Math.max(...kids.map(g)) - 1)
    }
    if (!changed) break
  }
  if (gen.size) {
    const min = Math.min(...gen.values())
    for (const [k, v] of gen) gen.set(k, v - min)
  }
  return gen
}

/** "The Kapoor & Bachchan Family": the two largest founding lines, else the most common surname */
export function suggestedTitle(ix: TreeIndex): string {
  const lines = foundingLines(ix)
    .slice(0, 2)
    .map((l) => l.surname)
  if (lines.length) return `The ${lines.join(' & ')} Family`
  const count = new Map<string, number>()
  for (const id of ix.ids) {
    const n = ix.person(id)!.lastName
    if (n) count.set(n, (count.get(n) ?? 0) + 1)
  }
  let top = ''
  let bestN = 0
  for (const [n, c] of count) if (c > bestN) [top, bestN] = [n, c]
  return top ? `The ${top} Family` : 'Our Family Tree'
}

export function treeTitle(doc: Pick<TreeCore, 'title' | 'titleAuto'>, ix: TreeIndex): string {
  return doc.titleAuto || !doc.title.trim() ? suggestedTitle(ix) : doc.title
}

/** "23 people · 5 generations · since 1911" */
export function treeStats(ix: TreeIndex): string {
  if (!ix.ids.length) return ''
  // Pets are counted apart from people, and don't make a generation of their own (TODO.md PT-4)
  const pets = ix.ids.filter((id) => isPet(ix.person(id))).length
  const n = ix.ids.length - pets
  const gens = Math.max(0, ...[...generations(ix)].filter(([id]) => !isPet(ix.person(id))).map(([, g]) => g)) + 1
  let since = Infinity
  for (const id of ix.ids) {
    const y = ix.person(id)!.birth?.date?.year
    if (y && y < since) since = y
  }
  return [
    `${n} ${n === 1 ? 'person' : 'people'}`,
    pets ? `${pets} ${pets === 1 ? 'pet' : 'pets'}` : '',
    `${gens} ${gens === 1 ? 'generation' : 'generations'}`,
    Number.isFinite(since) ? `since ${since}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const deaccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "The Kapoor & Bachchan Family" becomes "kapoor-bachchan-family". Scripts other than Latin are kept. */
export function titleSlug(title: string): string {
  const slug = deaccent(title)
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'family-tree'
}

/** "Kapoor & Bachchan birthdays" */
export function calendarName(title: string): string {
  return `${title.replace(/^the\s+/i, '').replace(/\s+family$/i, '')} birthdays`
}

const GEN_NAMES: Record<number, string> = {
  3: 'Great-grandparents',
  2: 'Grandparents',
  1: 'Parents',
  0: 'Your generation',
  [-1]: 'Children',
  [-2]: 'Grandchildren',
}

/** A generation named from yours: 2 is "Grandparents", -1 is "Children" */
export function generationName(diff: number): string {
  if (GEN_NAMES[diff]) return GEN_NAMES[diff]
  const greats = (n: number) => 'great-'.repeat(Math.max(0, n))
  const s = diff > 0 ? `${greats(diff - 2)}grandparents` : `${greats(-diff - 2)}grandchildren`
  return s.charAt(0).toUpperCase() + s.slice(1)
}
