import type { ChildKind, FamilyStatus, Gender, Person, TreeDoc } from '../../src/core/model'
import { SCHEMA_VERSION, emptyView } from '../../src/core/model'

// A tiny way to write test families.
//   people: "ann:f bob:m kid:u"  (m male, f female, u unknown, o other)
//   families: [[partners], [children], status?, { childId: kind }?]

const G: Record<string, Gender> = { m: 'male', f: 'female', u: 'unknown', o: 'other' }

export type FamSpec = [partners: string[], children: string[], status?: FamilyStatus, kinds?: Record<string, ChildKind>]

export function build(people: string, families: FamSpec[], home: string | null = null, years: Record<string, number> = {}): TreeDoc {
  const t = '2026-01-01T00:00:00.000Z'
  const ps: Record<string, Person> = {}
  for (const tok of people.trim().split(/\s+/)) {
    const [id, g = 'u'] = tok.split(':')
    const first = id.charAt(0).toUpperCase() + id.slice(1)
    ps[id] = {
      id,
      firstName: first,
      lastName: 'Test',
      gender: G[g],
      ...(years[id] ? { birth: { date: { year: years[id] } } } : {}),
      createdAt: t,
      updatedAt: t,
    }
  }
  const fams: TreeDoc['families'] = {}
  families.forEach(([partnerIds, children, status, kinds = {}], i) => {
    const id = `f${i + 1}`
    fams[id] = {
      id,
      partnerIds,
      ...(status ? { status } : {}),
      children: children.map((c) => ({ personId: c, kind: kinds[c] ?? 'biological' })),
    }
  })
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'test',
    title: '',
    titleAuto: true,
    showStats: true,
    homePersonId: home,
    people: ps,
    families: fams,
    view: emptyView(),
    meta: { createdAt: t, updatedAt: t, app: 'jangal' },
  }
}
