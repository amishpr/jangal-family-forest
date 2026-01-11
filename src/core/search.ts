import Fuse from 'fuse.js'
import type { TreeIndex } from './index'
import { fullName } from './model'

// Finding people (PLAN S-1): fuzzy over full name, nickname, maiden name, birthplace, birth year
// and tags. Typos like "Lakshmy" still match, and accents don't matter ("Tomas" finds Tomás).
// A name that starts with what you typed always comes first.

type Doc = { id: string; name: string; first: string; last: string; nickname: string; called: string; maiden: string; place: string; year: string; tags: string }

export type Match = { id: string; score: number }

const cache = new WeakMap<TreeIndex, Fuse<Doc>>()

function fuseFor(ix: TreeIndex) {
  let f = cache.get(ix)
  if (!f) {
    const docs: Doc[] = ix.ids.map((id) => {
      const p = ix.person(id)!
      return {
        id,
        name: fullName(p),
        first: p.firstName ?? '',
        last: p.lastName ?? '',
        nickname: p.nickname ?? '',
        called: [p.calledBy, ...Object.values(p.calledByFrom ?? {})].filter(Boolean).join(' '),
        maiden: p.birthSurname ?? '',
        place: [p.birth?.place, p.livesIn].filter(Boolean).join(' '),
        year: p.birth?.date?.year ? String(p.birth.date.year) : '',
        tags: (p.tags ?? []).join(' '),
      }
    })
    f = new Fuse(docs, {
      keys: [
        { name: 'name', weight: 3 },
        { name: 'first', weight: 3 },
        { name: 'nickname', weight: 2.5 },
        { name: 'called', weight: 2.5 },
        { name: 'last', weight: 2 },
        { name: 'maiden', weight: 2 },
        { name: 'place', weight: 1 },
        { name: 'year', weight: 1 },
        { name: 'tags', weight: 1 },
      ],
      includeScore: true,
      ignoreDiacritics: true,
      ignoreLocation: true,
      threshold: 0.34,
      minMatchCharLength: 1,
    })
    cache.set(ix, f)
  }
  return f
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function searchPeople(ix: TreeIndex, query: string, limit = 20): Match[] {
  const q = norm(query.trim())
  if (!q) return []
  const results = fuseFor(ix).search(q, { limit: limit * 2 })
  return results
    .map((r) => {
      const d = r.item
      // Names that start with the query jump ahead of looser matches
      const starts = [d.first, d.name, d.nickname, d.last, d.maiden].some((s) => s && norm(s).startsWith(q))
      return { id: d.id, score: (r.score ?? 1) - (starts ? 1 : 0) }
    })
    .sort((a, b) => a.score - b.score || (ix.order.get(a.id) ?? 0) - (ix.order.get(b.id) ?? 0))
    .slice(0, limit)
}
