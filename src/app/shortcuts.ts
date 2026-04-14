import { useEffect } from 'react'
import { canCollapseAncestors, canCollapseFamily } from '../core/collapse'
import { redo, undo, useTree } from '../store/treeStore'
import { useUi } from '../store/uiStore'
import { setTab } from './nav'
import { currentLayout } from './derive'
import { relateWith } from './actions'
import { fitTree, flyToPeople, tileRect } from '../features/canvas/camera'
import { moveAmongSiblings } from '../features/canvas/drag'

// Keyboard shortcuts (PLAN 7, 8.15): / or Cmd+K to find, 1 2 3 for the tabs, F to fit, Cmd+Z to
// undo, Esc to close whatever is open, ? for the list. On a focused tile the arrow keys follow
// relationships rather than the screen: up to a parent, down to a child, left and right through
// siblings and partners. E edits, A adds a relative, R relates, H tucks a branch away, and Alt+arrows
// move a tile among its brothers and sisters.

const typing = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)

const focusedPerson = () =>
  (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.react-flow__node-person')?.dataset.id ?? null

/** Moves keyboard focus to someone's tile, flying there first if it's off screen */
export function focusPerson(id: string) {
  const find = () => document.querySelector<HTMLElement>(`.react-flow__node-person[data-id="${CSS.escape(id)}"]`)
  const r = tileRect(id)
  const onScreen = r && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
  if (!onScreen) flyToPeople([id], { maxK: 1, duration: 350 })
  let tries = 0
  const go = () => {
    const el = find()
    if (el) el.focus({ preventScroll: true })
    else if (tries++ < 30) requestAnimationFrame(go)
  }
  go()
}

/** The relative an arrow key leads to */
function relativeFor(id: string, key: string): string | null {
  const tl = currentLayout()
  if (!tl) return null
  const { ix, layout } = tl
  const shown = (x: string) => !!layout.nodes[x]
  const byBirth = (a: string, b: string) => (ix.person(a)!.birth?.date?.year ?? 0) - (ix.person(b)!.birth?.date?.year ?? 0)
  if (key === 'ArrowUp') {
    const parents = ix.parentsOf(id).filter(shown)
    const father = parents.find((p) => ix.person(p)!.gender === 'male')
    return father ?? parents[0] ?? null
  }
  if (key === 'ArrowDown') return ix.childrenOf(id).filter(shown).sort(byBirth)[0] ?? null
  const me = layout.nodes[id]
  if (!me) return null
  // Siblings and partners in the same row, in screen order; anyone in the row otherwise
  const kin = new Set([...ix.siblingsOf(id), ...ix.partnersOf(id)])
  const row = Object.values(layout.nodes).filter((n) => n.y === me.y && n.id !== id)
  const pool = row.filter((n) => kin.has(n.id))
  const candidates = (pool.length ? pool : row).filter((n) => (key === 'ArrowLeft' ? n.x < me.x : n.x > me.x))
  candidates.sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))
  return candidates[0]?.id ?? null
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUi.getState()
      if (e.key === 'Escape') {
        if (ui.editingTitle) ui.setEditingTitle(false)
        else if (ui.card) ui.closeCard()
        else if (ui.sheet) {
          ui.openSheet(null)
          ui.setPath(null)
        } else if (ui.path) ui.setPath(null)
        else if (ui.trait) ui.setTrait(null)
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !typing(document.activeElement) && !ui.readOnly) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing(document.activeElement) && !ui.readOnly) {
        e.preventDefault()
        redo()
        return
      }
      if ((mod && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing(document.activeElement))) {
        e.preventDefault()
        if (ui.sheet !== 'find') ui.openSheet('find')
        return
      }
      // Alt+← and Alt+→ move a focused tile among its brothers and sisters (TODO.md F18)
      if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !typing(document.activeElement) && !ui.readOnly) {
        const id = focusedPerson()
        if (id) {
          e.preventDefault()
          moveAmongSiblings(id, e.key === 'ArrowLeft' ? -1 : 1)
          return
        }
      }
      if (typing(document.activeElement) || mod || e.altKey) return

      // On a focused tile
      const id = focusedPerson()
      if (id) {
        if (e.key.startsWith('Arrow')) {
          e.preventDefault()
          const next = relativeFor(id, e.key)
          if (next) focusPerson(next)
          return
        }
        const k = e.key.toLowerCase()
        if (e.key === 'Enter') {
          e.preventDefault()
          ui.openCard(id, 'view', tileRect(id))
          return
        }
        if (k === 'e' && !ui.readOnly) {
          e.preventDefault()
          ui.openCard(id, 'edit', tileRect(id))
          return
        }
        if (k === 'a' && !ui.readOnly) {
          e.preventDefault()
          ui.openCard(id, 'view', tileRect(id))
          requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('jangal:add-relative')))
          return
        }
        if (k === 'r') {
          e.preventDefault()
          relateWith(id)
          return
        }
        if (k === 'h') {
          e.preventDefault()
          const tl = currentLayout()
          const doc = useTree.getState().doc
          if (!tl || !doc) return
          const tree = useTree.getState()
          const fam = tl.ix.familiesOf(id).find((f) => canCollapseFamily(tl.ix, tl.anchor, f))
          if (fam) tree.toggleFamily(fam)
          else if (canCollapseAncestors(tl.ix, tl.anchor, id)) tree.toggleAncestors(id)
          return
        }
      }

      if (e.key === '1') setTab('tree')
      else if (e.key === '2') setTab('timeline')
      else if (e.key === '3') setTab('fan')
      else if (e.key === '?') ui.toggleSheet('shortcuts')
      else if ((e.key === 'f' || e.key === 'F') && ui.tab === 'tree') fitTree()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
