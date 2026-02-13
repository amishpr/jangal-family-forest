import { temporal } from 'zundo'
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { revealPerson, anchorId } from '../core/collapse'
import * as edits from '../core/edit'
import type { AddOptions, EditResult, RelativeType } from '../core/edit'
import { indexOf } from '../core/index'
import type { Person, TreeCore, TreeDoc, TreeView } from '../core/model'
import { emptyView } from '../core/model'

// The tree being edited (PLAN 8.8). `doc` is everything undo covers: people, families, the title,
// and who is marked as you. `view` (which branches are tucked away) is saved with the tree but
// isn't an edit, so it sits outside the undo history. Photos live in IndexedDB, also outside it.

export type LoadState = 'loading' | 'ready' | 'empty' | 'error'

type TreeState = {
  doc: TreeCore | null
  view: TreeView
  status: LoadState
  error: string | null

  load(doc: TreeDoc): void
  setStatus(status: LoadState, error?: string): void

  /** Runs one edit as one undo step. The edit returns ok or a reason it couldn't be done. */
  edit(fn: (doc: TreeCore) => EditResult | void): EditResult
  addRelative(id: string, type: RelativeType, opts?: AddOptions): EditResult
  linkExisting(id: string, type: RelativeType, otherId: string, opts?: AddOptions): EditResult
  updatePerson(id: string, patch: Partial<Person>): EditResult
  removePerson(id: string): EditResult
  /** "This is me". null switches to the neutral view. */
  setHome(id: string | null): void
  setTreeInfo(patch: Partial<Pick<TreeCore, 'title' | 'titleAuto' | 'subtitle' | 'showStats'>>): void

  toggleFamily(familyId: string): void
  toggleAncestors(personId: string): void
  expandAll(): void
  /** Opens whatever folds hide this person. Returns true if anything opened. */
  reveal(personId: string): boolean
}

const stampEdit = (d: TreeCore) => {
  d.meta.updatedAt = new Date().toISOString()
}

export const useTree = create<TreeState>()(
  temporal(
    immer((set, get) => ({
      doc: null,
      view: emptyView(),
      status: 'loading',
      error: null,

      load(full) {
        const { view, ...doc } = full
        const t = useTree.temporal.getState()
        t.pause()
        set({ doc: doc as TreeCore, view: view ?? emptyView(), status: 'ready', error: null })
        t.resume()
        t.clear()
      },

      setStatus(status, error) {
        set({ status, error: error ?? null })
      },

      edit(fn) {
        let result: EditResult = { ok: false, reason: 'There is no tree open' }
        if (!get().doc) return result
        set((s) => {
          if (!s.doc) return
          const r = fn(s.doc)
          result = r ?? { ok: true, id: '' }
          if (result.ok) stampEdit(s.doc)
        })
        return result
      },

      addRelative: (id, type, opts) => get().edit((d) => edits.addRelative(d, id, type, opts)),
      linkExisting: (id, type, otherId, opts) => get().edit((d) => edits.linkExisting(d, id, type, otherId, opts)),
      updatePerson: (id, patch) => get().edit((d) => edits.updatePerson(d, id, patch)),
      removePerson: (id) => {
        const r = get().edit((d) => edits.removePerson(d, id))
        if (r.ok) {
          set((s) => {
            s.view.collapsedAncestors = s.view.collapsedAncestors.filter((x) => x !== id)
          })
        }
        return r
      },

      setHome(id) {
        const doc = get().doc
        if (!doc || doc.homePersonId === id) return
        get().edit((d) => {
          d.homePersonId = id
        })
      },

      setTreeInfo(patch) {
        get().edit((d) => {
          Object.assign(d, patch)
          if (!d.subtitle) delete d.subtitle
        })
      },

      toggleFamily(fid) {
        set((s) => {
          const list = s.view.collapsedFamilies
          const i = list.indexOf(fid)
          if (i >= 0) list.splice(i, 1)
          else list.push(fid)
        })
      },

      toggleAncestors(pid) {
        set((s) => {
          const list = s.view.collapsedAncestors
          const i = list.indexOf(pid)
          if (i >= 0) list.splice(i, 1)
          else list.push(pid)
        })
      },

      expandAll() {
        set((s) => {
          s.view.collapsedFamilies = []
          s.view.collapsedAncestors = []
        })
      },

      reveal(personId) {
        const { doc, view } = get()
        if (!doc) return false
        const ix = indexOf(doc)
        const next = revealPerson(ix, anchorId(ix, doc.homePersonId), view, personId)
        if (!next) return false
        set((s) => {
          s.view.collapsedFamilies = next.collapsedFamilies
          s.view.collapsedAncestors = next.collapsedAncestors
        })
        return true
      },
    })),
    {
      limit: 200,
      partialize: (s) => ({ doc: s.doc }),
      equality: (a, b) => a.doc === b.doc,
    },
  ),
)

export const undo = () => useTree.temporal.getState().undo()
export const redo = () => useTree.temporal.getState().redo()

/**
 * Runs an edit without adding an undo step, folding it into the previous one. Naming a new tile
 * uses this, so "add a sibling called Rosa" undoes in one step.
 */
export function editQuietly(fn: (doc: TreeCore) => EditResult | void): EditResult {
  const t = useTree.temporal.getState()
  t.pause()
  try {
    return useTree.getState().edit(fn)
  } finally {
    t.resume()
  }
}

/** The whole document, ready to save or export */
export function currentTreeDoc(): TreeDoc | null {
  const { doc, view } = useTree.getState()
  return doc ? { ...doc, view } : null
}
