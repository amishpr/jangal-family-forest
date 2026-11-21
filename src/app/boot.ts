import { nanoid } from 'nanoid'
import { anchorId, visibleSets } from '../core/collapse'
import { blankPerson } from '../core/edit'
import { indexOf } from '../core/index'
import type { TreeDoc } from '../core/model'
import { SCHEMA_VERSION, emptyView, isSampleTree } from '../core/model'
import { askForPersistence, deleteTree, loadCurrent, loadTree, saveTree, startAutosave } from '../store/persist'
import { getPhoto, putPhoto } from '../store/photos'
import { currentTreeDoc, useTree } from '../store/treeStore'
import { useUi, type Tab } from '../store/uiStore'
import { finishNaming, toast } from './actions'

// Starting the app: open the tree that was open last, or the sample family when the landing page
// sent you here with ?sample, or the empty "Start with you" screen on a first visit.

export function newTreeWithYou(): { doc: TreeDoc; you: string } {
  const now = new Date().toISOString()
  const you = blankPerson()
  return {
    you: you.id,
    doc: {
      schemaVersion: SCHEMA_VERSION,
      id: nanoid(10),
      title: '',
      titleAuto: true,
      showStats: true,
      homePersonId: you.id,
      people: { [you.id]: you },
      families: {},
      view: emptyView(),
      meta: { createdAt: now, updatedAt: now, app: 'jangal' },
    },
  }
}

/** When the browser has nothing else to do (Safari has no requestIdleCallback, so a short wait) */
const idle = () => new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 300)))

/**
 * Opens a tree and saves it, so it's there on the next visit. Straight away, or for the sample,
 * once it's on screen: saving 88 people takes a moment the first paint shouldn't wait for (TODO.md F17).
 */
export async function openNewTree(doc: TreeDoc, opts: { saveWhenIdle?: boolean } = {}) {
  useTree.getState().load(doc)
  // The start page closes too: a tree opened from it shows straight away
  useUi.setState({ card: null, path: null, sheet: null, hover: null, naming: null, editingTitle: false, trait: null, startPage: false })
  if (opts.saveWhenIdle) void idle().then(() => saveTree(doc))
  else await saveTree(doc)
}

/**
 * Opens the sample family, or reopens it if you've explored it before. A sample saved from an
 * older version of the app gives way to the current one, which is marked by its creation date.
 */
export async function openSample() {
  const [saved, { sampleTree }] = await Promise.all([loadTree('sample'), import('../core/sample')])
  const fresh = sampleTree()
  const doc = saved && saved.meta.createdAt === fresh.meta.createdAt ? saved : fresh
  await openNewTree(doc, { saveWhenIdle: true })
  void loadSamplePhotos(doc)
}

/**
 * The sample's photos ship as files next to the app (TODO.md KP-5), and are saved to this browser
 * the first time. They wait until the tree is showing (TODO.md F17): first the small pictures of the
 * people on screen, then, when the browser is idle, everyone else's, then the full sizes for the
 * card. Offline, the leaves just stay.
 */
async function loadSamplePhotos(doc: TreeDoc) {
  const blob = async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return res.blob()
  }
  const ix = indexOf(doc)
  const shown = visibleSets(ix, anchorId(ix, doc.homePersonId), doc.view).persons
  const ids = Object.values(doc.people).flatMap((p) => (p.photoId?.startsWith('sample-') ? [{ id: p.photoId, first: shown.has(p.id) }] : []))
  const url = (id: string, thumb: boolean) => `${import.meta.env.BASE_URL}sample/${id.slice('sample-'.length)}${thumb ? '-thumb' : ''}.webp`
  // One photo at a time, a size it doesn't have yet. Offline, a missing file, or storage that
  // won't take it: they keep their leaf.
  const save = async (id: string, full: boolean) => {
    try {
      if (full ? await getPhoto(id, 'full') : await getPhoto(id, 'thumb')) return
      const thumb = (await getPhoto(id, 'thumb')) ?? (await blob(url(id, true)))
      await putPhoto(id, full ? await blob(url(id, false)) : null, thumb)
    } catch {
      // The leaf stays
    }
  }
  await new Promise((r) => setTimeout(r, 800))
  const onScreen = ids.filter((p) => p.first)
  await Promise.all([1, 2, 3].map(async () => {
    for (let p = onScreen.shift(); p; p = onScreen.shift()) await save(p.id, false)
  }))
  for (const p of ids.filter((p) => !p.first)) {
    await idle()
    await save(p.id, false)
  }
  for (const p of ids) {
    await idle()
    await save(p.id, true)
  }
}

export async function startWithYou() {
  const { doc, you } = newTreeWithYou()
  await openNewTree(doc)
  useUi.getState().setNaming(you)
  return doc
}

/**
 * The "New tree" button: leaves the sample family, or whichever tree is open, for a new one that
 * starts with you. The tree you leave stays saved in this browser (Share lists it under Your
 * trees), and Undo in the toast goes straight back to it.
 */
export async function startNewTree() {
  if (useUi.getState().naming) finishNaming(true)
  const prev = currentTreeDoc()
  // Save the tree being left now, in case an edit is still waiting for the autosave
  if (prev) await saveTree(prev)
  const doc = await startWithYou()
  if (!prev) return
  toast(isSampleTree(prev) ? 'Started your own tree' : 'Started a new tree', {
    label: 'Undo',
    run: () => void backTo(prev.id, doc.id),
  })
}

/** Undo for a new tree: reopen the one that was open, then remove the new one */
async function backTo(prevId: string, newId: string) {
  const prev = await loadTree(prevId)
  if (!prev) return
  await openNewTree(prev)
  await deleteTree(newId)
}

export async function boot() {
  const tree = useTree.getState()
  const params = new URLSearchParams(location.search)
  const view = params.get('view')
  if (view === 'timeline' || view === 'fan') useUi.getState().setTab(view as Tab)
  try {
    if (params.has('sample')) {
      params.delete('sample')
      const url = new URL(location.href)
      url.search = params.toString()
      history.replaceState(null, '', url)
      await openSample()
    } else {
      const doc = await loadCurrent()
      if (doc) tree.load(doc)
      else tree.setStatus('empty')
    }
  } catch (err) {
    console.error(err)
    tree.setStatus('error', "This browser wouldn't let the app read its saved trees. Private browsing can do this.")
  }
  void askForPersistence()
  startAutosave()
  // After the tree has settled, so the note doesn't compete with the first paint
  setTimeout(() => void import('./notices').then((m) => m.startupNotice()), 2500)
}
