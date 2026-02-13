import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import { indexOf } from '../core/index'
import type { TreeDoc } from '../core/model'
import { treeTitle } from '../core/title'
import { currentTreeDoc, useTree } from './treeStore'
import { useUi } from './uiStore'

// Saving to IndexedDB (PLAN A-2 and 8.8). Trees are stored whole under "tree:<id>", with a small
// list of trees for switching between them, and the id of the one that was open last. Photos are
// stored as Blobs by photos.ts in the same database.

export type TreeMeta = { id: string; title: string; people: number; updatedAt: string }

let db: UseStore | null = null
export const store = () => (db ??= createStore('jangal', 'kv'))

const TREES = 'trees'
const CURRENT = 'current'
const treeKey = (id: string) => `tree:${id}`

export async function listTrees(): Promise<TreeMeta[]> {
  return (await get<TreeMeta[]>(TREES, store())) ?? []
}

export async function loadTree(id: string): Promise<TreeDoc | null> {
  return (await get<TreeDoc>(treeKey(id), store())) ?? null
}

export async function loadCurrent(): Promise<TreeDoc | null> {
  const id = await get<string>(CURRENT, store())
  if (id) {
    const doc = await loadTree(id)
    if (doc) return doc
  }
  const [first] = await listTrees()
  return first ? loadTree(first.id) : null
}

/** Stored with the automatic title written out, so exports and the tree list read well */
function withTitle(doc: TreeDoc): TreeDoc {
  if (!doc.titleAuto) return doc
  return { ...doc, title: treeTitle(doc, indexOf(doc)) }
}

// Saves run one after another, so two of them never read and write the tree list at the same time
let queue: Promise<unknown> = Promise.resolve()

export function saveTree(doc: TreeDoc): Promise<void> {
  const run = queue.then(() => writeTree(doc))
  queue = run.catch(() => {})
  return run
}

async function writeTree(doc: TreeDoc) {
  const out = withTitle(doc)
  await set(treeKey(out.id), out, store())
  const list = await listTrees()
  const meta: TreeMeta = { id: out.id, title: out.title, people: Object.keys(out.people).length, updatedAt: out.meta.updatedAt }
  const i = list.findIndex((t) => t.id === out.id)
  if (i >= 0) list[i] = meta
  else list.unshift(meta)
  await set(TREES, list, store())
  await set(CURRENT, out.id, store())
}

export async function deleteTree(id: string) {
  // A save still waiting for this tree would bring it back
  if (useTree.getState().doc?.id === id) {
    clearTimeout(timer)
    timer = undefined
  }
  await queue
  await del(treeKey(id), store())
  const list = (await listTrees()).filter((t) => t.id !== id)
  await set(TREES, list, store())
}

/** Asks the browser not to clear this site's storage when space runs low */
export async function askForPersistence() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    // Not supported: the backup reminder covers it
  }
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Saves 400 ms after the last change, and shows "Saved" when it's done */
export function startAutosave(delay = 400) {
  // Immer gives a new doc or view object only when something in it changed
  let lastDoc = useTree.getState().doc
  let lastView = useTree.getState().view
  const flush = async () => {
    const doc = currentTreeDoc()
    if (!doc) return
    useUi.getState().setSave('saving')
    try {
      await saveTree(doc)
      useUi.getState().setSave('saved')
    } catch (err) {
      console.error(err)
      useUi.getState().setSave('error')
    }
  }
  const unsub = useTree.subscribe((s) => {
    if (s.status !== 'ready' || !s.doc) return
    if (s.doc === lastDoc && s.view === lastView) return
    const left = lastDoc && lastDoc.id !== s.doc.id ? { ...lastDoc, view: lastView } : null
    const switched = !lastDoc || !!left
    lastDoc = s.doc
    lastView = s.view
    // Opening another tree isn't a change to save, but the tree being left may have one waiting
    if (switched) {
      if (timer && left) {
        clearTimeout(timer)
        timer = undefined
        saveTree(left).catch(console.error)
      }
      return
    }
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, delay)
  })
  const onHide = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
      void flush()
    }
  }
  window.addEventListener('pagehide', onHide)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && onHide())
  return () => {
    unsub()
    window.removeEventListener('pagehide', onHide)
  }
}
