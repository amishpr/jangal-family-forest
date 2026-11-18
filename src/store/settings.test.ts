// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { TitlePack } from '../core/titles'
import { useSettings } from './settings'

const stored = (titles: unknown) =>
  localStorage.setItem('jangal:settings', JSON.stringify({ state: { theme: 'dark', titles }, version: 0 }))

describe('family title settings', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.setState({ titles: { lang: 'en', picks: {} } })
  })

  it('remembers a pick, goes back to the first word, and resets one language only', () => {
    const s = useSettings.getState()
    s.setTitleLang('gu')
    s.pickTitle('gu:father', 'Bawa')
    s.pickTitle('gu:mother', 'Mummy')
    s.pickTitle('hi:father', 'Pita')
    s.pickTitle('gu:mother', null)
    expect(useSettings.getState().titles).toEqual({ lang: 'gu', picks: { 'gu:father': 'Bawa', 'hi:father': 'Pita' } })
    useSettings.getState().resetTitles()
    expect(useSettings.getState().titles).toEqual({ lang: 'gu', picks: { 'hi:father': 'Pita' } })
    expect(JSON.parse(localStorage.getItem('jangal:settings')!).state.titles.lang).toBe('gu')
  })

  it('loads saved titles, and goes back to English when what was saved looks wrong', async () => {
    stored({ lang: 'hi', picks: { 'hi:father': 'Baba' } })
    await useSettings.persist.rehydrate()
    expect(useSettings.getState().titles).toEqual({ lang: 'hi', picks: { 'hi:father': 'Baba' } })
    // The theme comes from its own key, not the settings (stored() saves 'dark' there)
    expect(useSettings.getState().theme).toBe('light')
    localStorage.setItem('jangal:theme', 'dark')
    await useSettings.persist.rehydrate()
    expect(useSettings.getState().theme).toBe('dark')
    localStorage.removeItem('jangal:theme')

    for (const bad of [{ lang: 'fr', picks: {} }, { lang: 'gu', picks: null }, { lang: 'gu' }, 'gu']) {
      useSettings.setState({ titles: { lang: 'en', picks: {} } })
      stored(bad)
      await useSettings.persist.rehydrate()
      expect(useSettings.getState().titles, JSON.stringify(bad)).toEqual({ lang: 'en', picks: {} })
    }
  })

  it('keeps the packs a family added, and drops one that looks wrong (TODO.md TP-6)', async () => {
    const mr = { format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi', words: { father: ['Baba'] } }
    stored({ lang: 'mr', picks: {}, packs: { mr, xx: { format: 'nope' } } })
    await useSettings.persist.rehydrate()
    expect(useSettings.getState().titles).toEqual({ lang: 'mr', picks: {}, packs: { mr } })
    useSettings.setState({ titles: { lang: 'en', picks: {} } })
    stored({ lang: 'xx', picks: {}, packs: { xx: { format: 'nope' } } })
    await useSettings.persist.rehydrate()
    expect(useSettings.getState().titles).toEqual({ lang: 'en', picks: {} })
    // A language that's gone doesn't take the family's other packs with it
    stored({ lang: 'xx', picks: {}, packs: { mr, xx: { format: 'nope' } } })
    await useSettings.persist.rehydrate()
    expect(useSettings.getState().titles).toEqual({ lang: 'en', picks: {}, packs: { mr } })
  })

  it('adds a pack and switches to it, and removing it goes back to English', () => {
    const mr: TitlePack = { format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi', words: { father: ['Baba'] } }
    const s = useSettings.getState()
    s.addTitlePack(mr)
    s.pickTitle('mr:father', 'Baba')
    expect(useSettings.getState().titles).toEqual({ lang: 'mr', picks: { 'mr:father': 'Baba' }, packs: { mr } })
    useSettings.getState().removeTitlePack('mr')
    expect(useSettings.getState().titles).toEqual({ lang: 'en', picks: {} })
  })

  it('keeps changes to a built-in language as its own pack, and a new usual word replaces the pick (TODO.md TE-5)', () => {
    const s = useSettings.getState()
    s.setTitleLang('gu')
    s.pickTitle('gu:father', 'Bawa')
    s.updateTitlePack('gu', 'father', { add: 'Bapu' })
    expect(useSettings.getState().titles.picks['gu:father']).toBe('Bawa')
    useSettings.getState().updateTitlePack('gu', 'father', { usual: 'Bapu' })
    const t = useSettings.getState().titles
    expect(t.picks['gu:father']).toBeUndefined()
    expect(t.packs?.gu.words.father?.[0]).toBe('Bapu')
    useSettings.getState().removeTitlePack('gu')
    expect(useSettings.getState().titles.packs).toBeUndefined()
  })
})
