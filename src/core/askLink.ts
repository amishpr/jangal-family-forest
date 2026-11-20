import type { TreeIndex } from './index'
import type { FamilyStatus } from './model'
import { isPet } from './model'

// The fill-in link (SHARE.md SH-3): who is asked, who is asking, and the names of the partners and
// children the tree already has, so the relative checks them instead of typing them again. Names
// only: no dates, places, notes or photos. It travels after the "#", which browsers never send to
// the server, and anyone can write one by hand, so reading it checks everything.

export type AskPerson = { id: string; first: string; last?: string }
export type AskFamily = { partner?: AskPerson; status?: FamilyStatus; children: AskPerson[] }
export type AskLink = {
  v: 1
  tree: { id: string; title: string }
  from: { name: string; email?: string }
  person: AskPerson
  families: AskFamily[]
}

const MAX_NAME = 120
const MAX_FAMILIES = 8
const MAX_CHILDREN = 30
const STATUSES: FamilyStatus[] = ['married', 'partners', 'engaged', 'divorced', 'separated', 'widowed']

const named = (ix: TreeIndex, id: string): AskPerson => {
  const p = ix.person(id)!
  return { id, first: p.firstName, ...(p.lastName ? { last: p.lastName } : {}) }
}

/** The link for one person: their families as the tree has them, pets left out */
export function askLinkFor(ix: TreeIndex, tree: { id: string; title: string }, personId: string, from: AskLink['from']): AskLink {
  const families = ix.familiesOf(personId).map((fid): AskFamily => {
    const f = ix.family(fid)!
    const partner = f.partnerIds.find((x) => x !== personId)
    return {
      ...(partner ? { partner: named(ix, partner) } : {}),
      ...(f.status ? { status: f.status } : {}),
      children: f.children.map((c) => c.personId).filter((c) => ix.person(c) && !isPet(ix.person(c))).map((c) => named(ix, c)),
    }
  })
  return {
    v: 1,
    tree: { id: tree.id, title: tree.title },
    from: { name: from.name.trim(), ...(from.email?.trim() ? { email: from.email.trim() } : {}) },
    person: named(ix, personId),
    // A family with no partner and no children (left after a pet) says nothing
    families: families.filter((f) => f.partner || f.children.length).slice(0, MAX_FAMILIES),
  }
}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** JSON, then UTF-8, then base64url, so names in any script survive being pasted around */
export const encodeAskLink = (link: AskLink) => toBase64Url(new TextEncoder().encode(JSON.stringify(link)))

/** The page's address with the link after the "#". base is the site's base path, like "/" */
export const askUrl = (link: AskLink, origin: string, base = '/') => `${origin}${base}add/#a=${encodeAskLink(link)}`

const str = (v: unknown, max = MAX_NAME): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const id = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : undefined)

function person(v: unknown): AskPerson | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const pid = id(o.id)
  const first = str(o.first)
  if (!pid || !first) return undefined
  const last = str(o.last)
  return { id: pid, first, ...(last ? { last } : {}) }
}

/** The link from a page's address ("#a=…"), or null for anything that isn't a whole, good link */
export function decodeAskLink(hash: string): AskLink | null {
  const raw = /(?:^#?|&)a=([A-Za-z0-9_-]+)/.exec(hash)?.[1]
  if (!raw) return null
  let o: Record<string, unknown>
  try {
    o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(raw)))
  } catch {
    return null
  }
  if (!o || typeof o !== 'object' || o.v !== 1) return null
  const tree = o.tree as Record<string, unknown> | undefined
  const from = o.from as Record<string, unknown> | undefined
  const treeId = id(tree?.id)
  const name = str(from?.name)
  const who = person(o.person)
  if (!treeId || !name || !who || !Array.isArray(o.families)) return null
  const email = str(from?.email, 200)
  const families = o.families.slice(0, MAX_FAMILIES).flatMap((f): AskFamily[] => {
    if (!f || typeof f !== 'object') return []
    const partner = person(f.partner)
    const status = STATUSES.includes(f.status) ? (f.status as FamilyStatus) : undefined
    const kids: unknown[] = Array.isArray(f.children) ? f.children : []
    const children = kids.slice(0, MAX_CHILDREN).map(person).filter((c): c is AskPerson => !!c)
    return [{ ...(partner ? { partner } : {}), ...(status ? { status } : {}), children }]
  })
  return {
    v: 1,
    tree: { id: treeId, title: str(tree?.title, 200) ?? '' },
    from: { name, ...(email && /^[^\s@]+@[^\s@]+$/.test(email) ? { email } : {}) },
    person: who,
    families,
  }
}
