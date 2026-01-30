import { describe, expect, it } from 'vitest'
import { migrate, MigrationError } from './migrate'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { repairTree, TreeFileSchema } from './schema'

const load = (raw: unknown) => repairTree(TreeFileSchema.parse(migrate(raw)))

describe('reading tree files', () => {
  it('round trips the sample tree unchanged', () => {
    const doc = alvarezTree()
    const { doc: back, warnings } = load(JSON.parse(JSON.stringify(doc)))
    expect(warnings).toEqual([])
    expect(back).toEqual(doc)
  })

  it('drops unknown fields and forgives small mistakes', () => {
    const raw = JSON.parse(JSON.stringify(alvarezTree()))
    raw.people.maya.favoriteColor = 'green'
    raw.people.maya.gender = 'robot'
    raw.people.iris.birth.date.month = 13
    const { doc } = load(raw)
    expect('favoriteColor' in doc.people.maya).toBe(false)
    expect(doc.people.maya.gender).toBe('unknown')
    expect(doc.people.iris.birth?.date).toEqual({ year: 1993, day: 16 })
  })

  it('caps custom titles, and drops words from people who aren’t in the file (TODO.md CT-4)', () => {
    const raw = JSON.parse(JSON.stringify(alvarezTree()))
    raw.people.maya.calledBy = 'x'.repeat(60)
    raw.people.maya.calledByFrom = { iris: 'Mayu', ghost: 'Boo', helen: '  ' }
    const { doc } = load(raw)
    expect(doc.people.maya.calledBy).toHaveLength(40)
    expect(doc.people.maya.calledByFrom).toEqual({ iris: 'Mayu' })
  })

  it('keeps the order a family set for its children (TODO.md F18)', () => {
    const raw = JSON.parse(JSON.stringify(alvarezTree()))
    raw.families.f_tomas.childOrder = 'set'
    raw.families.f_daniel.childOrder = 'sorted'
    const { doc } = load(raw)
    expect(doc.families.f_tomas.childOrder).toBe('set')
    expect(doc.families.f_daniel.childOrder).toBeUndefined()
  })

  it('keeps a pet out of partnerships, parenthood and being you (TODO.md F14)', () => {
    const raw = JSON.parse(JSON.stringify(alvarezTree()))
    raw.people.tomas.species = 'Dog'
    raw.people.iris.species = 'Cat'
    raw.homePersonId = 'iris'
    const { doc, warnings } = load(raw)
    expect(doc.people.tomas.species).toBeUndefined()
    expect(doc.people.iris.species).toBe('Cat')
    expect(doc.homePersonId).toBeNull()
    expect(warnings).toHaveLength(2)
  })

  it('cuts text over its cap short instead of dropping it', () => {
    const raw = JSON.parse(JSON.stringify(alvarezTree()))
    raw.people.maya.notes = 'x'.repeat(25_000)
    raw.people.maya.firstName = 'M'.repeat(130)
    const { doc } = load(raw)
    expect(doc.people.maya.notes).toHaveLength(20_000)
    expect(doc.people.maya.firstName).toHaveLength(120)
  })

  it('drops links to people who are not in the file, with a warning for each', () => {
    const raw = JSON.parse(JSON.stringify(alvarezTree()))
    raw.families.f_maya.children.push({ personId: 'ghost', kind: 'biological' })
    raw.homePersonId = 'nobody'
    const { doc, warnings } = load(raw)
    expect(doc.families.f_maya.children.map((c) => c.personId)).toEqual(['june'])
    expect(doc.homePersonId).toBeNull()
    expect(warnings).toHaveLength(2)
  })

  it('rejects photos that are not image data', () => {
    const raw = { ...JSON.parse(JSON.stringify(alvarezTree())), photos: { x: { mime: 'text/html', data: 'PGI+' } } }
    expect(TreeFileSchema.safeParse(migrate(raw)).success).toBe(true) // bad photos are dropped, not fatal
    expect(TreeFileSchema.parse(migrate(raw)).photos).toBeUndefined()
  })

  it('refuses files from a newer version, or that are not trees', () => {
    expect(() => migrate({ schemaVersion: 99 })).toThrow(MigrationError)
    expect(() => migrate([1, 2, 3])).toThrow("This file doesn't contain a family tree")
    expect(() => migrate({ hello: 'world' })).toThrow("This file doesn't look like a Jangal backup")
  })

  it('reads the prototype format the mockups exported', () => {
    const mock = {
      schemaVersion: 1,
      app: 'jangal-mockup',
      title: 'The Alvarez Family',
      titleAuto: false,
      homePersonId: 'maya',
      people: {
        maya: { id: 'maya', first: 'Maya', last: 'Alvarez', gender: 'f', birth: { y: 1996, m: 10, d: 9, place: 'Austin, Texas' } },
        dev: { id: 'dev', first: 'Dev', gender: 'm', birth: { y: 2009 } },
      },
      families: { f1: { id: 'f1', partners: ['maya'], children: [{ id: 'dev', kind: 'adopted' }] } },
      photos: { maya: 'data:image/jpeg;base64,/9j/AAAA' },
    }
    const { doc } = load(mock)
    expect(doc.people.maya).toMatchObject({ firstName: 'Maya', lastName: 'Alvarez', gender: 'female', photoId: 'ph_maya' })
    expect(doc.people.maya.birth).toEqual({ date: { year: 1996, month: 10, day: 9 }, place: 'Austin, Texas' })
    expect(doc.families.f1.children).toEqual([{ personId: 'dev', kind: 'adopted' }])
    expect(doc.photos?.ph_maya).toEqual({ mime: 'image/jpeg', data: '/9j/AAAA' })
  })
})
