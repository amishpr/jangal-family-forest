import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { firstNameOf, toast } from '../../app/actions'
import { sideClass, useHome, useIndex, useSides, useTitles } from '../../app/derive'
import { relation } from '../../core/kinship'
import { familyTitle } from '../../core/titles'
import { deletePreview, setParentOf, updatePerson } from '../../core/edit'
import type { ChildKind, Family, FamilyStatus, Gender, Person } from '../../core/model'
import { fullName, GENDER_LABELS, isDeceased, isPet } from '../../core/model'
import { undo, useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import { Camera, Check, Trash, X } from '../../ui/icons'
import { PartialDateField } from './PartialDateField'
import { readPartialDate } from './readPartialDate'
import { PhotoInput } from './PhotoInput'
import { TraitsField } from './TraitsField'
import { cleanTraits } from '../../core/traits'

// The person card in edit mode (PLAN P-1 to P-7, R-3, R-4). One Save is one undo step, covering
// the person, their links to parents and partners, and whether they're marked as you.

const PhotoCropper = lazy(() => import('./PhotoCropper'))

const GENDERS = Object.entries(GENDER_LABELS) as [Gender, string][]
const KINDS: [ChildKind, string][] = [
  ['biological', 'Birth parents'],
  ['adopted', 'Adoptive parents'],
  ['step', 'Step parents'],
  ['foster', 'Foster parents'],
  ['unknown', 'Not sure'],
]
// What a partnership's start and end are called, by its status
const STARTED: Record<FamilyStatus, string> = {
  married: 'Married on',
  partners: 'Together since',
  engaged: 'Engaged on',
  divorced: 'Married on',
  separated: 'Together since',
  widowed: 'Married on',
}
const ENDED_LABEL: Partial<Record<FamilyStatus, string>> = { divorced: 'Divorced on', separated: 'Separated on', widowed: 'Widowed on' }
const ENDED = new Set<FamilyStatus>(['divorced', 'separated', 'widowed'])

const STATUSES: [FamilyStatus, string][] = [
  ['married', 'Married'],
  ['partners', 'Partners'],
  ['engaged', 'Engaged'],
  ['divorced', 'Divorced'],
  ['separated', 'Separated'],
  ['widowed', 'Widowed'],
]

const grow = (ta: HTMLTextAreaElement) => {
  ta.style.height = 'auto'
  ta.style.height = `${Math.min(220, Math.max(72, ta.scrollHeight + 4))}px`
}

export default function CardEdit({ person: p }: { person: Person }) {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const titles = useTitles()
  const [gender, setGender] = useState<Gender>(p.gender ?? 'unknown')
  const [dead, setDead] = useState(isDeceased(p))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  // Each partnership's status as chosen in the form, which decides what its dates are called
  const [statuses, setStatuses] = useState<Record<string, FamilyStatus>>({})
  const firstRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true })
    if (notesRef.current) grow(notesRef.current)
  }, [])

  if (!ix || !sides) return null
  const id = p.id
  const side = sideClass(sides, id)
  const isMe = home === id
  // A pet's card is shorter: its name, kind, dates, photo and notes (TODO.md PT-5)
  const pet = isPet(p)
  const hp = home && home !== id ? ix.person(home) : null
  // The word that shows when nothing is typed (TODO.md CT-1): what they're called today, from the
  // point of view of whoever is marked as you, without their own words
  const auto = hp ? (familyTitle(ix, home!, id, titles) ?? relation(ix, home!, id).label.replace(/^./, (c) => c.toUpperCase())) : ''
  const first = p.firstName || 'them'
  const meHelp = isMe
    ? 'Turn off to view the tree neutrally.'
    : hp
      ? `Replaces ${hp.firstName}. Labels and colors will follow ${first}.`
      : `Labels and colors will follow ${first}.`
  const bf = ix.birthFamilyOf(id)
  const birthFam = bf ? ix.family(bf) : undefined
  const parents = bf ? ix.parentsOf(id) : []
  const partnerships = ix.familiesOf(id).map((fid) => ix.family(fid)!).filter((f) => f.partnerIds.length === 2)
  // A partner's children: the couple's own, and any from the partner's single parent family. Ticked
  // means this person is their parent, unticked their step parent.
  const partnerKids = (fam: Family) => {
    const other = fam.partnerIds.find((x) => x !== id)!
    const solo = ix.familiesOf(other).map((fid) => ix.family(fid)!).filter((f) => f.partnerIds.length === 1)
    return [...new Set([...fam.children, ...solo.flatMap((f) => f.children)].map((c) => c.personId))].filter((c) => c !== id)
  }

  // Dates that don't add up (PLAN R-9). They're only warnings: records are sometimes wrong.
  const born = p.birth?.date?.year
  const dateWarnings = born
    ? [
        ...ix
          .parentsOf(id)
          .map((pid) => ix.person(pid)!)
          .filter((par) => par.birth?.date?.year && par.birth.date.year >= born)
          .map((par) => `Born in or before the year their parent ${par.firstName} was (${par.birth!.date!.year})`),
        ...ix
          .childrenOf(id)
          .map((cid) => ix.person(cid)!)
          .filter((c) => c.birth?.date?.year && c.birth.date.year <= born)
          .map((c) => `Their child ${c.firstName} was born in ${c.birth!.date!.year}, before them or in the same year`),
      ]
    : []
  const toView = () => useUi.getState().openCard(id, 'view')
  // Someone just added to be named here goes away again if you back out
  const cancel = () => {
    if (useUi.getState().card?.fresh) {
      useUi.getState().closeCard()
      undo()
      toast('Removed the empty person')
    } else toView()
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const text = (k: string) => String(f.get(k) ?? '').trim()
    const birth = readPartialDate(f, 'birth')
    const death = readPartialDate(f, 'death')
    const errs: Record<string, string> = {}
    if (!text('firstName')) errs.firstName = 'Add a first name, or a word for them like "Grandma"'
    if (birth.error) errs.birth = birth.error
    if (dead && death.error) errs.death = death.error
    if (!errs.birth && !errs.death && dead && birth.date?.year && death.date?.year && death.date.year < birth.date.year) {
      errs.death = 'The date of passing is before the birthday'
    }
    // A partnership's dates, like a wedding day (TODO.md F16). A typo is an error, so it can't wipe
    // the date that's there.
    const famDates = new Map(partnerships.map((fam) => [fam.id, { start: readPartialDate(f, `start.${fam.id}`), end: readPartialDate(f, `end.${fam.id}`) }]))
    for (const [fid, d] of famDates) {
      if (d.start.error) errs[`start.${fid}`] = d.start.error
      if (d.end.error) errs[`end.${fid}`] = d.end.error
      if (!d.start.error && !d.end.error && d.start.date?.year && d.end.date?.year && d.end.date.year < d.start.date.year) {
        errs[`end.${fid}`] = 'This is before the start'
      }
    }
    setErrors(errs)
    if (Object.keys(errs).length) return

    const g = (f.get('gender') as Gender) || 'unknown'
    const birthPlace = text('birthPlace')
    const deathPlace = text('deathPlace')
    const patch: Partial<Person> = {
      firstName: text('firstName'),
      middleName: text('middleName') || undefined,
      lastName: text('lastName') || undefined,
      nickname: text('nickname') || undefined,
      calledBy: text('calledBy') || undefined,
      birthSurname: text('birthSurname') || undefined,
      gender: g,
      genderOther: g === 'other' ? text('genderOther') || undefined : undefined,
      birth: birth.date || birthPlace ? { ...(birth.date ? { date: birth.date } : {}), ...(birthPlace ? { place: birthPlace } : {}) } : undefined,
      death: dead && (death.date || deathPlace) ? { ...(death.date ? { date: death.date } : {}), ...(deathPlace ? { place: deathPlace } : {}) } : undefined,
      deceased: dead || undefined,
      livesIn: dead ? undefined : text('livesIn') || undefined,
      notes: String(f.get('notes') ?? '').replace(/\s+$/, '') || undefined,
      // The chips, plus anything still typed in the box
      tags: cleanTraits(ix, [...f.getAll('tags'), ...String(f.get('traitDraft') ?? '').split(',')].map(String)),
    }
    if (pet) {
      for (const k of ['middleName', 'nickname', 'calledBy', 'birthSurname', 'gender', 'genderOther', 'livesIn', 'tags'] as const) delete patch[k]
      patch.species = text('species') || 'Pet'
    }
    // What whoever is marked as you calls them, kept apart from everyone else's words
    if (hp && !pet) {
      const from = { ...p.calledByFrom }
      if (text('calledByMe')) from[home!] = text('calledByMe')
      else delete from[home!]
      patch.calledByFrom = Object.keys(from).length ? from : undefined
    }
    const wantMe = f.get('me') === 'on'
    const kind = f.get('parentKind') as ChildKind | null
    let notMoved: string | undefined
    const r = useTree.getState().edit((d) => {
      const res = updatePerson(d, id, patch)
      if (!res.ok) return res
      if (bf && kind && d.families[bf]) {
        const link = d.families[bf].children.find((c) => c.personId === id)
        if (link && link.kind !== kind) link.kind = kind
      }
      for (const fam of partnerships) {
        const df = d.families[fam.id]
        if (!df) continue
        const status = f.get(`status.${fam.id}`) as FamilyStatus | null
        if (status) df.status = status
        const dates = famDates.get(fam.id)!
        if (dates.start.date) df.start = dates.start.date
        else delete df.start
        if (dates.end.date) df.end = dates.end.date
        else delete df.end
        const parentOf = new Set(f.getAll(`parentOf.${fam.id}`).map(String))
        for (const kid of partnerKids(fam)) {
          const was = fam.children.some((c) => c.personId === kid)
          if (parentOf.has(kid) === was) continue
          const moved = setParentOf(d, fam.id, id, kid, !was)
          if (!moved.ok) notMoved ??= `${firstNameOf(kid)} stays as before: ${moved.reason}`
        }
      }
      if (wantMe !== isMe) d.homePersonId = wantMe ? id : null
      return res
    })
    if (!r.ok) {
      toast(r.reason)
      return
    }
    const meNow = wantMe !== isMe
    toast(
      notMoved ? `Saved. ${notMoved}` : meNow ? (wantMe ? `Saved. You are now ${patch.firstName}` : 'Saved. Viewing the tree neutrally') : 'Saved',
      { label: 'Undo', run: () => undo() },
    )
    toView()
  }

  const remove = () => {
    const name = fullName(p)
    const r = useTree.getState().removePerson(id)
    if (!r.ok) return toast(r.reason)
    useUi.getState().closeCard()
    toast(`Removed ${name}`, { label: 'Undo', run: () => undo() })
  }

  if (cropFile) {
    return (
      <div className="pop-in">
        <div className="pop-head">
          <div className="top">
            <div>
              <h3 id="pop-title">Photo of {first}</h3>
              <div className="gline">Drag to move it, and zoom to fit their face in the circle</div>
            </div>
          </div>
        </div>
        <Suspense fallback={<div className="pop-body">Opening the photo</div>}>
          <PhotoCropper file={cropFile} personId={id} onDone={() => setCropFile(null)} />
        </Suspense>
      </div>
    )
  }

  const fieldErr = (k: string) =>
    errors[k] ? (
      <span className="field-err" role="alert">
        {errors[k]}
      </span>
    ) : null

  return (
    <form
      className="pop-in"
      onSubmit={onSubmit}
      noValidate
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        if (useUi.getState().card?.fresh) cancel()
        else useUi.getState().closeCard()
      }}
    >
      <div className="pop-head">
        <div className="top">
          <PhotoInput personId={id} className="photo-pick" onPick={setCropFile}>
            <Avatar person={p} size={74} side={side} large title="Change photo">
              <span className="cam">
                <Camera />
              </span>
            </Avatar>
          </PhotoInput>
          <div>
            <h3 id="pop-title">Edit {p.firstName || 'this person'}</h3>
            <div className="gline">
              Tap the photo to change it
              {p.photoId && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="linkbtn"
                    style={{ color: 'var(--ink-3)', fontSize: 12.5 }}
                    onClick={() => useTree.getState().updatePerson(id, { photoId: undefined })}
                  >
                    Remove photo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="round x"
          aria-label="Close without saving"
          onClick={() => (useUi.getState().card?.fresh ? cancel() : useUi.getState().closeCard())}
        >
          <X />
        </button>
      </div>
      <div className="pop-body">
        <div className="fields">
          {!pet && (
            <label className="me-toggle">
              <input type="checkbox" name="me" defaultChecked={isMe} />
              <span className="knob" />
              <span>
                <b>This is me</b>
                <small>{meHelp}</small>
              </span>
            </label>
          )}
          <div className="two">
            <label>
              First name
              <input ref={firstRef} className="field-in" name="firstName" maxLength={120} defaultValue={p.firstName} aria-invalid={!!errors.firstName} autoComplete="off" />
              {fieldErr('firstName')}
            </label>
            <label>
              Last name
              <input className="field-in" name="lastName" maxLength={120} defaultValue={p.lastName ?? ''} autoComplete="off" />
            </label>
          </div>
          {pet ? (
            <label>
              Kind of pet
              <input className="field-in" name="species" maxLength={40} defaultValue={p.species === 'Pet' ? '' : p.species} placeholder="Dog, cat, parrot" autoComplete="off" />
            </label>
          ) : (
            <>
            <div className="two">
              <label>
                Middle name
                <input className="field-in" name="middleName" maxLength={120} defaultValue={p.middleName ?? ''} autoComplete="off" />
              </label>
              <label>
                Goes by
                <input className="field-in" name="nickname" maxLength={120} defaultValue={p.nickname ?? ''} placeholder="A nickname" autoComplete="off" />
              </label>
            </div>
            <label>
              Birth surname
              <input className="field-in" name="birthSurname" maxLength={120} defaultValue={p.birthSurname ?? ''} placeholder="If it changed" autoComplete="off" />
            </label>
            <fieldset className="fl" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, marginBottom: 4 }}>What they're called</legend>
              <div className={hp ? 'two' : undefined}>
                <label>
                  <small>Everyone calls them</small>
                  <input className="field-in" name="calledBy" maxLength={40} defaultValue={p.calledBy ?? ''} placeholder={auto || 'Like Moti Ba'} autoComplete="off" />
                </label>
                {hp && (
                  <label>
                    <small>{hp.firstName || 'You'} calls them</small>
                    <input className="field-in" name="calledByMe" maxLength={40} defaultValue={p.calledByFrom?.[home!] ?? ''} placeholder={p.calledBy || auto} autoComplete="off" />
                  </label>
                )}
              </div>
            </fieldset>
            <div className="fl">
              Gender
              <div className="gseg" role="radiogroup" aria-label="Gender">
                {GENDERS.map(([k, label]) => (
                  <label key={k}>
                    <input type="radio" name="gender" value={k} checked={gender === k} onChange={() => setGender(k)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {gender === 'other' && (
              <label>
                How they describe it (optional)
                <input className="field-in" name="genderOther" maxLength={80} defaultValue={p.genderOther ?? ''} placeholder="For example, nonbinary" />
              </label>
            )}
            <p className="help">Unknown and Other use neutral words, like sibling and parent.</p>
            </>
          )}
          <PartialDateField name="birth" label="Birthday" value={p.birth?.date} error={errors.birth} />
          {dateWarnings.map((w) => (
            <p key={w} className="help" style={{ color: 'var(--danger)' }}>
              {w}. Check the dates.
            </p>
          ))}
          <label>
            Born in
            <input className="field-in" name="birthPlace" maxLength={200} defaultValue={p.birth?.place ?? ''} placeholder="Town, country" autoComplete="off" />
          </label>
          {!dead && !pet && (
            <label>
              Lives in
              <input className="field-in" name="livesIn" maxLength={200} defaultValue={p.livesIn ?? ''} placeholder="Town, country" autoComplete="off" />
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={dead} onChange={(e) => setDead(e.target.checked)} />
            Has passed away
          </label>
          {dead && (
            <>
              <PartialDateField name="death" label="Date of passing" value={p.death?.date} error={errors.death} />
              <label>
                Place of passing
                <input className="field-in" name="deathPlace" maxLength={200} defaultValue={p.death?.place ?? ''} autoComplete="off" />
              </label>
            </>
          )}
          <label>
            Notes
            <textarea
              ref={notesRef}
              className="field-in"
              name="notes"
              maxLength={20_000}
              defaultValue={p.notes ?? ''}
              placeholder={`A few words about ${first}: what they did, what they were like`}
              onInput={(e) => grow(e.currentTarget)}
            />
          </label>
          {!pet && <TraitsField initial={p.tags ?? []} first={first} />}

          {!pet && birthFam && parents.length > 0 && (
            <label>
              {first}'s parents here ({parents.map((x) => firstNameOf(x)).join(' and ')}) are
              <select
                className="field-in"
                name="parentKind"
                defaultValue={birthFam.children.find((c) => c.personId === id)?.kind ?? 'biological'}
              >
                {KINDS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {partnerships.map((fam) => {
            const other = fam.partnerIds.find((x) => x !== id)!
            const kids = partnerKids(fam)
            const status = statuses[fam.id] ?? fam.status ?? 'married'
            return (
              <fieldset key={fam.id} className="fl" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <legend style={{ padding: 0, marginBottom: 4 }}>With {firstNameOf(other)}</legend>
                <select
                  className="field-in"
                  name={`status.${fam.id}`}
                  value={status}
                  onChange={(e) => setStatuses({ ...statuses, [fam.id]: e.target.value as FamilyStatus })}
                  aria-label={`Partnership with ${firstNameOf(other)}`}
                >
                  {STATUSES.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <PartialDateField name={`start.${fam.id}`} label={STARTED[status]} value={fam.start} error={errors[`start.${fam.id}`]} />
                {(ENDED.has(status) || fam.end) && <PartialDateField name={`end.${fam.id}`} label={ENDED_LABEL[status] ?? 'Until'} value={fam.end} error={errors[`end.${fam.id}`]} />}
                {kids.length > 0 && (
                  <div className="choices" role="group" aria-label={`Who ${first} is a parent of`}>
                    <span>{first} is a parent of</span>
                    {kids.map((k) => (
                      <label key={k} className="check">
                        <input type="checkbox" name={`parentOf.${fam.id}`} value={k} defaultChecked={fam.children.some((c) => c.personId === k)} />
                        {firstNameOf(k)}
                      </label>
                    ))}
                    <p className="help">Untick anyone {first} is a step parent to.</p>
                  </div>
                )}
              </fieldset>
            )
          })}

          <div className="danger-zone">
            {confirmRemove ? (
              <div className="confirm" role="alert">
                <span>Remove {fullName(p)} from the tree?</span>
                {deletePreview(ix, id, home).length > 0 && (
                  <ul>
                    {deletePreview(ix, id, home).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>You can undo this.</span>
                <div className="row">
                  <button type="button" className="chunky danger" onClick={remove}>
                    <Trash />
                    Remove
                  </button>
                  <button type="button" className="chunky" onClick={() => setConfirmRemove(false)}>
                    Keep {first}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="linkbtn" onClick={() => setConfirmRemove(true)}>
                Remove {p.firstName || 'this person'} from the tree
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="pop-foot">
        <div className="row">
          <button type="submit" className="chunky go">
            <Check />
            Save
          </button>
          <button type="button" className="chunky" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
