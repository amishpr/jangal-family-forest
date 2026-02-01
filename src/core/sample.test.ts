import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { anchorId, visibleSets } from './collapse'
import { age } from './dates'
import { indexOf } from './index'
import { relation } from './kinship'
import { isLiving } from './model'
import { findPath } from './path'
import { sampleTree } from './sample'
import credits from './sampleCredits.json'
import { familyTitle, type Titles } from './titles'

// The Kapoor sample family (TODO.md F5)
const doc = sampleTree()
const ix = indexOf(doc)
const hi: Titles = { lang: 'hi', picks: {} }

describe('the sample family', () => {
  it('has 88 people, and every family points at people who exist', () => {
    expect(Object.keys(doc.people)).toHaveLength(88)
    for (const f of Object.values(doc.families)) {
      for (const id of [...f.partnerIds, ...f.children.map((c) => c.personId)]) expect(doc.people[id], `${f.id}: ${id}`).toBeDefined()
    }
    expect(doc.homePersonId).toBe('ranbir')
    expect(doc.title).toBe('The Kapoor Family')
  })

  it('has nobody under 18 (KP-2)', () => {
    for (const p of Object.values(doc.people)) {
      if (isLiving(p)) expect(age(p), p.id).toBeGreaterThanOrEqual(18)
    }
  })

  it('reads the way Ranbir would say it, in English and in Hindi', () => {
    const cases: [string, string, string | null][] = [
      ['raj', 'grandfather', 'Dada'],
      ['randhir', 'uncle', 'Tau'],
      ['rajiv', 'uncle', 'Chacha'],
      ['ritu', 'aunt', 'Bua'],
      ['riddhima', 'sister', 'Didi'],
      ['kareena', 'first cousin', 'Didi'],
      ['saif', "first cousin's husband", 'Jija'],
      ['sunjay', "first cousin's former husband", null],
      ['mahesh', 'father-in-law', 'Sasur'],
      ['prithviraj', 'great-grandfather', 'Pardada'],
    ]
    for (const [id, label, title] of cases) {
      expect(relation(ix, 'ranbir', id).label, id).toBe(label)
      expect(familyTitle(ix, 'ranbir', id, hi), id).toBe(title)
    }
  })

  it('finds the way from Ranbir to Amitabh Bachchan, through cousin Nikhil and his wife Shweta', () => {
    expect(findPath(ix, 'ranbir', 'amitabh')?.persons).toEqual(['ranbir', 'rishi', 'ritu', 'nikhil', 'shweta', 'amitabh'])
  })

  it('has a credited, freely licensed file for every photo it uses (KP-5)', () => {
    const withPhotos = Object.values(doc.people).filter((p) => p.photoId)
    expect(withPhotos.map((p) => p.id).sort()).toEqual(Object.keys(credits).sort())
    for (const [id, c] of Object.entries(credits)) {
      expect(c.author && c.source.startsWith('https://commons.wikimedia.org/'), id).toBeTruthy()
      expect(c.license, id).toMatch(/^(CC BY|CC0|Public domain|GODL-India)/)
      for (const f of [`${id}.webp`, `${id}-thumb.webp`]) expect(existsSync(`public/sample/${f}`), f).toBe(true)
    }
  })

  it('has the Bhatts and the Bachchans, seen from Alia and from Ranbir (TODO.md F11)', () => {
    const cases: [string, string, string][] = [
      ['alia', 'nanabhai', 'grandfather'],
      ['alia', 'pooja', 'half sister'],
      ['alia', 'kiran', 'stepmother'],
      ['alia', 'mohit', 'first cousin'],
      ['alia', 'emraan', 'second cousin'],
      ['ranbir', 'shaheen', 'sister-in-law'],
      ['shweta', 'harivansh', 'grandfather'],
      ['shweta', 'abhishek', 'brother'],
      ['shweta', 'naina', 'first cousin'],
    ]
    for (const [a, b, label] of cases) expect(relation(ix, a, b).label, `${a} > ${b}`).toBe(label)
    expect(familyTitle(ix, 'ranbir', 'pooja', hi)).toBe('Sali')
  })

  it('opens mostly tucked away: Ranbir’s line, with cousins and the Bhatts behind pills (KB-2, TODO.md F17)', () => {
    const shown = visibleSets(ix, anchorId(ix, doc.homePersonId), doc.view).persons
    expect(shown.size).toBe(24)
    for (const id of ['ranbir', 'alia', 'rishi', 'riddhima', 'randhir', 'ritu', 'shammi', 'shashi', 'basheshwarnath']) expect(shown.has(id), id).toBe(true)
    for (const id of ['kareena', 'nikhil', 'aadar', 'kunal', 'mahesh', 'nanabhai', 'shweta', 'harivansh']) expect(shown.has(id), id).toBe(false)
    // Opening a branch shows one more layer, not everyone behind it
    const ritu = visibleSets(ix, 'ranbir', { ...doc.view, collapsedFamilies: doc.view.collapsedFamilies.filter((f) => f !== 'f_ritu') }).persons
    for (const id of ['nikhil', 'shweta', 'navya', 'amitabh', 'abhishek']) expect(ritu.has(id), id).toBe(true)
    expect(ritu.has('harivansh')).toBe(false)
  })
})

