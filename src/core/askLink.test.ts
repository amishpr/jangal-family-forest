import { describe, expect, it } from 'vitest'
import { build } from '../../tests/fixtures/build'
import { askLinkFor, askUrl, decodeAskLink, encodeAskLink, type AskLink } from './askLink'
import { indexOf } from './index'

// The fill-in link (SHARE.md SH-3)

const tree = () => {
  const doc = build('kareena:f saif:m amrita:f sara:f dog:u', [[['saif', 'kareena'], ['dog'], 'married'], [['saif', 'amrita'], ['sara'], 'divorced']])
  doc.people.kareena.firstName = 'કરીના'
  doc.people.dog.species = 'Dog'
  return doc
}

describe('the fill-in link', () => {
  it('holds names only: the person, their partners and children, pets left out', () => {
    const link = askLinkFor(indexOf(tree()), { id: 'tree1', title: 'The Kapoor Family' }, 'saif', { name: ' Ranbir ', email: '' })
    expect(link).toEqual({
      v: 1,
      tree: { id: 'tree1', title: 'The Kapoor Family' },
      from: { name: 'Ranbir' },
      person: { id: 'saif', first: 'Saif', last: 'Test' },
      families: [
        { partner: { id: 'kareena', first: 'કરીના', last: 'Test' }, status: 'married', children: [] },
        { partner: { id: 'amrita', first: 'Amrita', last: 'Test' }, status: 'divorced', children: [{ id: 'sara', first: 'Sara', last: 'Test' }] },
      ],
    })
    expect(JSON.stringify(link)).not.toMatch(/birth|notes|photo/)
  })

  it('comes back the same from the address, deflated, Gujarati names included', async () => {
    const link = askLinkFor(indexOf(tree()), { id: 'tree1', title: 'The Kapoor Family' }, 'kareena', { name: 'Ranbir', email: 'r@example.com' })
    const url = await askUrl(link, 'https://jangal.example', '/')
    expect(url).toMatch(/^https:\/\/jangal\.example\/add\/#z=[\w-]+$/)
    expect(await decodeAskLink(new URL(url).hash)).toEqual(link)
    // Shorter than the link as it was, so it looks less like spam
    expect(new URL(url).hash.length).toBeLessThan(encodeAskLink(link).length * 0.8)
    // Links sent before they were deflated still open
    expect(await decodeAskLink(`#a=${encodeAskLink(link)}`)).toEqual(link)
  })

  it('reads nothing from a link that is cut off, made up, or the wrong shape', async () => {
    const link = askLinkFor(indexOf(tree()), { id: 'tree1', title: 'T' }, 'kareena', { name: 'Ranbir' })
    const good = encodeAskLink(link)
    const zipped = new URL(await askUrl(link, 'https://jangal.example')).hash
    expect(await decodeAskLink('')).toBeNull()
    expect(await decodeAskLink('#a=')).toBeNull()
    expect(await decodeAskLink(`#a=${good.slice(0, -12)}`)).toBeNull()
    expect(await decodeAskLink(zipped.slice(0, -12))).toBeNull()
    expect(await decodeAskLink('#a=bm90IGpzb24')).toBeNull()
    expect(await decodeAskLink('#z=bm90IGpzb24')).toBeNull()
    const enc = (o: unknown) => `#a=${encodeAskLink(o as AskLink)}`
    expect(await decodeAskLink(enc({ v: 2, tree: { id: 't' }, from: { name: 'R' }, person: { id: 'p', first: 'P' }, families: [] }))).toBeNull()
    expect(await decodeAskLink(enc({ v: 1, tree: { id: 't' }, from: { name: 'R' }, person: { id: '../x', first: 'P' }, families: [] }))).toBeNull()
  })

  it('keeps what it reads in bounds', async () => {
    const kids = Array.from({ length: 50 }, (_, i) => ({ id: `k${i}`, first: 'K'.repeat(500) }))
    const odd = { v: 1, tree: { id: 't', title: 7 }, from: { name: 'R', email: 'not an email' }, person: { id: 'p', first: 'P' }, families: [{ status: 'feuding', children: [...kids, { id: 'x' }, 'junk'] }] }
    const link = (await decodeAskLink(`#a=${encodeAskLink(odd as unknown as AskLink)}`))!
    expect(link.tree.title).toBe('')
    expect(link.from).toEqual({ name: 'R' })
    expect(link.families[0].status).toBeUndefined()
    expect(link.families[0].children).toHaveLength(30)
    expect(link.families[0].children[0].first).toHaveLength(120)
  })
})
