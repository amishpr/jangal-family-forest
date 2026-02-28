import { useStore, type Node, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { finishNaming, sproutRelative } from '../../app/actions'
import { placeShort, sideClass, tagFor, titleLangOf, useHome, useIndex, useSides, useTitles } from '../../app/derive'
import { yearsLabel } from '../../core/dates'
import type { RelativeType } from '../../core/edit'
import { updatePerson } from '../../core/edit'
import type { Gender } from '../../core/model'
import { fullName, isDeceased, isPet } from '../../core/model'
import { editQuietly, useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import { Camera, Plus } from '../../ui/icons'
import { PartialDateField } from '../person/PartialDateField'
import { PhotoInput } from '../person/PhotoInput'
import { readPartialDate } from '../person/readPartialDate'
import { tileRect } from './camera'
import { pressTile } from './drag'

// One person on the canvas (PLAN 6.9): a 140 by 180 tile with their photo or leaf, name, how
// they're related to you, and their years. Hovering shows + buttons to add a relative right here.

export type TileNode = Node<Record<string, never>, 'person'>

const SPROUTS: [RelativeType, string][] = [
  ['parent', 'Parent'],
  ['sibling', 'Sibling'],
  ['partner', 'Partner'],
  ['child', 'Child'],
]

// Roughly where a name stops fitting on one line of a tile at 15.5 px
const LONG_NAME = 15

export const PersonTile = memo(function PersonTile({ id }: NodeProps<TileNode>) {
  const p = useTree((s) => s.doc?.people[id])
  const home = useHome()
  const ix = useIndex()
  const sides = useSides()
  const titles = useTitles()
  const naming = useUi((s) => s.naming === id)
  const readOnly = useUi((s) => s.readOnly)
  // The + buttons only exist on the tile under the pointer, which keeps big trees light to pan
  const hovered = useUi((s) => s.hover === id)
  if (!p || !ix || !sides) return null

  const cls = sideClass(sides, id)
  const name = fullName(p)
  const dead = isDeceased(p)
  const classes = ['tile', cls, home === id && 'home', dead && 'dead'].filter(Boolean).join(' ')

  // A new relative sprouts into place, and the tile opens into a small card for their name, gender
  // and birthday (PLAN 6.7, TODO.md F1). The tile keeps its place in the layout underneath.
  if (naming) {
    return (
      <div className={`tile sprouting quick ${cls}`} data-id={id}>
        <QuickAdd id={id} />
      </div>
    )
  }

  // Neutral view: the tag shows years and the small line shows where they were born
  const tag = tagFor(ix, home, id, titles)
  const sub = home ? yearsLabel(p) : placeShort(p.birth?.place)
  return (
    <div className={classes} data-id={id} onPointerDown={(e) => pressTile(e, id)}>
      <Avatar person={p} size={66} side={cls} />
      <div className={`nm ${name.length > LONG_NAME ? 'long' : ''}`}>{name}</div>
      <div className="tag" lang={titleLangOf(ix, home, id, titles)}>
        {tag}
      </div>
      <div className="yr">{sub}</div>
      {!readOnly && hovered && !isPet(p) && SPROUTS.map(([type, label]) => (
        <button
          key={type}
          type="button"
          className="sprout nopan nodrag"
          data-add={type}
          aria-label={`Add a ${type} of ${p.firstName || name}`}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            sproutRelative(id, type)
          }}
        >
          <Plus />
          {label}
        </button>
      ))}
    </div>
  )
})

// The kinds of pet quick add offers. Anything else can be typed (TODO.md PT-1).
const SPECIES = ['Dog', 'Cat', 'Bird']

const GENDERS: [Gender, string][] = [
  ['male', 'Man'],
  ['female', 'Woman'],
  ['other', 'Other'],
  ['unknown', 'Not sure'],
]

/** Quick add (TODO.md F1, mockup B): Enter saves from any field, Esc takes the new tile away again */
function QuickAdd({ id }: { id: string }) {
  const p = useTree((s) => s.doc?.people[id])
  const ix = useIndex()
  const home = useHome()
  const sides = useSides()
  const titles = useTitles()
  const from = useUi((s) => s.namingFrom)
  // The camera holds still while you type (TODO.md F13), so a zoomed out tree would make the card
  // too small to read. Below full size it's drawn at full size anyway, over its tile.
  const zoom = useStore((s) => s.transform[2])
  const [error, setError] = useState<string>()
  const name = useRef<HTMLInputElement>(null)
  // When the card itself was last pressed. Pressing a label or the photo moves focus to nothing
  // for a moment, which mustn't count as moving on.
  const pressed = useRef(0)
  useEffect(() => {
    name.current?.focus({ preventScroll: true })
  }, [])
  if (!p || !ix || !sides) return null
  const me = home === id
  const anchor = from && ix.person(from.id)?.firstName
  const heading = me ? 'Start with you' : from && anchor ? `New ${from.type} of ${anchor}` : 'Someone new'
  const tag = me ? '' : tagFor(ix, home, id, titles)
  // The first person in a new tree has nothing to undo back to
  const first = ix.ids.length === 1
  const save = (form: HTMLFormElement, more = false) => {
    const { error: bad } = readPartialDate(new FormData(form), 'birth')
    if (bad) return setError(bad)
    finishNaming(true)
    if (more) useUi.getState().openCard(id, 'edit', tileRect(id))
  }
  return (
    <form
      className="quick-card nopan nodrag nowheel"
      style={zoom < 1 ? { scale: String(1 / zoom) } : undefined}
      data-quick-for={id}
      aria-label={heading}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        save(e.currentTarget)
      }}
      onKeyDown={(e) => {
        // Keys typed here are for the form, not the canvas shortcuts
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          finishNaming(false)
        }
      }}
      onPointerDownCapture={() => {
        pressed.current = Date.now()
      }}
      onBlur={(e) => {
        // Clicking the photo or another field keeps the card open. Moving on with a name typed saves it.
        if (e.currentTarget.contains(e.relatedTarget as globalThis.Node | null) || Date.now() - pressed.current < 500) return
        if (name.current?.value.trim()) setTimeout(() => useUi.getState().naming === id && finishNaming(true), 150)
      }}
    >
      <div className="quick-head">
        <PhotoInput personId={id} className="photo-pick">
          <Avatar person={p} size={46} side={sideClass(sides, id)} title="Add a photo">
            <span className="cam">
              <Camera />
            </span>
          </Avatar>
        </PhotoInput>
        <span>
          <b>{heading}</b>
          {tag && <small>{tag}</small>}
        </span>
      </div>
      <input
        ref={name}
        name="name"
        className="nm-in"
        data-name-for={id}
        placeholder={me ? 'Your name' : 'Their name'}
        aria-label="Name"
        autoComplete="off"
        maxLength={240}
      />
      {isPet(p) ? (
        <div className="quick-pet">
          <div className="gseg" role="radiogroup" aria-label="Kind of pet">
            {SPECIES.map((s) => (
              <label key={s}>
                <input type="radio" name="speciesPick" checked={p.species === s} onChange={() => editQuietly((d) => updatePerson(d, id, { species: s }))} />
                <span>{s}</span>
              </label>
            ))}
          </div>
          <input name="species" className="field-in" placeholder="Or another kind" aria-label="Another kind of pet" maxLength={40} autoComplete="off" />
        </div>
      ) : (
      <div className="gseg" role="radiogroup" aria-label={me ? 'You are' : 'Gender'}>
        {GENDERS.map(([g, label]) => (
          <label key={g}>
            <input
              type="radio"
              name="gender"
              value={g}
              checked={(p.gender ?? 'unknown') === g}
              onChange={() => editQuietly((d) => updatePerson(d, id, { gender: g }))}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      )}
      <PartialDateField name="birth" label={me ? 'Your birthday' : 'Birthday'} error={error} />
      <div className="quick-foot">
        <span className="hint">{first ? 'Enter saves' : 'Enter saves · Esc undoes'}</span>
        <span className="btns">
          <button type="button" className="chunky" onClick={(e) => save(e.currentTarget.form!, true)}>
            More…
          </button>
          <button type="submit" className="chunky go">
            Save
          </button>
        </span>
      </div>
    </form>
  )
}
