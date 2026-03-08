import { useEffect, useId, useMemo, useState } from 'react'
import { goTo, showTrait } from '../../app/actions'
import { lineOf, relationTo, sideClass, titleLangOf, useHome, useIndex, useSides, useTitles } from '../../app/derive'
import { yearsLabel } from '../../core/dates'
import { fullName } from '../../core/model'
import { searchPeople } from '../../core/search'
import { allTraits, traitKey } from '../../core/traits'
import { useUi } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import { Sheet } from '../sheets/Sheet'

// Find someone (PLAN S-1 to S-4). Fuzzy search on names, nicknames, maiden names, birthplaces,
// years and traits. Arrowing through the results previews the path from you on the tree behind the
// sheet. Enter closes the sheet, flies to fit the path, and keeps it highlighted. The tree's traits
// sit under the box, and one that matches what's typed is offered first: either lights everyone who
// has it (TODO.md TR-4).

export default function FindSheet() {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const titles = useTitles()
  const tab = useUi((s) => s.tab)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const results = useMemo(() => (ix && q.trim() ? searchPeople(ix, q, 8) : []), [ix, q])
  const current = results[Math.min(active, results.length - 1)]?.id
  const traits = useMemo(() => (ix ? allTraits(ix) : []), [ix])
  const typed = traitKey(q)
  const traitMatches = typed.length >= 3 ? traits.filter((t) => traitKey(t.name).includes(typed)).slice(0, 3) : []

  // Preview the path to the highlighted result (S-3)
  useEffect(() => {
    if (tab !== 'tree' || !home) return
    const ui = useUi.getState()
    if (current && current !== home) ui.setPath({ a: home, b: current })
    else ui.setPath(null)
  }, [current, home, tab])

  if (!ix || !sides) return null
  return (
    <Sheet title="Find someone" label="Find someone">
      <input
        className="find-in"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={current ? `${listId}-${current}` : undefined}
        aria-autocomplete="list"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
        }}
        placeholder={traits.length ? 'Name, birthplace, year, or trait' : 'Name, birthplace, or year'}
        aria-label={traits.length ? 'Name, birthplace, year, or trait' : 'Name, birthplace, or year'}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(results.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter' && current) {
            e.preventDefault()
            goTo(current)
          }
        }}
      />
      {!q.trim() && traits.length > 0 && (
        <div className="trait-find">
          <h3 className="subhead">Traits in the family</h3>
          <ul className="trait-chips">
            {traits.slice(0, 12).map((t) => (
              <li key={t.name}>
                <button type="button" className="trait-chip" onClick={() => showTrait(t.name)}>
                  {t.name} <span>{t.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {traitMatches.map((t) => (
        <button key={t.name} type="button" className="chunky trait-go" onClick={() => showTrait(t.name)}>
          Show everyone with {t.name} ({t.count}) on the tree
        </button>
      ))}
      <div className="results" role="listbox" id={listId} aria-label="People">
        {q.trim() && !results.length && (
          <div className="none">Nobody by that name yet. Check the spelling, or add them from a tile's + buttons.</div>
        )}
        {results.map(({ id }, i) => {
          const p = ix.person(id)!
          const side = sideClass(sides, id)
          return (
            <button
              key={id}
              id={`${listId}-${id}`}
              type="button"
              role="option"
              aria-selected={i === active}
              data-selected={i === active}
              className={`res ${side}`}
              // Only a pointer that actually moves picks a row. Results appearing under a resting
              // pointer would otherwise steal the highlight from the keyboard.
              onPointerMove={() => i !== active && setActive(i)}
              onClick={() => goTo(id)}
            >
              <Avatar person={p} size={46} side={side} />
              <span>
                <b>{fullName(p)}</b>
                <span>
                  {[yearsLabel(p), p.birth?.place].filter(Boolean).join(', ')}
                </span>
              </span>
              <em lang={titleLangOf(ix, home, id, titles)}>{relationTo(ix, home, id, titles) ?? lineOf(sides, id)}</em>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
