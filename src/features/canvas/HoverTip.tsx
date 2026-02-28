import { useEffect, useState } from 'react'
import { lineOf, relationTo, titleLangOf, useHome, useIndex, useSides, useTitles } from '../../app/derive'
import { age, MONTHS, nextBirthday, yearsLabel } from '../../core/dates'
import { fullName, isDeceased } from '../../core/model'
import { useUi } from '../../store/uiStore'
import { tileRect } from './camera'

// After resting on a tile for 400 ms, a small tip says how old they are, when their birthday is,
// and how they're related to you (PLAN C-3).

export function HoverTip() {
  const hover = useUi((s) => s.hover)
  const card = useUi((s) => s.card)
  const naming = useUi((s) => s.naming)
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const titles = useTitles()
  const [shown, setShown] = useState<{ id: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!hover || card || naming) return
    const t = setTimeout(() => {
      const r = tileRect(hover)
      // Above the tile's + Parent button
      if (r) setShown({ id: hover, x: r.left + r.width / 2, y: r.top - 22 })
    }, 400)
    return () => clearTimeout(t)
  }, [hover, card, naming])

  // Only the tip for the tile still under the pointer, and not over an open card
  if (!shown || shown.id !== hover || card || naming || !ix || !sides) return null
  const p = ix.person(shown.id)
  if (!p) return null
  const rel = relationTo(ix, home, shown.id, titles) ?? lineOf(sides, shown.id)
  const bits: string[] = []
  if (isDeceased(p)) bits.push(`In memory, ${yearsLabel(p)}`)
  else {
    const a = age(p)
    if (a != null) bits.push(`${a} years old`)
    const nb = nextBirthday(p)
    if (nb) bits.push(`Birthday ${MONTHS[nb.date.getMonth()]} ${nb.date.getDate()}`)
  }
  return (
    <div className="tip" style={{ left: shown.x, top: shown.y }} role="tooltip">
      <b>{fullName(p)}</b>
      <span lang={titleLangOf(ix, home, shown.id, titles)}>{rel}</span>
      {bits.map((b) => ` · ${b}`).join('')}
    </div>
  )
}
