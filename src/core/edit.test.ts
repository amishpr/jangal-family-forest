import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { build } from '../../tests/fixtures/build'
import { singleParent } from '../../tests/fixtures/families'
import { addRelative, deletePreview, guessGender, linkExisting, removePerson, resetChildOrder, setChildOrder, setParentOf, updatePerson } from './edit'
import { indexOf } from './index'
import { relation } from './kinship'
import type { TreeDoc } from './model'
import { alvarezTree } from '../../tests/fixtures/alvarez'

const run = (doc: TreeDoc, fn: (d: TreeDoc) => unknown) => {
  let out: unknown
  const next = produce(doc, (d) => {
    out = fn(d)
  })
  return { doc: next, out: out as ReturnType<typeof addRelative> }
}

describe('adding relatives', () => {
  it('adds a second parent to an existing birth family', () => {
    const base = alvarezTree()
    delete base.people.lakshmi
    base.families.f_raghav.partnerIds = ['raghav']
    const { doc, out } = run(base, (d) => addRelative(d, 'priya', 'parent'))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(doc.families.f_raghav.partnerIds).toEqual(['raghav', out.id])
    expect(doc.people[out.id].lastName).toBe('Alvarez')
  })

  it('refuses a third parent', () => {
    const { out } = run(alvarezTree(), (d) => addRelative(d, 'maya', 'parent'))
    expect(out).toEqual({ ok: false, reason: 'Maya already has two parents' })
  })

  it('makes a birth family for someone who has none', () => {
    const { doc, out } = run(alvarezTree(), (d) => addRelative(d, 'sam', 'parent'))
    if (!out.ok) throw new Error(out.reason)
    const ix = indexOf(doc)
    expect(ix.parentsOf('sam')).toEqual([out.id])
    expect(relation(ix, 'maya', out.id).label).toBe('parent-in-law')
  })

  it('adds a partner as a new partnership', () => {
    const { doc, out } = run(alvarezTree(), (d) => addRelative(d, 'felix', 'partner'))
    if (!out.ok) throw new Error(out.reason)
    expect(indexOf(doc).partnersOf('felix')).toEqual([out.id])
  })

  it('adds a child to the newest family by default, or a chosen one', () => {
    const { doc, out } = run(alvarezTree(), (d) => addRelative(d, 'maya', 'child'))
    if (!out.ok) throw new Error(out.reason)
    expect(doc.families.f_maya.children.map((c) => c.personId)).toContain(out.id)
    expect(relation(indexOf(doc), 'june', out.id).label).toBe('sibling')

    const solo = run(alvarezTree(), (d) => addRelative(d, 'luis', 'child', { familyId: 'solo', kind: 'adopted' }))
    if (!solo.out.ok) throw new Error(solo.out.reason)
    const ix = indexOf(solo.doc)
    expect(ix.parentsOf(solo.out.id)).toEqual(['luis'])
    expect(relation(ix, 'theo', solo.out.id).label).toBe('half sibling')
  })

  it('groups a new sibling with someone whose parents are unknown', () => {
    const { doc, out } = run(alvarezTree(), (d) => addRelative(d, 'sam', 'sibling'))
    if (!out.ok) throw new Error(out.reason)
    const ix = indexOf(doc)
    expect(ix.parentsOf('sam')).toEqual([])
    expect(relation(ix, 'sam', out.id).label).toBe('sibling')
    expect(relation(ix, 'maya', out.id).label).toBe('sibling-in-law')
  })

  it('adds a half sibling through one shared parent', () => {
    const { doc, out } = run(alvarezTree(), (d) => addRelative(d, 'maya', 'sibling', { halfWith: 'daniel' }))
    if (!out.ok) throw new Error(out.reason)
    expect(relation(indexOf(doc), 'nico', out.id).label).toBe('half sibling')
  })
})

describe('linking people already in the tree', () => {
  it('links partners and refuses duplicates', () => {
    const first = run(alvarezTree(), (d) => linkExisting(d, 'felix', 'partner', 'anika'))
    expect(first.out.ok).toBe(true)
    const again = run(first.doc, (d) => linkExisting(d, 'anika', 'partner', 'felix'))
    expect(again.out).toEqual({ ok: false, reason: 'Anika and Felix are already partners' })
  })

  it('blocks someone becoming their own ancestor', () => {
    const { out } = run(alvarezTree(), (d) => linkExisting(d, 'maya', 'parent', 'june'))
    expect(out).toEqual({ ok: false, reason: 'June is already a descendant of Maya' })
  })

  it('joins someone without parents to a sibling’s family', () => {
    const { doc, out } = run(alvarezTree(), (d) => linkExisting(d, 'maya', 'sibling', 'sam'))
    expect(out.ok).toBe(true)
    expect(indexOf(doc).parentsOf('sam')).toEqual(['daniel', 'priya'])
  })
})

describe('partners of a single parent', () => {
  // Sol is the only parent recorded for Tia and Uri, and Tia is the only parent of Kai
  const family = () => build('sol:m tia:f uri:m kai:m', [[['sol'], ['tia', 'uri']], [['tia'], ['kai']]], 'kai')

  it('become the children’s other parent, and their grandparent a level down', () => {
    const { doc, out } = run(family(), (d) => addRelative(d, 'sol', 'partner', { fields: { gender: 'female' } }))
    if (!out.ok) throw new Error(out.reason)
    const ix = indexOf(doc)
    expect(relation(ix, 'tia', out.id).label).toBe('mother')
    expect(relation(ix, 'kai', out.id).label).toBe('grandmother')
    expect(relation(ix, 'tia', 'uri').label).toBe('brother')
    expect(relation(ix, 'sol', out.id).label).toBe('wife')
  })

  it('start a new marriage, not the one left behind by a former partner', () => {
    const base = build('sol:m ex:f tia:f', [[['sol', 'ex'], ['tia'], 'divorced']])
    base.families.f1.end = { year: 2010 }
    const { doc, out } = run(
      produce(base, (d) => void removePerson(d, 'ex')),
      (d) => addRelative(d, 'sol', 'partner', { fields: { gender: 'female' } }),
    )
    if (!out.ok) throw new Error(out.reason)
    expect(doc.families.f1).toMatchObject({ partnerIds: ['sol', out.id], status: 'married' })
    expect(doc.families.f1.end).toBeUndefined()
    const step = run(doc, (d) => setParentOf(d, 'f1', out.id, 'tia', false))
    expect(relation(indexOf(step.doc), 'tia', out.id).label).toBe('stepmother')
  })

  it('stay step parents when the children already have two parents', () => {
    const base = build('dad:m mum:f kid:f', [[['dad', 'mum'], ['kid']]])
    const { doc, out } = run(base, (d) => addRelative(d, 'dad', 'partner', { fields: { gender: 'female' } }))
    if (!out.ok) throw new Error(out.reason)
    expect(relation(indexOf(doc), 'kid', out.id).label).toBe('stepmother')
  })

  it('can be made a step parent from the edit card, and back again', () => {
    const added = run(family(), (d) => addRelative(d, 'sol', 'partner', { fields: { gender: 'female' } }))
    if (!added.out.ok) throw new Error(added.out.reason)
    const mum = added.out.id
    const step = run(added.doc, (d) => setParentOf(d, 'f1', mum, 'tia', false))
    expect(step.out.ok).toBe(true)
    let ix = indexOf(step.doc)
    expect(relation(ix, 'tia', mum).label).toBe('stepmother')
    expect(relation(ix, 'uri', mum).label).toBe('mother')
    expect(relation(ix, 'tia', 'uri').label).toBe('half brother')
    const back = run(step.doc, (d) => setParentOf(d, 'f1', mum, 'tia', true))
    ix = indexOf(back.doc)
    expect(relation(ix, 'tia', mum).label).toBe('mother')
    // The single parent family it left empty is gone
    expect(Object.values(back.doc.families).filter((f) => f.partnerIds.length === 1)).toEqual([
      expect.objectContaining({ partnerIds: ['tia'] }),
    ])
  })

  it('can make them a parent of a child from any of their partner’s single parent families', () => {
    // An import can leave Sol with two single parent families
    const base = build('sol:m val:f tia:f uri:m', [[['sol', 'val'], []], [['sol'], ['tia']], [['sol'], ['uri']]])
    const { doc, out } = run(base, (d) => setParentOf(d, 'f1', 'val', 'uri', true))
    expect(out.ok).toBe(true)
    expect(relation(indexOf(doc), 'uri', 'val').label).toBe('mother')
    expect(doc.families.f3).toBeUndefined()
  })

  it('refuses to make someone a parent of their own ancestor', () => {
    // Gma is Sol's child from before and Val's mother, and Val is Sol's partner
    const base = build('sol:m val:f gma:f', [[['sol', 'val'], []], [['sol'], ['gma']], [['gma'], ['val']]])
    const { doc, out } = run(base, (d) => setParentOf(d, 'f1', 'val', 'gma', true))
    expect(out).toEqual({ ok: false, reason: "Someone can't be their own ancestor" })
    expect(doc).toBe(base)
  })

  it('works the same when linking someone already in the tree, except for two single parents', () => {
    const one = run(build('sol:m tia:f val:f', [[['sol'], ['tia']]]), (d) => linkExisting(d, 'val', 'partner', 'sol'))
    expect(relation(indexOf(one.doc), 'tia', 'val').label).toBe('mother')
    const blended = build('sol:m tia:f val:f wes:m', [[['sol'], ['tia']], [['val'], ['wes']]])
    const two = run(blended, (d) => linkExisting(d, 'sol', 'partner', 'val'))
    const ix = indexOf(two.doc)
    expect(relation(ix, 'tia', 'val').label).toBe('stepmother')
    expect(relation(ix, 'wes', 'sol').label).toBe('stepfather')
  })
})

describe('linking siblings and parents safely', () => {
  const parentAndChild = () => build('dad:m kid:f', [[['dad'], ['kid']]])

  it('refuses to make a parent their child’s sibling, either way round', () => {
    const reason = { ok: false, reason: "Kid and Dad can't be siblings: one is the other's parent or ancestor" }
    expect(run(parentAndChild(), (d) => linkExisting(d, 'kid', 'sibling', 'dad')).out).toEqual(reason)
    expect(run(parentAndChild(), (d) => linkExisting(d, 'dad', 'sibling', 'kid')).out).toEqual({
      ...reason,
      reason: "Dad and Kid can't be siblings: one is the other's parent or ancestor",
    })
  })

  it('links a half sibling through the parent chosen', () => {
    const base = build('dad:m mum:f kid:f rosa:f', [[['dad', 'mum'], ['kid']]])
    const { doc, out } = run(base, (d) => linkExisting(d, 'kid', 'sibling', 'rosa', { halfWith: 'dad' }))
    expect(out.ok).toBe(true)
    expect(relation(indexOf(doc), 'kid', 'rosa').label).toBe('half sister')
  })

  it('links a parent into their single parent family, so the children are full siblings', () => {
    const base = build('mom:f ben:m ann:f', [[['mom'], ['ben']]])
    const { doc } = run(base, (d) => linkExisting(d, 'ann', 'parent', 'mom'))
    expect(relation(indexOf(doc), 'ben', 'ann').label).toBe('sister')
    expect(Object.keys(doc.families)).toEqual(['f1'])
  })
})

describe('guessing the gender of a new relative (TODO.md QA-2)', () => {
  it('guesses the other parent and the partner, and nothing else', () => {
    const ix = indexOf(build('mum:f kid:m sib:u solo:u pal:m', [[['mum'], ['kid', 'solo']], [[], ['sib']]]))
    const cases: [string, Parameters<typeof guessGender>[2], string | undefined][] = [
      ['kid', 'parent', 'male'], // his mother is recorded, so a second parent is guessed a man
      ['mum', 'partner', 'male'],
      ['kid', 'partner', 'female'],
      ['pal', 'partner', 'female'],
      ['sib', 'partner', undefined], // gender unknown: no guess
      ['sib', 'parent', undefined], // no parents yet: no guess
      ['kid', 'child', undefined],
      ['kid', 'sibling', undefined],
    ]
    for (const [id, type, want] of cases) expect(guessGender(ix, id, type), `${id} ${type}`).toBe(want)
  })

  it('makes no guess once both parents are there', () => {
    const ix = indexOf(build('a:m b:f kid:u', [[['a', 'b'], ['kid']]]))
    expect(guessGender(ix, 'kid', 'parent')).toBeUndefined()
  })
})

describe('removing people', () => {
  it('keeps the relatives and drops empty families', () => {
    const { doc } = run(singleParent(), (d) => removePerson(d, 'sol'))
    expect(Object.keys(doc.people)).toEqual(['tia', 'uri'])
    // Two children with no one left as a parent stay grouped as siblings
    expect(relation(indexOf(doc), 'tia', 'uri').label).toBe('brother')
  })

  it('switches to the neutral view when you remove yourself', () => {
    const { doc } = run(alvarezTree(), (d) => removePerson(d, 'maya'))
    expect(doc.homePersonId).toBeNull()
    expect(doc.families.f_maya.partnerIds).toEqual(['sam'])
  })

  it('says what will happen first', () => {
    const ix = indexOf(alvarezTree())
    expect(deletePreview(ix, 'marisol', 'maya')).toEqual(['Their 2 children will stay, connected to Owen Kent only.'])
    expect(deletePreview(ix, 'maya', 'maya')).toEqual([
      'June will stay, connected to Sam Whitaker only.',
      'You are marked as this person, so the tree will switch to the neutral view.',
    ])
  })
})

describe('updating someone', () => {
  it('sets fields and clears empty ones', () => {
    const { doc } = run(alvarezTree(), (d) => updatePerson(d, 'maya', { nickname: 'May', notes: '' }))
    expect(doc.people.maya.nickname).toBe('May')
    expect(doc.people.maya.notes).toBeUndefined()
    expect(doc.people.maya.updatedAt).not.toBe(alvarezTree().people.maya.updatedAt)
  })
})

describe('custom titles (TODO.md CT-4)', () => {
  it('takes away what a removed person called anyone', () => {
    const doc = build('a:m b:f c:f', [[['a', 'b'], ['c']]])
    doc.people.b.calledByFrom = { a: 'Jaan' }
    doc.people.c.calledByFrom = { a: 'Chinu', b: 'Beta' }
    const { doc: out } = run(doc, (d) => removePerson(d, 'a'))
    expect(out.people.b.calledByFrom).toBeUndefined()
    expect(out.people.c.calledByFrom).toEqual({ b: 'Beta' })
  })
})

describe('pets (TODO.md F14)', () => {
  const family = () => {
    const doc = build('ann:f bob:m kid:m dog:u', [[['ann', 'bob'], ['kid', 'dog']]])
    doc.people.dog.species = 'Dog'
    return doc
  }

  it('adds a pet to the owners’ family, without their surname', () => {
    const { doc, out } = run(family(), (d) => addRelative(d, 'ann', 'pet'))
    if (!out.ok) throw new Error(out.reason)
    expect(doc.people[out.id]).toMatchObject({ species: 'Pet' })
    expect(doc.people[out.id].lastName).toBeUndefined()
    expect(indexOf(doc).parentsOf(out.id).sort()).toEqual(['ann', 'bob'])
  })

  it('refuses relatives for a pet, and pets as anything but a pet', () => {
    expect(run(family(), (d) => addRelative(d, 'dog', 'child')).out.ok).toBe(false)
    expect(run(family(), (d) => linkExisting(d, 'kid', 'partner', 'dog')).out.ok).toBe(false)
    expect(run(family(), (d) => linkExisting(d, 'kid', 'pet', 'ann')).out.ok).toBe(false)
    const { doc, out } = run(build('kid:m dog:u', []), (d) => {
      d.people.dog.species = 'Dog'
      return linkExisting(d, 'kid', 'pet', 'dog')
    })
    expect(out.ok).toBe(true)
    expect(indexOf(doc).parentsOf('dog')).toEqual(['kid'])
  })
})

describe('the order of brothers and sisters (TODO.md F18)', () => {
  const family = () => build('mum:f dad:m a:m b:f c:m', [[['mum', 'dad'], ['a', 'b', 'c']]])
  const kids = (doc: TreeDoc) => doc.families.f1.children.map((c) => c.personId)

  it('puts the children in the order given, keeping anyone left out after them', () => {
    const { doc, out } = run(family(), (d) => setChildOrder(d, 'f1', ['c', 'a']))
    expect(out.ok).toBe(true)
    expect(kids(doc)).toEqual(['c', 'a', 'b'])
    expect(doc.families.f1.childOrder).toBe('set')
  })

  it('refuses someone who isn’t a child of the family, or the same child twice, and changes nothing', () => {
    const base = family()
    for (const ids of [['a', 'mum'], ['a', 'a'], ['zed']]) {
      const { doc, out } = run(base, (d) => setChildOrder(d, 'f1', ids))
      expect(out.ok).toBe(false)
      expect(doc).toBe(base)
    }
  })

  it('goes back to birth order', () => {
    const { doc } = run(family(), (d) => setChildOrder(d, 'f1', ['c', 'b', 'a']))
    const back = run(doc, (d) => resetChildOrder(d, 'f1'))
    expect(back.out.ok).toBe(true)
    expect(back.doc.families.f1.childOrder).toBeUndefined()
    expect(run(back.doc, (d) => resetChildOrder(d, 'f1')).out.ok).toBe(false)
  })
})
