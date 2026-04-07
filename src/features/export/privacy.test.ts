import { describe, expect, it } from 'vitest'
import { alvarezTree } from '../../../tests/fixtures/alvarez'
import { applyPrivacy } from './exportHtml'

// The family page's "Hide … of people who are living" (PLAN E-3), now with where they live (TODO.md F15)

describe('a family page that hides details of people who are living', () => {
  it('leaves out where they live, along with their birthdays, notes, traits and photos', () => {
    const tree = alvarezTree()
    tree.people.maya.livesIn = 'Austin, Texas'
    tree.people.maya.tags = ['Left-handed']
    const out = applyPrivacy(tree, { hideLiving: true, openAs: 'me', traits: true })
    expect(out.people.maya).toMatchObject({ birth: { date: { year: 1996 } } })
    for (const k of ['livesIn', 'notes', 'tags', 'photoId'] as const) expect(out.people.maya[k]).toBeUndefined()
    // People who have died keep their details, and the tree that's open isn't changed
    expect(out.people.esteban.notes).toBeTruthy()
    expect(tree.people.maya.livesIn).toBe('Austin, Texas')
  })
})
