import { useLayoutEffect, useMemo, type RefObject } from 'react'
import { useIndex } from '../../app/derive'
import { immediateFamily } from '../../core/path'
import { traitView } from '../../core/traits'
import { useUi } from '../../store/uiStore'
import { usePathResult } from './usePath'

// Hover, path and trait emphasis without rerendering the tree (PLAN 8.7, TODO.md TR-5). Hovering a
// tile lights up the person, their parents, partners and children, and the lines between them;
// everyone else dims. A path lights its people one after another. A trait lights everyone who has
// it, the lines from a parent with it to a child with it, and rings anyone it skipped a generation
// to. Each is written as a tiny stylesheet of attribute selectors, and the world gets a "focus",
// "pathing" or "trait" class.

const q = (v: string) => `"${CSS.escape(v)}"`

export function Emphasis({ world }: { world: RefObject<HTMLDivElement | null> }) {
  const hover = useUi((s) => s.hover)
  const tab = useUi((s) => s.tab)
  const trait = useUi((s) => s.trait)
  const ix = useIndex()
  const path = usePathResult()

  const focusCss = useMemo(() => {
    if (!hover || !ix || path || trait || !ix.person(hover)) return ''
    const im = immediateFamily(ix, hover)
    const tiles = [...im.persons].map((id) => `.world.focus .tile[data-id=${q(id)}]`)
    const lines = [...im.edges].map((k) => `.world.focus .edge[data-k=${q(k)}]`)
    const knots = [...im.families].map((f) => `.world.focus .knot[data-f=${q(f)}]`)
    return `${tiles.join(',')}{opacity:1;scale:1}\n${[...lines, ...knots].join(',') || '.x'}{opacity:1;stroke:var(--leaf)}`
  }, [hover, ix, path, trait])

  const pathCss = useMemo(() => {
    if (!path) return ''
    return path.persons
      .map((id, i) => {
        const sel = `.world.pathing .tile[data-id=${q(id)}]`
        return `${sel}{opacity:1;scale:1;animation:pop-in .5s both cubic-bezier(.3,1.5,.5,1) ${i * 230}ms}` +
          `${sel}:not(.home){box-shadow:0 0 0 4px var(--leaf),0 5px 0 4px var(--ledge-leaf)}`
      })
      .join('\n')
  }, [path])

  const traitCss = useMemo(() => {
    const v = trait && ix && !path ? traitView(ix, trait) : null
    if (!v?.carriers.length) return ''
    const tiles = v.carriers.map((id) => `.world.trait .tile[data-id=${q(id)}]`)
    const lines = v.links.flatMap((l) => [
      `.world.trait .edge[data-k=${q(`h:${l.familyId}:${l.parentId}`)}]`,
      `.world.trait .edge[data-k=${q(`c:${l.familyId}:${l.childId}`)}]`,
      `.world.trait .knot[data-f=${q(l.familyId)}]`,
    ])
    const skipped = v.skips.map((s) => `.world.trait .tile[data-id=${q(s.personId)}]`)
    return (
      `${tiles.join(',')}{opacity:1;scale:1}\n` +
      `${tiles.map((t) => `${t}:not(.home)`).join(',')}{box-shadow:0 0 0 4px var(--leaf),0 5px 0 4px var(--ledge-leaf)}\n` +
      `${lines.join(',') || '.x'}{opacity:1;stroke:var(--leaf);stroke-width:4}\n` +
      (skipped.length ? `${skipped.join(',')}{outline:3px dashed var(--leaf);outline-offset:7px}` : '')
    )
  }, [trait, ix, path])

  useLayoutEffect(() => {
    const el = world.current
    if (!el) return
    el.classList.toggle('focus', !!focusCss && tab === 'tree')
    el.classList.toggle('pathing', !!pathCss)
    el.classList.toggle('trait', !!traitCss)
  }, [focusCss, pathCss, traitCss, tab, world])

  return <style>{focusCss + '\n' + pathCss + '\n' + traitCss}</style>
}
