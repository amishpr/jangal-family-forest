import { nanoid } from 'nanoid'
import type { AskLink } from './askLink'
import { formatDate } from './dates'
import type { ChildKind, ExportedTree, Family, FamilyStatus, Gender, PartialDate, Person, PhotoMime } from './model'
import { emptyView, fullName, SCHEMA_VERSION } from './model'
import { embedJson, escapeHtml, treeToJson } from './treeFile'

// A relative's reply (SHARE.md SH-11): their answers as an ordinary Jangal file, so it goes through
// the same checks as any import, wrapped in a small page with no scripts. Opened on its own, the
// page shows what's in it. Import reads the data block, the same one a family page has.

export type Photo = { mime: PhotoMime; data: string }

export type PersonAnswers = {
  /** Set for someone who came from the link, so the review can match them by id */
  id?: string
  first: string
  middle?: string
  last?: string
  birthSurname?: string
  nickname?: string
  gender?: Gender
  birth?: PartialDate
  birthPlace?: string
  livesIn?: string
  deceased?: boolean
  deathYear?: number
  notes?: string
  photo?: Photo
}

export type ChildAnswers = PersonAnswers & { kind?: ChildKind }
export type FamilyAnswers = { partner?: PersonAnswers; status?: FamilyStatus; start?: PartialDate; children: ChildAnswers[] }
export type Answers = { me: PersonAnswers; families: FamilyAnswers[] }

const STARTED: Record<FamilyStatus, string> = {
  married: 'Married',
  partners: 'Together',
  engaged: 'Engaged',
  divorced: 'Married',
  separated: 'Together',
  widowed: 'Married',
}

/** The reply for a link: the people from it keep their ids, and everyone new gets one */
export function buildReply(link: AskLink, answers: Answers, now = new Date()): ExportedTree {
  const t = now.toISOString()
  const fromLink = new Set([link.person.id, ...link.families.flatMap((f) => [f.partner?.id, ...f.children.map((c) => c.id)])].filter(Boolean))
  const people: Record<string, Person> = {}
  const photos: NonNullable<ExportedTree['photos']> = {}
  const known: string[] = []

  const add = (a: PersonAnswers, forced?: string) => {
    const id = forced ?? (a.id && fromLink.has(a.id) && !people[a.id] ? a.id : nanoid(10))
    if (fromLink.has(id)) known.push(id)
    const birth = a.birth || a.birthPlace ? { ...(a.birth ? { date: a.birth } : {}), ...(a.birthPlace ? { place: a.birthPlace } : {}) } : undefined
    const p: Person = {
      id,
      firstName: a.first,
      middleName: a.middle,
      lastName: a.last,
      birthSurname: a.birthSurname,
      nickname: a.nickname,
      gender: a.gender && a.gender !== 'unknown' ? a.gender : undefined,
      birth,
      death: a.deceased && a.deathYear ? { date: { year: a.deathYear } } : undefined,
      deceased: a.deceased || undefined,
      livesIn: a.deceased ? undefined : a.livesIn,
      notes: a.notes,
      createdAt: t,
      updatedAt: t,
    }
    if (a.photo) {
      const photoId = `ph_${nanoid(10)}`
      photos[photoId] = a.photo
      p.photoId = photoId
    }
    for (const k of Object.keys(p) as (keyof Person)[]) if (p[k] === undefined || p[k] === '') delete p[k]
    people[id] = p
    return id
  }

  const me = add(answers.me, link.person.id)
  const families: Record<string, Family> = {}
  for (const f of answers.families) {
    const partner = f.partner ? add(f.partner) : undefined
    const children = f.children.map((c) => ({ personId: add(c), kind: c.kind ?? 'biological' }))
    if (!partner && !children.length) continue
    const fam: Family = { id: `f_${nanoid(10)}`, partnerIds: partner ? [me, partner] : [me], children }
    if (partner && f.status) fam.status = f.status
    if (partner && f.start) fam.start = f.start
    families[fam.id] = fam
  }

  const title = link.tree.title || 'the family tree'
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `reply-${nanoid(10)}`,
    title: `${answers.me.first}'s details for ${title}`,
    titleAuto: false,
    showStats: false,
    homePersonId: null,
    reply: { treeId: link.tree.id, treeTitle: link.tree.title, forId: me, known, sentAt: t },
    people,
    families,
    view: emptyView(),
    meta: { createdAt: t, updatedAt: t, app: 'jangal' },
    ...(Object.keys(photos).length ? { photos } : {}),
  }
}

/** "kareena-kapoor-khan-reply.html", or "reply.html" for a name with no Latin letters */
export function replyFileName(tree: ExportedTree): string {
  const me = tree.reply ? tree.people[tree.reply.forId] : undefined
  const slug = (me ? fullName(me) : '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug ? `${slug}-` : ''}reply.html`
}

const LEAF =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" fill="#d9efe0"/><g transform="rotate(38 32 34)"><path d="M32 47V57" stroke="#1b9a56" stroke-width="2.8" stroke-linecap="round"/><path fill="#1b9a56" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z"/></g></svg>'

/** One line about someone: when and where they were born, and where they live */
function about(p: Person, role: string): string {
  const born = [formatDate(p.birth?.date, true) && `born ${formatDate(p.birth?.date, true)}`, p.birth?.place && `in ${p.birth.place}`].filter(Boolean).join(' ')
  return [role, born, p.livesIn && `lives in ${p.livesIn}`, p.deceased && 'has passed away'].filter(Boolean).join(' · ')
}

/** The reply as a page: readable on its own, with the data for Jangal inside it */
export function replyHtml(tree: ExportedTree): string {
  const me = tree.reply?.forId ?? ''
  const rows: [Person, string][] = []
  const seen = new Set<string>()
  const push = (id: string, role: string) => {
    if (seen.has(id) || !tree.people[id]) return
    seen.add(id)
    rows.push([tree.people[id], role])
  }
  push(me, '')
  for (const f of Object.values(tree.families)) {
    const partner = f.partnerIds.find((x) => x !== me)
    const since = f.start ? ` since ${formatDate(f.start, true)}` : ''
    if (partner) push(partner, f.status ? `${STARTED[f.status]}${since}${['divorced', 'separated', 'widowed'].includes(f.status) ? ` (${f.status})` : ''}` : 'Partner')
    for (const c of f.children) push(c.personId, c.kind === 'adopted' ? 'Adopted child' : c.kind === 'step' ? 'Stepchild' : 'Child')
  }
  const pic = (p: Person) => {
    const ph = p.photoId ? tree.photos?.[p.photoId] : undefined
    return ph ? `<img src="data:${escapeHtml(ph.mime)};base64,${escapeHtml(ph.data)}" alt="">` : LEAF
  }
  const list = rows
    .map(([p, role]) => `<li>${pic(p)}<span><b>${escapeHtml(fullName(p))}</b><small>${escapeHtml(about(p, role)) || '&nbsp;'}</small></span></li>`)
    .join('')
  const sent = tree.reply?.sentAt ? new Date(tree.reply.sentAt) : null
  const when = sent && !Number.isNaN(sent.getTime()) ? `Sent ${sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. ` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="robots" content="noindex">
<title>${escapeHtml(tree.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#eff7f1;--tile:#fdfffd;--ink:#0b3320;--ink2:#3e6550;--mint:#e4f6ea}
@media (prefers-color-scheme:dark){:root{--bg:#24211c;--tile:#3a3f35;--ink:#efe6da;--ink2:#d3c5b5;--mint:#454a3f}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:28px 16px 48px}
h1{margin:0 0 6px;font-size:26px;line-height:1.15}
p{margin:0 0 18px;color:var(--ink2)}
ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
li{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:16px;background:var(--mint)}
li img,li svg{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none}
b{display:block;font-size:17px}
small{display:block;color:var(--ink2);font-size:14px}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(tree.title)}</h1>
<p>${when}To add them to the family tree, open Jangal, choose Import, and drop this file in.</p>
<ul>${list}</ul>
</main>
<script type="application/json" id="jangal-data">${embedJson(treeToJson(tree))}</script>
</body>
</html>
`
}
