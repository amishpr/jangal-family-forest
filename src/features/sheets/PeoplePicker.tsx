import { useMemo, useState } from 'react'
import { sideClass, useIndex, useSides } from '../../app/derive'
import { searchPeople } from '../../core/search'
import { Avatar } from '../../ui/Avatar'

// Everyone as faces, with a search box on top. Used to pick yourself, and to pick the two people
// in "How are we related?". Enter picks the first face.

type Props = {
  placeholder: string
  onPick: (id: string) => void
  exclude?: string | null
  current?: string | null
  autoFocus?: boolean
}

export function PeoplePicker({ placeholder, onPick, exclude, current, autoFocus }: Props) {
  const ix = useIndex()
  const sides = useSides()
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    if (!ix) return []
    const ids = q.trim() ? searchPeople(ix, q, 60).map((m) => m.id) : ix.ids
    return ids.filter((id) => id !== exclude)
  }, [ix, q, exclude])
  if (!ix || !sides) return null
  return (
    <div className="picker">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        data-autofocus={autoFocus ? '' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && list[0]) {
            e.preventDefault()
            onPick(list[0])
          }
        }}
      />
      <div className="faces">
        {list.map((id) => {
          const p = ix.person(id)!
          return (
            <button
              key={id}
              type="button"
              className={`face ${id === current ? 'is-me' : ''}`}
              aria-current={id === current ? 'true' : undefined}
              onClick={() => onPick(id)}
            >
              <Avatar person={p} size={46} side={sideClass(sides, id)} />
              {p.firstName || 'Someone'}
            </button>
          )
        })}
        {!list.length && <div className="none">Nobody by that name yet. Check the spelling.</div>}
      </div>
    </div>
  )
}
