import { useMemo, useState } from 'react'
import { sproutRelative, toast } from '../../app/actions'
import { sideClass, useIndex, useSides } from '../../app/derive'
import { yearsLabel } from '../../core/dates'
import type { AddOptions, RelativeType } from '../../core/edit'
import { childFamiliesFor } from '../../core/edit'
import type { ChildKind, Person } from '../../core/model'
import { fullName } from '../../core/model'
import { searchPeople } from '../../core/search'
import { undo, useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import { Plus } from '../../ui/icons'

// Adding to someone's family from their card (PLAN R-2, R-5, 8.4). Works on touch screens, where
// there's no hover for the + buttons, and covers the choices the quick + buttons skip: a half
// sibling, which family a child belongs to, adoption, and linking someone already in the tree.

const TYPES: [RelativeType, string][] = [
  ['parent', 'Parent'],
  ['partner', 'Partner'],
  ['child', 'Child'],
  ['sibling', 'Sibling'],
  ['pet', 'Pet'],
]

export function AddPanel({ person: p, onDone }: { person: Person; onDone: () => void }) {
  const ix = useIndex()
  const sides = useSides()
  const [type, setType] = useState<RelativeType>('child')
  const [variant, setVariant] = useState<string>('')
  const [kind, setKind] = useState<ChildKind>('biological')
  const [query, setQuery] = useState('')
  const first = p.firstName || 'them'

  const options = useMemo(() => {
    if (!ix) return []
    // A pet belongs to a family the way a child does
    if (type === 'child' || type === 'pet') {
      const fams = childFamiliesFor(ix, p.id)
      const opts = fams.map((f) => {
        const others = f.partnerIds.filter((x) => x !== p.id).map((x) => ix.person(x)!.firstName)
        const ex = f.status === 'divorced' || f.status === 'separated'
        return { value: f.id, label: others.length ? `With ${others.join(' and ')}${ex ? ' (former partner)' : ''}` : 'With no other parent recorded' }
      })
      if (!fams.some((f) => f.partnerIds.length === 1)) opts.push({ value: 'solo', label: 'With someone not in the tree' })
      return opts
    }
    if (type === 'sibling') {
      const parents = ix.parentsOf(p.id)
      if (parents.length < 2) return []
      const names = parents.map((x) => ix.person(x)!.firstName)
      return [
        { value: '', label: `Same parents (${names.join(' and ')})` },
        ...parents.map((x) => ({ value: x, label: `Half sibling through ${ix.person(x)!.firstName}` })),
      ]
    }
    return []
  }, [ix, p.id, type])

  if (!ix || !sides) return null
  const full = type === 'parent' && ix.parentsOf(p.id).length >= 2
  const chosen = variant || options[0]?.value || ''
  const opts: AddOptions = {
    ...(type === 'child' ? { familyId: chosen || undefined, kind } : {}),
    ...(type === 'pet' ? { familyId: chosen || undefined } : {}),
    ...(type === 'sibling' && chosen ? { halfWith: chosen } : {}),
  }

  const matches = query.trim() ? searchPeople(ix, query).filter((m) => m.id !== p.id).slice(0, 5) : []

  const link = (otherId: string) => {
    const r = useTree.getState().linkExisting(p.id, type, otherId, opts)
    if (!r.ok) {
      toast(r.reason)
      return
    }
    const other = ix.person(otherId)!
    toast(`Linked ${other.firstName} as ${first}'s ${type}`, { label: 'Undo', run: () => undo() })
    onDone()
    useUi.getState().openCard(p.id, 'view')
  }

  return (
    <section className="addpanel" aria-label={`Add to ${first}'s family`}>
      <h4>Add to {first}'s family</h4>
      <div className="gseg" role="radiogroup" aria-label="Relationship">
        {TYPES.map(([t, label]) => (
          <label key={t}>
            <input
              type="radio"
              name="add-type"
              value={t}
              checked={type === t}
              onChange={() => {
                setType(t)
                setVariant('')
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {options.length > 1 && (
        <div className="choices" role="radiogroup" aria-label={type === 'sibling' ? 'Which parents' : 'Which family'}>
          {options.map((o) => (
            <label key={o.value || 'same'} className="check">
              <input type="radio" name="add-variant" checked={chosen === o.value} onChange={() => setVariant(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {type === 'child' && (
        <label className="fl">
          Link
          <select className="field-in" value={kind} onChange={(e) => setKind(e.target.value as ChildKind)}>
            <option value="biological">Birth child</option>
            <option value="adopted">Adopted</option>
            <option value="step">Stepchild</option>
            <option value="foster">Foster child</option>
          </select>
        </label>
      )}
      {full ? (
        <p className="help">{first} already has two parents.</p>
      ) : (
        <>
          <button type="button" className="chunky go" onClick={() => sproutRelative(p.id, type, opts)}>
            <Plus />
            Add someone new
          </button>
          <label className="fl">
            Or someone already in the tree
            <input
              className="field-in"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              autoComplete="off"
            />
          </label>
          {matches.length > 0 && (
            <div className="results">
              {matches.map((m) => {
                const o = ix.person(m.id)!
                return (
                  <button key={m.id} type="button" className="res" onClick={() => link(m.id)}>
                    <Avatar person={o} size={36} side={sideClass(sides, m.id)} />
                    <span>
                      <b>{fullName(o)}</b>
                      <span>{yearsLabel(o)}</span>
                    </span>
                    <em>Link as {type}</em>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
