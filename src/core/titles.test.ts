import { describe, expect, it } from 'vitest'
import { build } from '../../tests/fixtures/build'
import { indexOf } from './index'
import { customTitle, familyTitle, titleKey, TITLE_GROUPS, titleWords, type Titles } from './titles'

// One big family with birthdays, seen from Me (born 1990), from his wife Priya, and from the
// grandparents. Bapa1 and Bapa2 are Dad's older brothers, Kaka his younger one.
const ix = indexOf(
  build(
    `ggp:m dada:m dadi:f nana:m nani:f nanabro:m dad:m mom:f sm:f bapa1:m moti:f bapa2:m bapaw:f kaka:m kaki:f
     foi:f fua:m mama:m mami:f masi:f masa:m riya:f kunal:m me:m ravi:m komal:f sona:f vik:m arun:m neel:m
     tara:f cousin:m priya:f sasra:m sasu:f patla:f saali:f sadhu:m saalo:m saadh:f babo:m babi:f kid:u`,
    [
      [['ggp'], ['nana', 'nanabro']],
      [['dada', 'dadi'], ['bapa1', 'bapa2', 'dad', 'kaka', 'foi']],
      [['nana', 'nani'], ['mom', 'mama', 'masi']],
      [['dad', 'mom'], ['riya', 'me', 'ravi', 'sona', 'arun']],
      [['dad', 'sm'], [], 'married'],
      [['riya', 'kunal'], ['neel']],
      [['sona', 'vik'], []],
      [['ravi', 'komal'], ['tara']],
      [['kaka', 'kaki'], ['cousin']],
      [['bapa1', 'moti'], []],
      [['bapa2', 'bapaw'], []],
      [['foi', 'fua'], []],
      [['mama', 'mami'], []],
      [['masi', 'masa'], []],
      [['sasra', 'sasu'], ['patla', 'priya', 'saali', 'saalo']],
      [['me', 'priya'], ['babo', 'babi', 'kid']],
      [['saali', 'sadhu'], []],
      [['saalo', 'saadh'], []],
    ],
    'me',
    { dad: 1960, bapa1: 1950, bapa2: 1955, kaka: 1965, riya: 1985, me: 1990, ravi: 1995, sona: 1993, cousin: 1992, priya: 1991, patla: 1988, saali: 1994 },
  ),
)

const gu: Titles = { lang: 'gu', picks: {} }
const hi: Titles = { lang: 'hi', picks: {} }

describe('Gujarati titles', () => {
  it.each([
    ['me', 'dad', 'Pappa'],
    ['me', 'mom', 'Ba'],
    ['me', 'riya', 'Didi'],
    ['me', 'ravi', 'Bhaio'],
    ['me', 'sona', 'Ben'],
    ['me', 'arun', 'Bhai'], // no birthday: the everyday word
    ['me', 'cousin', 'Bhaio'], // a younger cousin is a younger brother
    ['me', 'kunal', 'Jijaji'],
    ['me', 'vik', 'Banevi'],
    ['me', 'komal', 'Bhabhi'],
    ['me', 'neel', 'Bhanej'],
    ['me', 'tara', 'Bhatriji'],
    ['me', 'dada', 'Dada'],
    ['me', 'dadi', 'Dadi'],
    ['me', 'bapa1', 'Mota Kaka'],
    ['me', 'moti', 'Mhoti'],
    ['me', 'bapa2', 'Bapa'],
    ['me', 'bapaw', 'Mhoti'],
    ['me', 'kaka', 'Kaka'],
    ['me', 'kaki', 'Kaki'],
    ['me', 'foi', 'Foi'],
    ['me', 'fua', 'Fua'],
    ['me', 'nana', 'Nanabapa'],
    ['me', 'nani', 'Nanima'],
    ['me', 'nanabro', 'Nana'],
    ['me', 'mama', 'Mama'],
    ['me', 'mami', 'Mami'],
    ['me', 'masi', 'Masi'],
    ['me', 'masa', 'Masa'],
    ['me', 'sasra', 'Sasra'],
    ['me', 'sasu', 'Sasu'],
    ['me', 'patla', 'Patla Sasu'],
    ['me', 'saali', 'Saali'],
    ['me', 'saalo', 'Saalo'],
    ['me', 'sadhu', 'Sadhu Bhai'],
    ['me', 'saadh', 'Saadhotri'],
    ['me', 'babo', 'Babo'],
    ['me', 'babi', 'Babi'],
    ['priya', 'ravi', 'De-ar'],
    ['priya', 'arun', 'De-ar'],
    ['priya', 'komal', 'Derani'],
    ['priya', 'riya', 'Nanand'],
    ['priya', 'kunal', 'Nandoi'],
    ['priya', 'dad', 'Sasra'],
    ['me', 'priya', 'Patni'],
    ['priya', 'me', 'Pati'],
    ['dad', 'priya', 'Vahu'],
    ['dad', 'kunal', 'Jamai'],
    ['dad', 'babo', 'Pautra'],
    ['dad', 'babi', 'Pautri'],
    ['nana', 'me', 'Dohitro'],
    ['nana', 'riya', 'Dohitri'],
  ])('%s calls %s %s', (a, b, word) => expect(familyTitle(ix, a, b, gu)).toBe(word))

  it('has no word for some relationships, so the English label shows', () => {
    expect(familyTitle(ix, 'me', 'ggp', gu)).toBeNull()
    expect(familyTitle(ix, 'me', 'sm', gu)).toBeNull() // no Gujarati word for a stepmother yet
    expect(familyTitle(ix, 'me', 'kid', gu)).toBeNull() // unknown gender
    expect(familyTitle(ix, 'me', 'dad', { lang: 'en', picks: {} })).toBeNull()
  })

  it('uses the word the family picked, and ignores a pick that is not on the list', () => {
    expect(familyTitle(ix, 'me', 'dad', { lang: 'gu', picks: { 'gu:father': 'Bawa' } })).toBe('Bawa')
    expect(familyTitle(ix, 'me', 'dad', { lang: 'gu', picks: { 'gu:father': 'Daddy-o' } })).toBe('Pappa')
    expect(familyTitle(ix, 'me', 'riya', { lang: 'gu', picks: { 'gu:olderSister': 'Ben' } })).toBe('Ben')
  })
})

describe('Hindi titles', () => {
  it.each([
    ['me', 'dad', 'Papa'],
    ['me', 'mom', 'Maa'],
    ['me', 'sm', 'Sauteli Maa'],
    ['me', 'priya', 'Patni'],
    ['me', 'riya', 'Didi'],
    ['me', 'ravi', 'Bhai'],
    ['me', 'sona', 'Bahan'],
    ['me', 'kunal', 'Jija'],
    ['me', 'vik', 'Bahnoi'],
    ['me', 'bapa1', 'Tau'], // the eldest uses the older brother's word
    ['me', 'moti', 'Tai'],
    ['me', 'kaka', 'Chacha'],
    ['me', 'foi', 'Bua'],
    ['me', 'masi', 'Mausi'],
    ['me', 'masa', 'Mausa'],
    ['me', 'ggp', 'Parnana'],
    ['me', 'saalo', 'Sala'],
    ['me', 'saadh', 'Salhaj'],
    ['dada', 'me', 'Pota'],
    ['nana', 'me', 'Nati'],
    ['dad', 'priya', 'Bahu'],
    ['priya', 'ravi', 'Devar'],
  ])('%s calls %s %s', (a, b, word) => expect(familyTitle(ix, a, b, hi)).toBe(word))
})

describe('the title list', () => {
  it('names every title the engine can return, and every word list has a default', () => {
    const named = new Set(TITLE_GROUPS.flatMap(([, keys]) => Object.keys(keys)))
    for (const a of ['me', 'priya', 'dada', 'nana', 'dad']) {
      for (const b of ix.ids) {
        const k = titleKey(ix, a, b)
        if (k) expect(named).toContain(k)
      }
    }
    for (const k of named) for (const lang of ['gu', 'hi'] as const) expect(titleWords({}, lang, k as never).every(Boolean)).toBe(true)
  })
})

describe('custom titles (TODO.md F10)', () => {
  const family = (words: { calledBy?: string; calledByFrom?: Record<string, string> }) => {
    const doc = build('dada:m dad:m me:m sis:f', [[['dada'], ['dad']], [['dad'], ['me', 'sis']]], 'me')
    Object.assign(doc.people.dada, words)
    return indexOf(doc)
  }

  it('uses what you call them, then what everyone calls them, then nothing', () => {
    const ix = family({ calledBy: 'Moti Bapuji', calledByFrom: { sis: 'Dadu' } })
    expect(customTitle(ix, 'sis', 'dada')).toBe('Dadu')
    expect(customTitle(ix, 'me', 'dada')).toBe('Moti Bapuji')
    expect(customTitle(ix, null, 'dada')).toBe('Moti Bapuji')
    expect(customTitle(ix, 'me', 'sis')).toBeNull()
    expect(customTitle(family({}), 'me', 'dada')).toBeNull()
  })

  it('is never a title for yourself', () => {
    expect(customTitle(family({ calledBy: 'Moti Bapuji', calledByFrom: { dada: 'Me' } }), 'dada', 'dada')).toBeNull()
  })
})
