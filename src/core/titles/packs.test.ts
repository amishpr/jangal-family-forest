import { describe, expect, it } from 'vitest'
import { build } from '../../../tests/fixtures/build'
import { indexOf } from '../index'
import { BUILT_IN_PACKS, cleanPack, editPack, familyTitle, newPack, TITLE_GROUPS, TITLE_KEYS, titleLangs, type TitlePack } from '../titles'
import { packToCsv, packToJson, readPackFile, templatePack } from './packFile'

// Family title packs (TODO.md F4)

describe('title packs', () => {
  it('lists every relationship once in en.json, and the built-in packs pass their own checks', () => {
    const listed = TITLE_GROUPS.flatMap(([, t]) => Object.keys(t))
    expect([...listed].sort()).toEqual([...TITLE_KEYS].sort())
    expect(new Set(listed).size).toBe(listed.length)
    for (const p of Object.values(BUILT_IN_PACKS)) expect(cleanPack(p)).toEqual({ pack: p, dropped: [] })
  })

  it.each(['gu', 'hi'])('round trips the %s pack through CSV and JSON', (lang) => {
    const p = BUILT_IN_PACKS[lang]
    expect(readPackFile(packToCsv(p), 'x.csv')).toEqual({ ok: true, pack: p, dropped: [] })
    expect(readPackFile(packToJson(p), 'x.json')).toEqual({ ok: true, pack: p, dropped: [] })
  })

  it('reads a filled-in template, and says what it can’t use', () => {
    const blank = readPackFile(packToJson(templatePack(), true), 'template.json')
    expect(blank).toEqual({ ok: false, error: 'Add a language code, like mr for Marathi or ta for Tamil.' })
    const csv = packToCsv(templatePack())
      .replace('\r\nlang,"Language code', '\r\nlang,"Language code')
      .replace(/\r\nlang,([^\r]*?),+\r\n/, '\r\nlang,code,MR\r\n')
      .replace(/\r\nname,([^\r]*?),+\r\n/, '\r\nname,name,Marathi\r\n')
      .replace(/\r\nfather,Father,+\r\n/, '\r\nfather,Father,Baba,Aba\r\n')
    expect(readPackFile(csv, 'mr.csv')).toEqual({
      ok: true,
      pack: { format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi', words: { father: ['Baba', 'Aba'] } },
      dropped: [],
    })
  })

  it('refuses files that aren’t packs, and tidies the rest', () => {
    const base = { format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi' }
    expect(cleanPack({ ...base, format: 'other', words: { father: ['Baba'] } })).toEqual({ error: expect.stringContaining("isn't a family titles file") })
    expect(cleanPack({ ...base, version: 2, words: { father: ['Baba'] } })).toEqual({ error: expect.stringContaining('newer version') })
    expect(cleanPack({ ...base, lang: 'Marathi!', words: { father: ['Baba'] } })).toEqual({ error: expect.stringContaining('language code') })
    expect(cleanPack({ ...base, name: ' ', words: { father: ['Baba'] } })).toEqual({ error: expect.stringContaining("language's name") })
    expect(cleanPack({ ...base, words: { father: [], cousinOnce: ['X'] } })).toEqual({ error: expect.stringContaining('no words') })
    const r = cleanPack({ ...base, words: { father: 'Baba', mother: ['  Aai  ', 'Aai', 'x'.repeat(50), ...Array(20).fill(0).map((_, i) => `w${i}`)], uncleWife: ['Kaku'] } })
    if ('error' in r) throw new Error(r.error)
    expect(r.dropped).toEqual(['uncleWife'])
    expect(r.pack.words.father).toEqual(['Baba'])
    expect(r.pack.words.mother).toHaveLength(12)
    expect(r.pack.words.mother?.slice(0, 2)).toEqual(['Aai', 'x'.repeat(40)])
    expect(readPackFile('{"format":', 'x.json')).toEqual({ ok: false, error: expect.stringContaining("isn't valid JSON") })
  })

  it('puts a family’s own language on the tiles, and lists it', () => {
    const mr: TitlePack = { format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi', words: { father: ['Baba'], fatherSister: ['Atya'] } }
    const ix = indexOf(build('gp:m me:f dad:m aunt:f', [[['gp'], ['dad', 'aunt']], [['dad'], ['me']]]))
    const titles = { lang: 'mr', picks: {}, packs: { mr } }
    expect(familyTitle(ix, 'me', 'dad', titles)).toBe('Baba')
    expect(familyTitle(ix, 'me', 'aunt', titles)).toBe('Atya')
    expect(familyTitle(ix, 'me', 'gp', titles)).toBeNull() // no word: the English label stays
    expect(titleLangs({ packs: { mr } })).toEqual([['en', 'English'], ['gu', 'Gujarati'], ['hi', 'Hindi'], ['mr', 'Marathi']])
    // A pack for a built-in language replaces its words
    const gu: TitlePack = { ...mr, lang: 'gu', name: 'Gujarati (ours)' }
    expect(familyTitle(ix, 'me', 'dad', { lang: 'gu', picks: {}, packs: { gu } })).toBe('Baba')
    expect(titleLangs({ packs: { gu } })).toContainEqual(['gu', 'Gujarati (ours)'])
  })
})

describe('editing a pack (TODO.md F9)', () => {
  const gu = BUILT_IN_PACKS.gu
  const father = (p: TitlePack) => p.words.father

  it('adds, removes, moves and makes a word the usual one, leaving the built-in pack alone', () => {
    const added = editPack(gu, 'father', { add: '  Bapu  ' })
    expect(father(added)).toEqual([...father(gu)!, 'Bapu'])
    expect(father(editPack(added, 'father', { usual: 'Bapu' }))![0]).toBe('Bapu')
    expect(father(editPack(added, 'father', { move: 'Bapu', by: -1 })))!.toEqual([...father(gu)!.slice(0, -1), 'Bapu', father(gu)!.at(-1)])
    expect(father(editPack(added, 'father', { remove: 'Bapu' }))).toEqual(father(gu))
    expect(father(gu)).not.toContain('Bapu')
  })

  it('refuses a repeat, a 13th word, and moves off the end, and cuts a long word to 40 characters', () => {
    expect(editPack(gu, 'father', { add: father(gu)![0] })).toBe(gu)
    const full = { ...gu, words: { father: Array.from({ length: 12 }, (_, i) => `W${i}`) } }
    expect(editPack(full, 'father', { add: 'One more' })).toBe(full)
    expect(editPack(full, 'father', { move: 'W0', by: -1 })).toBe(full)
    expect(father(editPack(gu, 'father', { add: 'x'.repeat(41) }))!.at(-1)).toHaveLength(40)
  })

  it('keeps at least one word in a language', () => {
    const one = { ...gu, words: { father: ['Baba'] } }
    expect(editPack(one, 'father', { remove: 'Baba' })).toBe(one)
  })

  it('takes the last word away, and goes back to the built-in words', () => {
    let p = gu
    for (const w of father(gu)!) p = editPack(p, 'father', { remove: w })
    expect('father' in p.words).toBe(false)
    expect(father(editPack(p, 'father', { reset: true }))).toEqual(father(gu))
  })

  it('starts a new language blank or from a copy', () => {
    const mr = newPack('mr', 'Marathi', 'मराठी', BUILT_IN_PACKS.hi)
    expect(mr).toMatchObject({ lang: 'mr', name: 'Marathi', nativeName: 'मराठी', words: BUILT_IN_PACKS.hi.words })
    mr.words.father!.push('Aba Saheb')
    expect(BUILT_IN_PACKS.hi.words.father).not.toContain('Aba Saheb')
    expect(newPack('ta', 'Tamil').words).toEqual({})
  })
})
