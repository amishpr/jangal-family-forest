import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ExportedTitles } from '../core/model'
import { BUILT_IN_PACKS, cleanPack, editPack, packFor, type TitleKey, type TitleLang, type TitlePack, type Titles, type WordChange } from '../core/titles'

// Settings that belong to this browser rather than to a tree (PLAN A-4): the theme, whether branch
// colors are on, and the family titles (FAMILY-RELATIONS.MD), with any title packs this family
// added (TODO.md F4). Kept in localStorage so the theme applies before the first paint (the inline
// script in index.html reads the same key).

export type ThemeChoice = 'system' | 'light' | 'dark'

type Settings = {
  theme: ThemeChoice
  branchColors: boolean
  /** Replaced whole on every change, so it works as a cache key */
  titles: Titles
  setTheme(theme: ThemeChoice): void
  setBranchColors(on: boolean): void
  setTitleLang(lang: TitleLang): void
  /** key is "gu:father". null goes back to the first word. */
  pickTitle(key: string, word: string | null): void
  resetTitles(): void
  /** Adds a family's own words, or replaces a language's, and switches to it */
  addTitlePack(pack: TitlePack): void
  /** Takes a family's words away again. A built-in language goes back to its own words. */
  removeTitlePack(lang: TitleLang): void
  /**
   * Changes a language's words for one relationship (TODO.md F9). A built-in language's changes
   * are kept as a pack of the family's own with its code. A new usual word replaces the pick.
   */
  updateTitlePack(lang: TitleLang, key: TitleKey, change: WordChange): void
}

export const THEME_KEY = 'jangal:theme'

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      branchColors: true,
      titles: { lang: 'en', picks: {} },
      setTheme: (theme) => set({ theme }),
      setBranchColors: (branchColors) => set({ branchColors }),
      setTitleLang: (lang) => set((s) => ({ titles: { ...s.titles, lang } })),
      pickTitle: (key, word) =>
        set((s) => {
          const picks = { ...s.titles.picks }
          if (word) picks[key] = word
          else delete picks[key]
          return { titles: { ...s.titles, picks } }
        }),
      resetTitles: () =>
        set((s) => ({
          titles: { ...s.titles, picks: Object.fromEntries(Object.entries(s.titles.picks).filter(([k]) => !k.startsWith(`${s.titles.lang}:`))) },
        })),
      addTitlePack: (pack) => set((s) => ({ titles: { ...s.titles, lang: pack.lang, packs: { ...s.titles.packs, [pack.lang]: pack } } })),
      removeTitlePack: (lang) =>
        set((s) => {
          const { [lang]: _gone, ...packs } = s.titles.packs ?? {}
          void _gone
          const builtIn = !!BUILT_IN_PACKS[lang]
          const picks = builtIn ? s.titles.picks : Object.fromEntries(Object.entries(s.titles.picks).filter(([k]) => !k.startsWith(`${lang}:`)))
          return { titles: { lang: s.titles.lang === lang && !builtIn ? 'en' : s.titles.lang, picks, ...(Object.keys(packs).length ? { packs } : {}) } }
        }),
      updateTitlePack: (lang, key, change) =>
        set((s) => {
          const pack = packFor(s.titles, lang)
          if (!pack) return {}
          const next = editPack(pack, key, change)
          if (next === pack) return {}
          const { [`${lang}:${key}`]: _pick, ...rest } = s.titles.picks
          void _pick
          const picks = 'usual' in change ? rest : s.titles.picks
          return { titles: { ...s.titles, picks, packs: { ...s.titles.packs, [lang]: next } } }
        }),
    }),
    {
      name: 'jangal:settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ theme: s.theme, branchColors: s.branchColors, titles: s.titles }),
      // Anything can be in localStorage: packs are checked like an uploaded file, and titles that
      // don't look right go back to English
      merge: (stored, current) => {
        const s = (stored ?? {}) as Partial<Settings>
        const t = s.titles as Partial<Titles> | undefined
        const packs: Record<string, TitlePack> = {}
        for (const raw of Object.values(t?.packs && typeof t.packs === 'object' ? t.packs : {})) {
          const r = cleanPack(raw)
          if ('pack' in r) packs[r.pack.lang] = r.pack
        }
        const lang = t?.lang
        const ok = typeof lang === 'string' && (lang === 'en' || !!packFor({ packs }, lang)) && typeof t?.picks === 'object' && t.picks !== null
        // Anything wrong goes back to English, keeping the family's packs that pass the checks
        const titles: Titles = { lang: ok ? lang : 'en', picks: ok ? t.picks! : {}, ...(Object.keys(packs).length ? { packs } : {}) }
        return { ...current, ...s, titles }
      },
    },
  ),
)

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export const effectiveTheme = (t: ThemeChoice): 'light' | 'dark' =>
  t === 'system' ? (darkQuery().matches ? 'dark' : 'light') : t

/** Keeps <html data-theme> and the pre-paint key in step with the setting */
export function applyTheme(t: ThemeChoice) {
  const root = document.documentElement
  if (t === 'system') root.removeAttribute('data-theme')
  else root.dataset.theme = t
  try {
    if (t === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, t)
  } catch {
    // Private mode: the theme still applies for this visit
  }
}

/**
 * The family titles to put in a backup or family page (TODO.md TP-8): the language, this family's
 * picks for it, and its pack if the family added it. Nothing when tiles are in English.
 */
export function fileTitles(): ExportedTitles | undefined {
  const t = useSettings.getState().titles
  if (!packFor(t, t.lang)) return undefined
  const picks = Object.fromEntries(Object.entries(t.picks).filter(([k]) => k.startsWith(`${t.lang}:`)))
  return { lang: t.lang, picks, ...(t.packs?.[t.lang] ? { pack: t.packs[t.lang] } : {}) }
}

/** Uses the family titles a file carries: its pack (checked again), its language and its picks */
export function applyFileTitles(f: ExportedTitles) {
  const s = useSettings.getState()
  const r = f.pack === undefined ? null : cleanPack(f.pack)
  if (r && 'pack' in r) s.addTitlePack(r.pack)
  else if (packFor(s.titles, f.lang)) s.setTitleLang(f.lang)
  else return
  for (const [k, w] of Object.entries(f.picks)) if (k.startsWith(`${f.lang}:`)) useSettings.getState().pickTitle(k, w)
}
