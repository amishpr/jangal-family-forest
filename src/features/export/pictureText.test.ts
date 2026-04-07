import { describe, expect, it } from 'vitest'
import { needsPicture, needsShaping } from './renderSvg'

// Which text the PDF draws as a picture (TODO.md TP-9)
describe('text the PDF fonts can’t draw', () => {
  it('draws Latin, accents and punctuation as text, and everything else as a picture', () => {
    for (const s of ['Ranbir Kapoor', 'Tomás Ñúñez', 'Kaka · your uncle', '“Yahoo!” – 1961…', 'Łódź', '₹ 500']) expect(needsPicture(s), s).toBe(false)
    for (const s of ['જંગલ', 'बाबा', 'Папа', 'Πατέρας', '爸爸', 'Dad 👨']) expect(needsPicture(s), s).toBe(true)
  })

  it('keeps notes as text unless their script needs shaping', () => {
    expect(needsShaping('Born in Mumbai → moved to London')).toBe(false)
    expect(needsShaping('જંગલ')).toBe(true)
  })
})
