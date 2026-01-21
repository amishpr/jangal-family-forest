import type { TreeIndex } from './index'
import { closestAncestor, isEx, linkKind } from './kinship'
import { isPet, wordGender, type WordGender } from './model'
import en from './titles/en.json'
import gu from './titles/gu.json'
import hi from './titles/hi.json'

// Family titles (FAMILY-RELATIONS.MD): the word a Gujarati or Hindi family calls someone, like Kaka,
// Foi or Masi, worked out from the same graph as the English labels and in the same order as
// relation() in kinship.ts. Ages come from birthdays, and words that depend on age (Bapa, Didi,
// Jeth) only appear when the dates show it. Otherwise the everyday word is used.
//
// The words are data (TODO.md F4): titles/en.json lists every relationship with its English
// description, and each language is a pack of words for them, like titles/gu.json. Families can
// add their own packs. The relationships themselves (TITLE_KEYS) belong to titleKey() below, so a
// pack can give words for them but can't add new ones.

/** Every relationship a title can name. titleKey() below decides which one fits. */
export const TITLE_KEYS = [
  'father', 'mother', 'stepFather', 'stepMother', 'husband', 'wife', 'son', 'daughter', 'sonWife', 'daughterHusband',
  'brother', 'olderBrother', 'youngerBrother', 'sister', 'olderSister', 'youngerSister', 'brotherWife', 'olderSisterHusband',
  'youngerSisterHusband', 'brotherSon', 'brotherDaughter', 'sisterSon', 'sisterDaughter',
  'fatherYoungerBrother', 'fatherYoungerBrotherWife', 'fatherOlderBrother', 'fatherOlderBrotherWife', 'fatherEldestBrother',
  'fatherEldestBrotherWife', 'fatherSister', 'fatherSisterHusband',
  'motherBrother', 'motherBrotherWife', 'motherSister', 'motherSisterHusband',
  'paternalGrandfather', 'paternalGrandmother', 'maternalGrandfather', 'maternalGrandmother', 'maternalGrandfatherBrother',
  'maternalGrandmotherSister', 'paternalGreatGrandfather', 'paternalGreatGrandmother', 'maternalGreatGrandfather',
  'maternalGreatGrandmother', 'sonSon', 'sonDaughter', 'daughterSon', 'daughterDaughter',
  'spouseFather', 'spouseMother', 'wifeYoungerSister', 'wifeOlderSister', 'wifeBrother', 'wifeSisterHusband', 'wifeBrotherWife',
  'husbandYoungerBrother', 'husbandYoungerBrotherWife', 'husbandOlderBrother', 'husbandOlderBrotherWife', 'husbandSister',
  'husbandSisterHusband',
] as const

export type TitleKey = (typeof TITLE_KEYS)[number]

/** A language's words: "mr" for Marathi, its name, and the words for each relationship, first is the default */
export type TitlePack = {
  format: 'jangal-titles'
  version: 1
  lang: string
  name: string
  nativeName?: string
  words: Partial<Record<TitleKey, string[]>>
}

/** "en" for the English labels, or a pack's language. Packs a family added live in the settings. */
export type TitleLang = string
export type Titles = { lang: TitleLang; picks: Record<string, string>; packs?: Record<string, TitlePack> }

/** Every title, grouped for the menu, with the relationship it stands for in English (from en.json) */
export const TITLE_GROUPS = en.groups.map((g) => [g.name, g.titles as Partial<Record<TitleKey, string>>] as const)

/** The relationship in English, like "Father's younger brother or male cousin" */
export const titleLabel = (key: TitleKey): string => TITLE_GROUPS.map(([, t]) => t[key]).find(Boolean) ?? key

// The first word is the default. Gujarati is the family's own list; Hindi is from
// en.wikibooks.org/wiki/Hindi/Family_relations, everyday words first.
export const BUILT_IN_PACKS: Record<string, TitlePack> = { gu: gu as TitlePack, hi: hi as TitlePack }

/** The pack in use for a language: one the family added wins over a built-in one with the same code */
export const packFor = (titles: Pick<Titles, 'packs'>, lang: TitleLang): TitlePack | undefined => titles.packs?.[lang] ?? BUILT_IN_PACKS[lang]

/** The languages to choose from: English, the built-in packs, then the family's own */
export function titleLangs(titles: Pick<Titles, 'packs'>): [TitleLang, string][] {
  const langs = new Map<TitleLang, string>([['en', 'English']])
  for (const p of [...Object.values(BUILT_IN_PACKS), ...Object.values(titles.packs ?? {})]) langs.set(p.lang, packFor(titles, p.lang)!.name)
  return [...langs]
}

// A language without a word for the narrower relationship uses the broader one
const BROADER: Partial<Record<TitleKey, TitleKey>> = {
  olderBrother: 'brother',
  youngerBrother: 'brother',
  olderSister: 'sister',
  youngerSister: 'sister',
  fatherEldestBrother: 'fatherOlderBrother',
  fatherEldestBrotherWife: 'fatherOlderBrotherWife',
}

const LANG_CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/
const tidy = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/**
 * A pack from a file someone picked, or from this browser's storage, checked and tidied (TODO.md
 * TP-5): a language code and a name, at most 12 words of 40 characters for each relationship, and
 * at least one word. Relationships it doesn't know are left out and listed.
 */
export function cleanPack(raw: unknown): { pack: TitlePack; dropped: string[] } | { error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  if (r.format !== 'jangal-titles') return { error: "This isn't a family titles file. Start from the template." }
  if (r.version !== 1) return { error: 'This family titles file is from a newer version of Jangal.' }
  const lang = tidy(r.lang, 20).toLowerCase()
  const name = tidy(r.name, 40)
  const bad = packNameError(lang, name)
  if (bad) return { error: bad }
  const nativeName = tidy(r.nativeName, 40)
  const given = (r.words && typeof r.words === 'object' ? r.words : {}) as Record<string, unknown>
  const known = new Set<string>(TITLE_KEYS)
  const words: TitlePack['words'] = {}
  for (const k of TITLE_KEYS) {
    const list = (Array.isArray(given[k]) ? given[k] : [given[k]]).map((w) => tidy(w, 40)).filter(Boolean)
    if (list.length) words[k] = [...new Set(list)].slice(0, 12)
  }
  if (!Object.keys(words).length) return { error: 'This file has no words in it yet. Fill in at least one relationship.' }
  const pack: TitlePack = { format: 'jangal-titles', version: 1, lang, name, ...(nativeName ? { nativeName } : {}), words }
  return { pack, dropped: Object.keys(given).filter((k) => !known.has(k)) }
}

/** What's wrong with a language's code or name, or null. Used for files and the New language flow. */
export function packNameError(lang: string, name: string): string | null {
  if (!LANG_CODE.test(lang)) return 'Add a language code, like mr for Marathi or ta for Tamil.'
  if (!name.trim()) return "Add the language's name, like Marathi."
  return null
}

/** A new language's pack, blank or with a copy of another pack's words (TODO.md TE-1) */
export function newPack(lang: string, name: string, nativeName = '', from?: TitlePack): TitlePack {
  const words = Object.fromEntries(Object.entries(from?.words ?? {}).map(([k, w]) => [k, [...(w ?? [])]]))
  return { format: 'jangal-titles', version: 1, lang, name: tidy(name, 40), ...(tidy(nativeName, 40) ? { nativeName: tidy(nativeName, 40) } : {}), words }
}

export type WordChange = { add: string } | { remove: string } | { move: string; by: -1 | 1 } | { usual: string } | { reset: true }

/**
 * One change to the words for one relationship (TODO.md TE-2 to TE-5), with the same rules as
 * cleanPack: 12 words of 40 characters at most, no repeats, and at least one word in the whole
 * pack. The first word is the usual one, and reset goes back to the built-in pack's words. A change
 * the rules refuse returns the same pack.
 */
export function editPack(pack: TitlePack, key: TitleKey, change: WordChange): TitlePack {
  const now = pack.words[key] ?? []
  let next: string[]
  if ('add' in change) {
    const w = tidy(change.add, 40)
    if (!w || now.includes(w) || now.length >= 12) return pack
    next = [...now, w]
  } else if ('remove' in change) next = now.filter((w) => w !== change.remove)
  else if ('usual' in change) next = now.includes(change.usual) ? [change.usual, ...now.filter((w) => w !== change.usual)] : now
  else if ('move' in change) {
    const i = now.indexOf(change.move)
    const j = i + change.by
    if (i < 0 || j < 0 || j >= now.length) return pack
    next = [...now]
    ;[next[i], next[j]] = [next[j], next[i]]
  } else next = [...(BUILT_IN_PACKS[pack.lang]?.words[key] ?? [])]
  const words = { ...pack.words }
  if (next.length) words[key] = next
  else delete words[key]
  // cleanPack refuses an empty pack, so this browser would drop it on the next visit
  if (!Object.keys(words).length) return pack
  return { ...pack, words }
}

/** The words a language offers for one title, first is the default */
export const titleWords = (titles: Pick<Titles, 'packs'>, lang: TitleLang, key: TitleKey): string[] => packFor(titles, lang)?.words[key] ?? []

/** The word for a title in the chosen language, with the family's pick, or null if there's none */
export function titleWord(titles: Titles, key: TitleKey): string | null {
  for (let k: TitleKey | undefined = key; k; k = BROADER[k]) {
    const words = titleWords(titles, titles.lang, k)
    if (!words.length) continue
    const pick = titles.picks[`${titles.lang}:${k}`]
    return pick && words.includes(pick) ? pick : words[0]
  }
  return null
}

/**
 * A title of b's own, as a sees it (TODO.md F10): what a calls them, then what everyone does. It
 * comes before any pack's word or English label, wherever a title shows.
 */
export function customTitle(ix: TreeIndex, a: string | null, b: string): string | null {
  const p = ix.person(b)
  return (a && a !== b && p?.calledByFrom?.[a]) || (a !== b && p?.calledBy) || null
}

/** "Kaka" for b as seen from a, or null when the language has no title for them */
export function familyTitle(ix: TreeIndex, a: string, b: string, titles: Titles): string | null {
  if (!packFor(titles, titles.lang)) return null
  const key = titleKey(ix, a, b)
  return key && titleWord(titles, key)
}

const gender = (ix: TreeIndex, id: string | undefined): WordGender => wordGender(id ? ix.person(id) : undefined)

/** Whether x is older or younger than y, by birthday, or undefined when the dates can't tell */
function age(ix: TreeIndex, x: string, y: string): 'older' | 'younger' | undefined {
  const a = ix.person(x)?.birth?.date
  const b = ix.person(y)?.birth?.date
  for (const k of ['year', 'month', 'day'] as const) {
    if (a?.[k] == null || b?.[k] == null) return undefined
    if (a[k] !== b[k]) return a[k] < b[k] ? 'older' : 'younger'
  }
  return undefined
}

/** The title for b as seen from a, in the same order relation() looks: partner, blood, then marriage */
export function titleKey(ix: TreeIndex, a: string, b: string): TitleKey | null {
  const g = gender(ix, b)
  if (a === b || g === 'n' || isPet(ix.person(a)) || isPet(ix.person(b))) return null
  const m = g === 'm'
  const pf = ix.partnerFamilyBetween(a, b)
  if (pf) return isEx(pf.status) ? null : m ? 'husband' : 'wife'
  if (closestAncestor(ix, a, b)) return bloodKey(ix, a, b)

  // b is the partner of one of a's blood relatives
  for (const q of ix.partnersOf(b)) {
    if (!closestAncestor(ix, a, q)) continue
    if (isEx(ix.partnerFamilyBetween(q, b)?.status)) return null
    const k = bloodKey(ix, a, q)
    if (k === 'youngerSister' || (k === 'sister' && age(ix, q, a) === 'younger')) return m ? 'youngerSisterHusband' : null
    return (k && SPOUSE[k]?.[m ? 0 : 1]) ?? null
  }

  // b is a blood relative of one of a's partners: a parent or a sibling
  for (const q of ix.partnersOf(a)) {
    const c = closestAncestor(ix, q, b)
    if (!c) continue
    if (isEx(ix.partnerFamilyBetween(a, q)?.status)) return null
    if (c.db === 0 && c.da === 1) return m ? 'spouseFather' : 'spouseMother'
    if (c.da !== 1 || c.db !== 1) return null
    const older = age(ix, b, q) === 'older'
    const side = gender(ix, q)
    if (side === 'f') return m ? 'wifeBrother' : older ? 'wifeOlderSister' : 'wifeYoungerSister'
    if (side === 'm') return m ? (older ? 'husbandOlderBrother' : 'husbandYoungerBrother') : 'husbandSister'
    return null
  }

  // b is the partner of a partner's sibling
  for (const q of ix.partnersOf(a)) {
    for (const r of ix.partnersOf(b)) {
      const c = closestAncestor(ix, q, r)
      if (c?.da !== 1 || c.db !== 1) continue
      const side = gender(ix, q)
      const sib = gender(ix, r)
      if (side === 'f') return sib === 'f' && m ? 'wifeSisterHusband' : sib === 'm' && !m ? 'wifeBrotherWife' : null
      if (side === 'm' && sib === 'f' && m) return 'husbandSisterHusband'
      if (side === 'm' && sib === 'm' && !m) return age(ix, r, q) === 'older' ? 'husbandOlderBrotherWife' : 'husbandYoungerBrotherWife'
      return null
    }
  }
  return null
}

/** The title of a blood relative's partner: [husband, wife] */
const SPOUSE: Partial<Record<TitleKey, [TitleKey | null, TitleKey | null]>> = {
  father: ['stepFather', 'stepMother'],
  mother: ['stepFather', 'stepMother'],
  son: [null, 'sonWife'],
  daughter: ['daughterHusband', null],
  brother: [null, 'brotherWife'],
  olderBrother: [null, 'brotherWife'],
  youngerBrother: [null, 'brotherWife'],
  sister: ['olderSisterHusband', null],
  olderSister: ['olderSisterHusband', null],
  fatherYoungerBrother: [null, 'fatherYoungerBrotherWife'],
  fatherOlderBrother: [null, 'fatherOlderBrotherWife'],
  fatherEldestBrother: [null, 'fatherEldestBrotherWife'],
  fatherSister: ['fatherSisterHusband', null],
  motherBrother: [null, 'motherBrotherWife'],
  motherSister: ['motherSisterHusband', null],
}

/** The title of a blood relative, from where their closest common ancestor sits */
function bloodKey(ix: TreeIndex, a: string, b: string): TitleKey | null {
  const c = closestAncestor(ix, a, b)
  if (!c) return null
  const { da, db } = c
  const m = gender(ix, b) === 'm'
  // Someone's parent on the way up to the common ancestor, the father when both are
  const up = (x: string, d: number) => {
    const ps = ix.parentsOf(x).filter((p) => ix.ancestors(p).get(c.id) === d - 1)
    return ps.find((p) => gender(ix, p) === 'm') ?? ps[0]
  }

  if (db === 0 && da === 1) {
    const kind = linkKind(ix, b, a)
    if (kind === 'foster') return null
    return kind === 'step' ? (m ? 'stepFather' : 'stepMother') : m ? 'father' : 'mother'
  }
  if (da === 0 && db === 1) {
    const kind = linkKind(ix, a, b)
    return kind === 'step' || kind === 'foster' ? null : m ? 'son' : 'daughter'
  }
  // Cousins are brothers and sisters too
  if (da === db) {
    const order = age(ix, b, a)
    if (m) return order === 'older' ? 'olderBrother' : order === 'younger' ? 'youngerBrother' : 'brother'
    return order === 'older' ? 'olderSister' : order === 'younger' ? 'youngerSister' : 'sister'
  }
  if (da === 0) {
    // Grandchildren, through a son or a daughter
    const via = gender(ix, up(b, db))
    if (db !== 2 || via === 'n') return null
    return via === 'm' ? (m ? 'sonSon' : 'sonDaughter') : m ? 'daughterSon' : 'daughterDaughter'
  }
  if (db === da + 1) {
    // A brother's or sister's child, cousins' children included
    const via = gender(ix, up(b, db))
    if (via === 'n') return null
    return via === 'm' ? (m ? 'brotherSon' : 'brotherDaughter') : m ? 'sisterSon' : 'sisterDaughter'
  }

  // Everyone else is on the father's side or the mother's side
  const parent = up(a, da)
  const side = gender(ix, parent)
  if (!parent || side === 'n') return null
  const pat = side === 'm'
  if (db === 0 && da === 2) return pat ? (m ? 'paternalGrandfather' : 'paternalGrandmother') : m ? 'maternalGrandfather' : 'maternalGrandmother'
  if (db === 0 && da === 3) {
    return pat ? (m ? 'paternalGreatGrandfather' : 'paternalGreatGrandmother') : m ? 'maternalGreatGrandfather' : 'maternalGreatGrandmother'
  }
  if (da === db + 1) {
    if (!pat) return m ? 'motherBrother' : 'motherSister'
    if (!m) return 'fatherSister'
    if (age(ix, b, parent) !== 'older') return 'fatherYoungerBrother'
    // The eldest of two or more older brothers is Mota Kaka
    const older = ix.siblingsOf(parent).filter((s) => gender(ix, s) === 'm' && age(ix, s, parent) === 'older')
    const eldest = older.length >= 2 && older.includes(b) && older.every((s) => s === b || age(ix, b, s) === 'older')
    return eldest ? 'fatherEldestBrother' : 'fatherOlderBrother'
  }
  if (da === db + 2 && !pat) {
    const grand = gender(ix, up(parent, da - 1))
    if (grand === 'm' && m) return 'maternalGrandfatherBrother'
    if (grand === 'f' && !m) return 'maternalGrandmotherSister'
  }
  return null
}
