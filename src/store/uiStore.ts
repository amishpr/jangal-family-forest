import { create } from 'zustand'
import type { RelativeType } from '../core/edit'

// What's on screen right now (PLAN 8.8): hover, the open person card, the path, the open sheet and
// tab. None of it is saved, except the tab, which lives in the URL (?view=timeline).

export type Tab = 'tree' | 'timeline' | 'fan'
export type SheetName = 'me' | 'find' | 'relate' | 'bdays' | 'export' | 'about' | 'shortcuts' | 'import' | 'titles' | 'ask'
export type Rect = { left: number; right: number; top: number; bottom: number }

export type Toast = { id: number; message: string; action?: { label: string; run: () => void } }

// fresh: the person was just added to be named here, so cancelling takes them away again
export type CardState = { id: string; mode: 'view' | 'edit'; anchor: Rect | null; fresh?: boolean }

export type RelateState = { a: string | null; b: string | null; picking: 'a' | 'b' | null }

type UiState = {
  /** The exported family page: everything can be explored, nothing can be edited (PLAN E-3) */
  readOnly: boolean
  tab: Tab
  hover: string | null
  card: CardState | null
  /** The path highlighted between two people */
  path: { a: string; b: string } | null
  sheet: SheetName | null
  relate: RelateState
  /** A new tile waiting for its name */
  naming: string | null
  /** Who the new tile was added to, and as what, for the quick-add card (TODO.md F1) */
  namingFrom: { id: string; type: RelativeType } | null
  editingTitle: boolean
  /** The trait lit on the tree, like "Left-handed" (TODO.md F2) */
  trait: string | null
  /** Who the Ask sheet makes a fill-in link for (SHARE.md SH-2) */
  askFor: string | null
  toast: Toast | null
  save: 'idle' | 'saving' | 'saved' | 'error'

  setTab(tab: Tab): void
  setHover(id: string | null): void
  openCard(id: string, mode?: 'view' | 'edit', anchor?: Rect | null, fresh?: boolean): void
  closeCard(): void
  setPath(path: { a: string; b: string } | null): void
  toggleSheet(name: SheetName): void
  openSheet(name: SheetName | null): void
  setRelate(r: Partial<RelateState>): void
  setNaming(id: string | null, from?: { id: string; type: RelativeType }): void
  setEditingTitle(on: boolean): void
  setTrait(trait: string | null): void
  showToast(message: string, action?: Toast['action']): void
  hideToast(): void
  setSave(s: UiState['save']): void
}

let toastSeq = 0

export const useUi = create<UiState>()((set, get) => ({
  readOnly: false,
  tab: 'tree',
  hover: null,
  card: null,
  path: null,
  sheet: null,
  relate: { a: null, b: null, picking: 'b' },
  naming: null,
  namingFrom: null,
  editingTitle: false,
  trait: null,
  askFor: null,
  toast: null,
  save: 'idle',

  setTab: (tab) => set({ tab, hover: null, card: null }),
  setHover: (hover) => {
    if (get().hover !== hover) set({ hover })
  },
  // A card and a sheet would overlap over the dock, so opening a card closes the sheet
  openCard: (id, mode = 'view', anchor = null, fresh = false) =>
    set((s) => ({
      card: { id, mode, anchor: anchor ?? (s.card?.id === id ? s.card.anchor : null), fresh },
      editingTitle: false,
      sheet: null,
    })),
  closeCard: () => set({ card: null }),
  setPath: (path) => set({ path }),
  toggleSheet: (name) => set((s) => ({ sheet: s.sheet === name ? null : name, card: null })),
  openSheet: (sheet) => set({ sheet, card: sheet ? null : get().card }),
  setRelate: (r) => set((s) => ({ relate: { ...s.relate, ...r } })),
  setNaming: (naming, from) => set({ naming, namingFrom: from ?? null }),
  setEditingTitle: (editingTitle) => set({ editingTitle, card: editingTitle ? null : get().card }),
  setTrait: (trait) => set({ trait }),
  showToast: (message, action) => set({ toast: { id: ++toastSeq, message, action } }),
  hideToast: () => set({ toast: null }),
  setSave: (save) => set({ save }),
}))
