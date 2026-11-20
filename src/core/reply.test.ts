import { describe, expect, it } from 'vitest'
import type { AskLink } from './askLink'
import { checkTree, readTreeText } from './importTree'
import { buildReply, replyFileName, replyHtml, type Answers } from './reply'
import { extractFromHtml } from './treeFile'

// A relative's reply (SHARE.md SH-11)

const link: AskLink = {
  v: 1,
  tree: { id: 'tree1', title: 'The Kapoor Family' },
  from: { name: 'Ranbir' },
  person: { id: 'kareena', first: 'Kareena', last: 'Kapoor Khan' },
  families: [{ partner: { id: 'saif', first: 'Saif Ali', last: 'Khan' }, status: 'married', children: [] }],
}

const answers = (): Answers => ({
  me: { id: 'kareena', first: 'Kareena', last: 'Kapoor Khan', gender: 'female', birth: { year: 1980, month: 9, day: 21 }, birthPlace: 'Mumbai', livesIn: 'Mumbai', photo: { mime: 'image/webp', data: 'UklGRg==' } },
  families: [
    {
      partner: { id: 'saif', first: 'Saif', last: 'Khan', gender: 'male' },
      status: 'married',
      start: { year: 2012, month: 10, day: 16 },
      children: [
        { first: 'Taimur', last: 'Ali Khan', birth: { year: 2016 } },
        { first: 'Jeh', last: 'Ali Khan', kind: 'adopted' },
      ],
    },
  ],
})

describe('the reply', () => {
  it('keeps the ids from the link, gives new people new ones, and links the family', () => {
    const tree = buildReply(link, answers(), new Date('2026-11-19T10:00:00Z'))
    expect(tree.reply).toEqual({ treeId: 'tree1', treeTitle: 'The Kapoor Family', forId: 'kareena', known: ['kareena', 'saif'], sentAt: '2026-11-19T10:00:00.000Z' })
    expect(Object.keys(tree.people)).toHaveLength(4)
    expect(tree.people.kareena).toMatchObject({ firstName: 'Kareena', birth: { date: { year: 1980, month: 9, day: 21 }, place: 'Mumbai' }, livesIn: 'Mumbai' })
    expect(tree.photos?.[tree.people.kareena.photoId!]).toEqual({ mime: 'image/webp', data: 'UklGRg==' })
    const [fam] = Object.values(tree.families)
    expect(fam).toMatchObject({ partnerIds: ['kareena', 'saif'], status: 'married', start: { year: 2012, month: 10, day: 16 } })
    expect(fam.children.map((c) => [tree.people[c.personId].firstName, c.kind])).toEqual([
      ['Taimur', 'biological'],
      ['Jeh', 'adopted'],
    ])
  })

  it('ignores an id the link didn’t carry, so a reply can’t claim someone else', () => {
    const a = answers()
    a.families[0].children[0].id = 'ranbir'
    const tree = buildReply(link, a)
    expect(tree.people.ranbir).toBeUndefined()
    expect(tree.reply?.known).toEqual(['kareena', 'saif'])
  })

  it('passes the same checks as any import, and comes back out of its page whole', () => {
    const tree = buildReply(link, answers())
    const checked = checkTree(tree, 'json')
    if (!checked.ok) throw new Error(checked.error)
    expect(checked.tree.reply).toEqual(tree.reply)
    const html = replyHtml(tree)
    const read = readTreeText(html, replyFileName(tree))
    if (!read.ok) throw new Error(read.error)
    expect(read.source).toBe('html')
    expect(read.tree.reply?.forId).toBe('kareena')
    expect(read.people).toBe(4)
    expect(read.photos).toBe(1)
    expect(replyFileName(tree)).toBe('kareena-kapoor-khan-reply.html')
  })

  it('writes names and notes as text, never as markup', () => {
    const a = answers()
    a.me.first = '</script><img src=x onerror=alert(1)>'
    a.me.notes = '<b>hi</b>'
    const html = replyHtml(buildReply(link, a))
    expect(html).not.toContain('<img src=x')
    expect(html.match(/<\/script>/g)).toHaveLength(1)
    expect(JSON.parse(extractFromHtml(html)!).people.kareena.firstName).toBe(a.me.first)
    // No scripts run in it at all
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/<script(?![^>]*application\/json)/)
  })

  it('names the file after the person, or plainly when the name has no Latin letters', () => {
    const a = answers()
    a.me.first = 'કરીના'
    a.me.last = undefined
    expect(replyFileName(buildReply(link, a))).toBe('reply.html')
  })
})
