import { describe, expect, it } from 'vitest'
import { readTreeText, summarize } from './importTree'
import { alvarezTree } from '../../tests/fixtures/alvarez'
import { embedJson, extractFromHtml, treeToJson } from './treeFile'

describe('backup files', () => {
  it('round trips: export then import gives the same tree (PLAN S7)', () => {
    const doc = { ...alvarezTree(), photos: { ph_1: { mime: 'image/webp' as const, data: 'UklGRg==' } } }
    doc.people.maya.photoId = 'ph_1'
    const back = readTreeText(treeToJson(doc))
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.tree).toEqual(doc)
    expect(summarize(back)).toBe('23 people, 1 photo')
  })

  it('writes the same text every time, with the schema first', () => {
    const a = treeToJson(alvarezTree())
    expect(a).toBe(treeToJson(alvarezTree()))
    expect(a.split('\n').slice(1, 3)).toEqual(['  "$schema": "/schema/v1.json",', '  "schemaVersion": 1,'])
  })

  it('reads a tree back out of an exported page, even with tricky names', () => {
    const doc = alvarezTree()
    doc.people.maya.notes = 'Loves </script><script>alert(1)</script> and "quotes"'
    const html = `<!doctype html><html><body><script type="application/json" id="jangal-data">${embedJson(treeToJson(doc))}</script></body></html>`
    expect(html).not.toContain('</script><script>alert')
    expect(extractFromHtml(html)).not.toBeNull()
    const back = readTreeText(html, 'family.html')
    expect(back.ok && back.tree.people.maya.notes).toBe(doc.people.maya.notes)
    expect(back.ok && back.source).toBe('html')
  })

  it('explains what is wrong with a broken file', () => {
    expect(readTreeText('{"schemaVersion": 1, "people": {')).toMatchObject({ ok: false, error: expect.stringMatching(/^Line 1:/) })
    const noPeople = { ...alvarezTree(), people: {} }
    expect(readTreeText(JSON.stringify(noPeople))).toEqual({ ok: false, error: 'This file has no people in it.' })
    const bad = JSON.parse(JSON.stringify(alvarezTree()))
    bad.people.maya.createdAt = 42
    bad.families.f_maya.partnerIds = 'sam'
    expect(readTreeText(JSON.stringify(bad))).toMatchObject({ ok: false, error: expect.stringContaining('Family f_maya, partner ids') })
    expect(readTreeText('<html><body>hello</body></html>', 'x.html')).toMatchObject({ ok: false })
  })

  it('carries the family titles a file was made with, and drops a pack that looks wrong (TODO.md TP-8)', () => {
    const pack = { format: 'jangal-titles', version: 1, lang: 'mr', name: 'Marathi', words: { father: ['Baba', 'Aba'] } }
    const doc = { ...alvarezTree(), titles: { lang: 'mr', picks: { 'mr:father': 'Aba' }, pack } }
    const good = readTreeText(treeToJson(doc))
    expect(good.ok && good.tree.titles).toEqual({ lang: 'mr', picks: { 'mr:father': 'Aba' }, pack })
    const bad = readTreeText(treeToJson({ ...doc, titles: { ...doc.titles, pack: { ...pack, lang: '!!' } } }))
    expect(bad.ok && bad.tree.titles).toBeUndefined()
    expect(bad.ok && bad.warnings).toContain("The family titles in this file couldn't be read: Add a language code, like mr for Marathi or ta for Tamil.")
  })
})

