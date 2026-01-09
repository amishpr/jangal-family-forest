import type { ChildKind, Family, FamilyStatus, Gender, Person, TreeDoc } from '../../src/core/model'
import { SCHEMA_VERSION, emptyView } from '../../src/core/model'

// The Alvarez and Raman family: the app's first sample family (PLAN X-2), now a test fixture. It's
// fictional, the same 23 people across 5 generations as the mockups, with a divorce, an adoption,
// and people who have died. Many kinship, layout and edit tests are written against it.

type Row = [
  id: string,
  first: string,
  last: string,
  gender: Gender,
  birth: [y: number, m: number, d: number, place: string],
  extra?: { birthSurname?: string; genderOther?: string; death?: [number, number, number, string]; notes?: string },
]

const ROWS: Row[] = [
  ['esteban', 'Esteban', 'Alvarez', 'male', [1911, 3, 2, 'Sevilla, Spain'], { death: [1979, 11, 20, 'San Antonio, Texas'], notes: 'Carpenter. Built the dining table the family still eats at.' }],
  ['carmen', 'Carmen', 'Alvarez', 'female', [1914, 7, 19, 'Sevilla, Spain'], { birthSurname: 'Ruiz', death: [1992, 1, 8, 'San Antonio, Texas'], notes: 'Her tamale recipe is the one Helen still makes every Christmas Eve.' }],
  ['tomas', 'Tomás', 'Alvarez', 'male', [1943, 5, 14, 'Sevilla, Spain'], { death: [2015, 2, 3, 'San Antonio, Texas'], notes: 'Moved to San Antonio in 1962. Ran Alvarez Hardware on Fredericksburg Road for 38 years.' }],
  ['helen', 'Helen', 'Alvarez', 'female', [1946, 10, 12, 'San Antonio, Texas'], { birthSurname: 'Whitfield', notes: 'Taught third grade for 31 years. Still hosts Sunday lunch for whoever shows up.' }],
  ['raghav', 'Raghav', 'Raman', 'male', [1941, 1, 23, 'Chennai, India'], { notes: 'Retired civil engineer. Plays chess in the park on Sundays and will tell you about every bridge he worked on.' }],
  ['lakshmi', 'Lakshmi', 'Raman', 'female', [1944, 8, 30, 'Madurai, India'], { birthSurname: 'Iyer', death: [2021, 6, 11, 'Houston, Texas'], notes: 'Carnatic singer. Her recordings are in the shared family folder.' }],
  ['marisol', 'Marisol', 'Kent', 'female', [1966, 4, 7, 'San Antonio, Texas'], { birthSurname: 'Alvarez', notes: 'Nurse at Saint Francis in Tulsa. Organizes the reunion every other summer.' }],
  ['owen', 'Owen', 'Kent', 'male', [1964, 12, 1, 'Tulsa, Oklahoma']],
  ['daniel', 'Daniel', 'Alvarez', 'male', [1968, 10, 3, 'San Antonio, Texas'], { notes: 'Took over the hardware store in 2001.' }],
  ['priya', 'Priya', 'Alvarez', 'female', [1970, 2, 18, 'Chennai, India'], { birthSurname: 'Raman', notes: 'Pediatrician. Met Daniel at UT Austin in 1991.' }],
  ['luis', 'Luis', 'Alvarez', 'male', [1974, 9, 30, 'San Antonio, Texas'], { notes: 'Plays bass in a wedding band on weekends.' }],
  ['rebecca', 'Rebecca', 'Moss', 'female', [1976, 6, 25, 'Denver, Colorado']],
  ['arjun', 'Arjun', 'Raman', 'male', [1973, 11, 9, 'Chennai, India']],
  ['chloe', 'Chloe', 'Raman', 'female', [1976, 10, 21, 'Portland, Oregon'], { birthSurname: 'Hart' }],
  ['iris', 'Iris', 'Kent', 'female', [1993, 7, 16, 'Tulsa, Oklahoma']],
  ['felix', 'Felix', 'Kent', 'male', [1997, 1, 29, 'Tulsa, Oklahoma']],
  ['maya', 'Maya', 'Alvarez', 'female', [1996, 10, 9, 'Austin, Texas'], { notes: 'Landscape architect. Started this tree in 2026.' }],
  ['sam', 'Sam', 'Whitaker', 'male', [1995, 3, 11, 'Boise, Idaho']],
  ['nico', 'Nico', 'Alvarez', 'other', [2000, 12, 24, 'Austin, Texas'], { genderOther: 'Nonbinary' }],
  ['theo', 'Theo', 'Alvarez', 'male', [2004, 5, 5, 'Denver, Colorado']],
  ['anika', 'Anika', 'Raman', 'female', [2005, 8, 2, 'Houston, Texas']],
  ['dev', 'Dev', 'Raman', 'male', [2009, 10, 28, 'Pune, India'], { notes: 'Adopted in 2011.' }],
  ['june', 'June', 'Whitaker', 'female', [2023, 10, 1, 'Austin, Texas']],
]

type FamRow = [id: string, partners: string[], status: FamilyStatus, start: number, children: (string | [string, ChildKind])[], end?: number]

const FAMILIES: FamRow[] = [
  ['f_esteban', ['esteban', 'carmen'], 'married', 1939, ['tomas']],
  ['f_tomas', ['tomas', 'helen'], 'married', 1965, ['marisol', 'daniel', 'luis']],
  ['f_raghav', ['raghav', 'lakshmi'], 'married', 1967, ['priya', 'arjun']],
  ['f_marisol', ['owen', 'marisol'], 'married', 1990, ['iris', 'felix']],
  ['f_daniel', ['daniel', 'priya'], 'married', 1994, ['maya', 'nico']],
  ['f_luis', ['luis', 'rebecca'], 'divorced', 2002, ['theo'], 2012],
  ['f_arjun', ['arjun', 'chloe'], 'married', 2003, ['anika', ['dev', 'adopted']]],
  ['f_maya', ['sam', 'maya'], 'married', 2021, ['june']],
]

const STAMP = '2026-01-01T00:00:00.000Z'

export function alvarezTree(id = 'sample'): TreeDoc {
  const people: Record<string, Person> = {}
  for (const [pid, firstName, lastName, gender, [y, m, d, place], extra = {}] of ROWS) {
    const p: Person = {
      id: pid,
      firstName,
      lastName,
      gender,
      birth: { date: { year: y, month: m, day: d }, place },
      createdAt: STAMP,
      updatedAt: STAMP,
    }
    if (extra.birthSurname) p.birthSurname = extra.birthSurname
    if (extra.genderOther) p.genderOther = extra.genderOther
    if (extra.death) {
      const [dy, dm, dd, dplace] = extra.death
      p.death = { date: { year: dy, month: dm, day: dd }, place: dplace }
      p.deceased = true
    }
    if (extra.notes) p.notes = extra.notes
    people[pid] = p
  }
  const families: Record<string, Family> = {}
  for (const [fid, partnerIds, status, start, children, end] of FAMILIES) {
    families[fid] = {
      id: fid,
      partnerIds,
      status,
      start: { year: start },
      ...(end ? { end: { year: end } } : {}),
      children: children.map((c) => (typeof c === 'string' ? { personId: c, kind: 'biological' } : { personId: c[0], kind: c[1] })),
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: 'The Alvarez & Raman Family',
    titleAuto: true,
    subtitle: 'From Sevilla and Chennai to Texas',
    showStats: true,
    homePersonId: 'maya',
    people,
    families,
    view: emptyView(),
    meta: { createdAt: STAMP, updatedAt: STAMP, app: 'jangal' },
  }
}

