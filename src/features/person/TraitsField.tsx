import { useId, useState } from 'react'
import { useIndex } from '../../app/derive'
import { allTraits, MAX_TRAITS, spellTrait, STARTER_TRAITS, traitKey } from '../../core/traits'
import { X } from '../../ui/icons'

// Traits in the edit card (TODO.md TR-1, TR-2): type one and press Enter or a comma, × takes one
// off. The suggestions are the browser's own list: traits already in the tree first, then a few
// starters. A trait already in the tree keeps its spelling, so "left handed" becomes "Left-handed".
// Each chip is a hidden "tags" field, and whatever is still in the box is read on Save too.

export function TraitsField({ initial, first }: { initial: string[]; first: string }) {
  const ix = useIndex()
  const listId = useId()
  const [traits, setTraits] = useState(initial)
  const [draft, setDraft] = useState('')
  if (!ix) return null

  const add = (typed: string) => {
    const t = spellTrait(ix, typed)
    if (t && traits.length < MAX_TRAITS && !traits.some((x) => traitKey(x) === traitKey(t))) setTraits([...traits, t])
    setDraft('')
  }
  const taken = new Set(traits.map(traitKey))
  const suggestions = [...allTraits(ix).map((t) => t.name), ...STARTER_TRAITS].filter((t, i, all) => {
    const k = traitKey(t)
    return !taken.has(k) && all.findIndex((x) => traitKey(x) === k) === i
  })

  return (
    <div className="fl">
      <label htmlFor={`${listId}-in`}>Traits</label>
      {traits.length > 0 && (
        <ul className="trait-chips" aria-label={`${first}'s traits`}>
          {traits.map((t) => (
            <li key={t} className="trait-chip">
              {t}
              <input type="hidden" name="tags" value={t} />
              <button type="button" aria-label={`Remove ${t}`} onClick={() => setTraits(traits.filter((x) => x !== t))}>
                <X />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={`${listId}-in`}
        className="field-in"
        name="traitDraft"
        list={listId}
        value={draft}
        maxLength={60}
        autoComplete="off"
        placeholder={traits.length ? 'Add another' : 'Like Black hair, Left-handed or Musical'}
        onChange={(e) => {
          const v = e.target.value
          // A comma finishes a trait, so a list can be typed in one go
          if (v.includes(',')) {
            v.split(',').slice(0, -1).forEach((t) => t.trim() && add(t))
            setDraft(v.slice(v.lastIndexOf(',') + 1))
          } else setDraft(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && traits.length) setTraits(traits.slice(0, -1))
        }}
      />
      <datalist id={listId}>
        {suggestions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <span className="help">Shared by family? Click a trait on {first}'s card to see who else has it.</span>
    </div>
  )
}
