import { useMemo } from 'react'
import { useIndex } from '../../app/derive'
import { traitView } from '../../core/traits'
import { fullName } from '../../core/model'
import { useUi } from '../../store/uiStore'
import { X } from '../../ui/icons'
import { tileRect } from './camera'

// While a trait is lit on the tree (TODO.md TR-5, TR-6): what it adds up to, in words, so the view
// isn't only colors. "Who has it" lists everyone, for screen readers too. Esc or × ends it.

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function TraitBar() {
  const trait = useUi((s) => s.trait)
  const ix = useIndex()
  const v = useMemo(() => (trait && ix ? traitView(ix, trait) : null), [trait, ix])
  if (!trait || !ix || !v) return null
  const parts = [plural(v.carriers.length, 'person', 'people')]
  if (v.carriers.length) parts.push(plural(v.generations, 'generation'))
  if (v.links.length) parts.push(`passed down ${plural(v.links.length, 'time')}`)
  if (v.skips.length) parts.push(`skipped a generation ${plural(v.skips.length, 'time')}`)
  return (
    <section className="trait-bar" aria-label={`Who has ${trait}`}>
      <div className="trait-sum" role="status">
        <b>{trait}</b>
        <span>{parts.join(' · ')}</span>
      </div>
      {v.carriers.length > 0 && (
        <details>
          <summary>Who has it</summary>
          <ul>
            {v.carriers.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => useUi.getState().openCard(id, 'view', tileRect(id))}>
                  {fullName(ix.person(id)!)}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <button type="button" className="round" aria-label={`Stop showing ${trait}`} onClick={() => useUi.getState().setTrait(null)}>
        <X />
      </button>
    </section>
  )
}
