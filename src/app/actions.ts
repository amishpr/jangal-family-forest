import type { AddOptions, RelativeType } from '../core/edit'
import { guessGender, updatePerson } from '../core/edit'
import { indexOf } from '../core/index'
import type { Person } from '../core/model'
import { readPartialDate } from '../features/person/readPartialDate'
import { traitKey } from '../core/traits'
import { findPath } from '../core/path'
import { editQuietly, undo, useTree } from '../store/treeStore'
import { useUi } from '../store/uiStore'
import { flyToPeople, panToNew, reduceMotion, tileRect } from '../features/canvas/camera'
import { tabGoTo } from './nav'

// Things people do that touch more than one part of the screen. Components call these instead of
// reaching into several stores themselves.

export const toast = (message: string, action?: { label: string; run: () => void }) =>
  useUi.getState().showToast(message, action)

const undoAction = { label: 'Undo', run: () => undo() }

/**
 * Adds a new relative and names them right on their new tile (PLAN C-4). Their gender starts as a
 * guess where there's a good one (a second parent, a partner), which the quick-add card shows
 * selected (TODO.md F1). It's part of the same undo step.
 */
export function sproutRelative(id: string, type: RelativeType, opts?: AddOptions) {
  const ui = useUi.getState()
  ui.closeCard()
  if (ui.naming) finishNaming(true)
  if (ui.tab !== 'tree') ui.setTab('tree')
  const doc = useTree.getState().doc
  const gender = doc && guessGender(indexOf(doc), id, type)
  const r = useTree.getState().addRelative(id, type, gender ? { ...opts, fields: { gender, ...opts?.fields } } : opts)
  if (!r.ok) {
    toast(r.reason)
    return
  }
  ui.setNaming(r.id, { id, type })
  // The camera holds still while you fill in the card, and moves once it's saved (TODO.md F13)
  requestAnimationFrame(() => panToNew(r.id))
}

/**
 * Saves what was typed on a new tile's quick-add card (the name and the birthday), or takes the
 * empty tile away again. The gender was saved as soon as it was picked.
 */
export function finishNaming(save: boolean, typed?: string) {
  const ui = useUi.getState()
  const id = ui.naming
  if (!id) return
  const form = document.querySelector<HTMLFormElement>(`form[data-quick-for="${CSS.escape(id)}"]`)
  const fields = form ? new FormData(form) : null
  const value = (typed ?? String(fields?.get('name') ?? '')).trim()
  const birth = fields ? readPartialDate(fields, 'birth') : {}
  const from = ui.namingFrom?.id
  ui.setNaming(null)
  if (!save || !value) {
    // The first tile of a new tree (you) stays: there's no earlier step to go back to
    if (!useTree.temporal.getState().pastStates.length) return
    undo()
    toast('Removed the empty tile')
    return
  }
  const parts = value.split(/\s+/)
  const current = useTree.getState().doc?.people[id]
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]
  const lastName = parts.length > 1 ? parts[parts.length - 1] : current?.lastName
  const patch: Partial<Person> = { firstName, lastName }
  if (birth.date) patch.birth = { ...current?.birth, date: birth.date }
  // A kind of pet typed in the box wins over the choices (TODO.md F14)
  const species = String(fields?.get('species') ?? '').trim()
  if (species && current?.species) patch.species = species
  // Folded into the same undo step as adding the tile
  editQuietly((d) => updatePerson(d, id, patch))
  // Once the card has closed and the tree settled, show the new person beside the one they were
  // added to (TODO.md CW-2). Not if another quick add opened in the meantime.
  if (from) setTimeout(() => !useUi.getState().naming && flyToPeople([from, id], { maxK: 1, duration: 500 }), reduceMotion() ? 0 : 400)
  // The card keeps bad dates from being saved. Only a click elsewhere gets here with one.
  if (birth.error) {
    toast(`Added ${value}. The birthday wasn't saved: ${birth.error}`, { label: 'Add details', run: () => useUi.getState().openCard(id, 'edit', tileRect(id)) })
    return
  }
  const doc = useTree.getState().doc
  // A brand new tree: point at the next step (PLAN S1)
  if (doc && Object.keys(doc.people).length === 1) {
    const touch = matchMedia('(hover: none)').matches
    toast(touch ? 'Next, tap your tile and use + to add your parents' : 'Next, hover your tile and press + Parent', {
      label: 'Add details',
      run: () => useUi.getState().openCard(id, 'edit', tileRect(id)),
    })
    return
  }
  toast(`Added ${value}`, { label: 'Add details', run: () => useUi.getState().openCard(id, 'edit', tileRect(id)) })
}

/** Marks someone as you (replacing whoever was before), or null for the neutral view (PLAN P-7) */
export function setMe(id: string | null, opts: { fromForm?: boolean } = {}) {
  const tree = useTree.getState()
  const doc = tree.doc
  if (!doc) return
  const prev = doc.homePersonId
  if (prev === id) return
  if (id && doc.people[id]?.species) return toast("A pet can't be marked as you")
  tree.setHome(id)
  const ui = useUi.getState()
  if (ui.readOnly) rememberViewerMe(doc.id, id)
  ui.setPath(null)
  const rel = ui.relate
  if (rel.a === prev) ui.setRelate({ a: id, picking: id ? rel.picking : 'a' })
  const p = id ? doc.people[id] : null
  const pp = prev ? doc.people[prev] : null
  const msg = p ? `You are now ${p.firstName}${pp ? `, instead of ${pp.firstName}` : ''}` : 'Viewing the tree neutrally'
  toast(`${opts.fromForm ? 'Saved. ' : ''}${msg}`, undoAction)
  if (!opts.fromForm) {
    ui.closeCard()
    ui.openSheet(null)
    if (id) requestAnimationFrame(() => pingPerson(id))
  }
}

/** A ring that pings twice around someone's tile, so you can see where they are */
export function pingPerson(id: string) {
  const el = document.querySelector(`.tile[data-id="${CSS.escape(id)}"]`)
  if (!el) return
  el.classList.remove('ping')
  void (el as HTMLElement).offsetWidth
  el.classList.add('ping')
  setTimeout(() => el.classList.remove('ping'), 2300)
}

/** Opens whatever hides someone, then flies to them */
export function showPerson(id: string) {
  const tree = useTree.getState()
  tree.reveal(id)
  requestAnimationFrame(() => {
    flyToPeople([id], { maxK: 1, duration: reduceMotion() ? 0 : 650 })
    pingPerson(id)
  })
}

export function firstNameOf(id: string | null | undefined) {
  const doc = useTree.getState().doc
  return (id && doc?.people[id]?.firstName) || 'Someone'
}

export function indexNow() {
  const doc = useTree.getState().doc
  return doc ? indexOf(doc) : null
}

/** Lights the path between two people and flies to fit it, leaving room for the open sheet (PLAN C-6) */
export function showPath(a: string, b: string) {
  const ui = useUi.getState()
  const tree = useTree.getState()
  const doc = tree.doc
  if (!doc || a === b) {
    ui.setPath(null)
    return
  }
  const ix = indexOf(doc)
  const path = findPath(ix, a, b)
  if (!path) {
    ui.setPath(null)
    return
  }
  // Open any tucked away branch the path runs through (PLAN S-4)
  for (const id of path.persons) tree.reveal(id)
  ui.setPath({ a, b })
  if (ui.tab === 'tree') requestAnimationFrame(() => requestAnimationFrame(() => flyToPeople(path.persons, { maxK: 1, focus: b })))
}

/** "How we're related" from a person's card: you and them, or them and someone you pick */
export function relateWith(id: string) {
  const ui = useUi.getState()
  const home = useTree.getState().doc?.homePersonId ?? null
  ui.closeCard()
  if (home && home !== id) ui.setRelate({ a: home, b: id, picking: null })
  else ui.setRelate({ a: id, b: null, picking: 'b' })
  ui.openSheet('relate')
  if (home && home !== id) showPath(home, id)
  else ui.setPath(null)
}

/** Find flies to someone in whatever view is open (PLAN A-7) */
export function goTo(id: string) {
  const ui = useUi.getState()
  ui.openSheet(null)
  ui.closeCard()
  const custom = tabGoTo[ui.tab]
  if (ui.tab !== 'tree' && custom) {
    custom(id)
    return
  }
  const home = useTree.getState().doc?.homePersonId
  if (home && id !== home) {
    showPath(home, id)
    setTimeout(() => pingPerson(id), 700)
  } else {
    ui.setPath(null)
    showPerson(id)
  }
}

/** The exported page remembers who you are in your own browser, never in the file (PLAN E-3) */
export const viewerMeKey = (treeId: string) => `jangal-viewer:${treeId}:me`
function rememberViewerMe(treeId: string, id: string | null) {
  try {
    localStorage.setItem(viewerMeKey(treeId), id ?? 'none')
  } catch {
    // Private mode: it just isn't remembered
  }
}

/** Lights everyone with a trait on the tree, and the lines it ran down (TODO.md TR-5) */
export function showTrait(trait: string) {
  const ui = useUi.getState()
  ui.closeCard()
  ui.openSheet(null)
  ui.setPath(null)
  if (ui.tab !== 'tree') ui.setTab('tree')
  ui.setTrait(trait)
  const doc = useTree.getState().doc
  if (!doc) return
  const ids = Object.values(doc.people).filter((p) => p.tags?.some((t) => traitKey(t) === traitKey(trait))).map((p) => p.id)
  if (ids.length) requestAnimationFrame(() => flyToPeople(ids, { maxK: 1, bottom: 170, duration: 500 }))
}
