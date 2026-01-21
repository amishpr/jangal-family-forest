import { parseCsv, toCsv, unprotect } from '../sheet/csv'
import { cleanPack, TITLE_KEYS, titleLabel, type TitlePack } from '../titles'

// Family title packs as files (TODO.md F4): JSON, or a CSV spreadsheet with one row per
// relationship. The templates are made from the list of relationships, so they always match it.
// Loaded only when someone downloads or adds a pack.

const WORD_COLUMNS = 6
const META = [
  ['lang', 'Language code, like mr for Marathi or ta for Tamil'],
  ['name', 'Language name in English, like Marathi'],
  ['nativeName', 'Its name in its own writing, like मराठी (you can leave this out)'],
] as const

const ABOUT =
  'Family titles for Jangal. Fill in the language code and name, then one or more words for each relationship, the everyday word first. Leave out any you don\'t use: those keep the English words.'

export type PackRead = { ok: true; pack: TitlePack; dropped: string[] } | { ok: false; error: string }

/** A pack from a .json or .csv file */
export function readPackFile(text: string, fileName: string): PackRead {
  let raw: unknown
  if (/\.csv$/i.test(fileName) || /^﻿?key[,;]/i.test(text)) {
    const words: Record<string, string[]> = {}
    const meta: Record<string, string> = {}
    for (const row of parseCsv(text).map((r) => r.map((c) => unprotect(c).trim()))) {
      const [key, , ...rest] = row
      if (!key || key.toLowerCase() === 'key') continue
      if (META.some(([k]) => k === key)) meta[key] = rest[0] ?? ''
      else words[key] = rest.filter(Boolean)
    }
    raw = { format: 'jangal-titles', version: 1, ...meta, words }
  } else {
    try {
      raw = JSON.parse(text.replace(/^﻿/, ''))
    } catch {
      return { ok: false, error: "This file isn't valid JSON or CSV. Start from one of the templates." }
    }
  }
  const r = cleanPack(raw)
  return 'error' in r ? { ok: false, error: r.error } : { ok: true, ...r }
}

/** A pack as JSON, with each relationship described in English so it can be edited by hand */
export function packToJson(pack: Pick<TitlePack, 'lang' | 'name' | 'nativeName'> & { words: Partial<TitlePack['words']> }, all = false): string {
  const words = Object.fromEntries(TITLE_KEYS.filter((k) => all || pack.words[k]?.length).map((k) => [k, pack.words[k] ?? []]))
  const relationships = Object.fromEntries(TITLE_KEYS.filter((k) => k in words).map((k) => [k, titleLabel(k)]))
  const file = { format: 'jangal-titles', version: 1, about: ABOUT, lang: pack.lang, name: pack.name, nativeName: pack.nativeName ?? '', words, relationships }
  return `${JSON.stringify(file, null, 2)}\n`
}

/** A pack as a spreadsheet: the language rows, then one row per relationship */
export function packToCsv(pack: Pick<TitlePack, 'lang' | 'name' | 'nativeName'> & { words: Partial<TitlePack['words']> }): string {
  const pad = (cells: string[]) => [...cells, ...Array(Math.max(0, 2 + WORD_COLUMNS - cells.length)).fill('')]
  return toCsv([
    ['key', 'relationship', ...Array.from({ length: WORD_COLUMNS }, (_, i) => `word ${i + 1}`)],
    ...META.map(([k, help]) => pad([k, help, (k === 'nativeName' ? pack.nativeName : pack[k]) ?? ''])),
    ...TITLE_KEYS.map((k) => pad([k, titleLabel(k), ...(pack.words[k] ?? [])])),
  ])
}

/** The blank template: every relationship, no words yet */
export const templatePack = () => ({ lang: '', name: '', nativeName: '', words: {} })
