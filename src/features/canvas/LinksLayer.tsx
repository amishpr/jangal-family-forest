import type { Node } from '@xyflow/react'
import { memo, useLayoutEffect, useMemo, useRef } from 'react'
import { sideClass, useSides, useTreeLayout } from '../../app/derive'
import type { Layout } from '../../core/layout/layout'
import type { Sides } from '../../core/sides'
import { useTree } from '../../store/treeStore'
import { Avatar } from '../../ui/Avatar'
import { Minus, Plus } from '../../ui/icons'
import { reduceMotion } from './camera'
import { usePathResult } from './usePath'

// All the connectors in one SVG (PLAN 6.8): partner lines with a ring at the family point, a bus
// under it, and a drop into each child. Adopted, step and foster links are dotted, and a former
// partnership uses sparse dots. The fold buttons and "N tucked away" pills ride along on top.

export type LinksNode = Node<Record<string, never>, 'links'>

export const LinksLayer = memo(function LinksLayer() {
  const tl = useTreeLayout()
  const sides = useSides()
  if (!tl || !sides) return null
  return (
    <>
      <Connectors layout={tl.layout} sides={sides} />
      <Folds layout={tl.layout} sides={sides} />
    </>
  )
})

const Connectors = memo(function Connectors({ layout, sides }: { layout: Layout; sides: Sides }) {
  const { bounds } = layout
  return (
    <svg className="links" width={bounds.w + 40} height={bounds.h + 40} aria-hidden="true">
      {layout.families.map((f) => {
        const ex = f.status === 'divorced' || f.status === 'separated'
        return (
          <g key={f.id}>
            {f.halves.map((h) =>
              h.d ? <path key={h.key} className={`edge ${sideClass(sides, h.pid)} ${ex ? 'ex' : ''}`} data-k={h.key} d={h.d} /> : null,
            )}
            {f.childSegs.map((c) => (
              <path
                key={c.key}
                className={`edge ${sideClass(sides, c.cid)} ${c.kind !== 'biological' ? 'dashed' : ''}`}
                data-k={c.key}
                d={c.d}
              />
            ))}
            {f.twoPartners && <circle className="knot" data-f={f.id} cx={f.anchor.x} cy={f.anchor.y} r={6} />}
          </g>
        )
      })}
      <Vines layout={layout} />
    </svg>
  )
})

/** The path between two people, drawn as a thick leaf green vine, segment by segment (PLAN C-6) */
function Vines({ layout }: { layout: Layout }) {
  const path = usePathResult()
  const ref = useRef<SVGGElement>(null)
  const segments = useMemo(() => {
    if (!path) return []
    const byKey = new Map<string, string>()
    for (const f of layout.families) {
      for (const h of f.halves) if (h.d) byKey.set(h.key, h.d)
      for (const c of f.childSegs) byKey.set(c.key, c.d)
    }
    return path.edges.map((k, j) => {
      // Draw each segment in the direction the path travels along it
      const fromPerson = path.nodes[j][0] === 'p'
      const forward = k.startsWith('h:') ? fromPerson : !fromPerson
      return { k, d: byKey.get(k), forward, j }
    })
  }, [path, layout])

  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    const animate = !reduceMotion()
    g.querySelectorAll<SVGPathElement>('path').forEach((el) => {
      const len = el.getTotalLength()
      el.style.strokeDasharray = `${len}`
      const j = Number(el.dataset.j)
      const forward = el.dataset.fwd === '1'
      if (animate) {
        el.animate([{ strokeDashoffset: forward ? len : -len }, { strokeDashoffset: 0 }], {
          duration: 260,
          delay: j * 115 + 80,
          fill: 'both',
          easing: 'cubic-bezier(.4,0,.2,1)',
        })
      }
    })
  }, [segments])

  return (
    <g ref={ref}>
      {segments.map((s) =>
        s.d ? <path key={`${s.k}-${s.j}`} className="vine" d={s.d} data-j={s.j} data-fwd={s.forward ? '1' : '0'} /> : null,
      )}
    </g>
  )
}

const Folds = memo(function Folds({ layout, sides }: { layout: Layout; sides: Sides }) {
  const toggleFamily = useTree((s) => s.toggleFamily)
  const toggleAncestors = useTree((s) => s.toggleAncestors)
  const people = useTree((s) => s.doc?.people)
  return (
    <div className="links-html">
      {layout.families.map((f) =>
        f.canCollapse && !f.collapsed ? (
          <button
            key={f.id}
            type="button"
            className="fold nopan nodrag"
            style={{ left: f.bus.x, top: f.bus.y }}
            title="Tuck this branch away"
            aria-label="Tuck this branch away"
            onClick={() => toggleFamily(f.id)}
          >
            <Minus />
          </button>
        ) : null,
      )}
      {layout.ancestorFolds.map((a) => (
        <button
          key={a.id}
          type="button"
          className="fold anc nopan nodrag"
          style={{ left: a.at.x, top: a.at.y }}
          title={`Tuck away ${people?.[a.id]?.firstName ?? 'their'}'s parents and everyone above`}
          aria-label={`Tuck away the ancestors of ${people?.[a.id]?.firstName ?? 'this person'}`}
          onClick={() => toggleAncestors(a.id)}
        >
          <Minus />
        </button>
      ))}
      {layout.pills.map((pl) => (
        <button
          key={`${pl.kind}:${pl.id}`}
          type="button"
          className={`pill ${pl.kind} nopan nodrag`}
          style={{ left: pl.at.x, top: pl.at.y }}
          aria-label={`Bring back ${pl.hidden.length} tucked away`}
          onClick={() => (pl.kind === 'fam' ? toggleFamily(pl.id) : toggleAncestors(pl.id))}
        >
          {pl.hidden.slice(0, 3).map((id) =>
            people?.[id] ? <Avatar key={id} person={people[id]} size={26} side={sideClass(sides, id)} /> : null,
          )}
          <span className="num">{pl.hidden.length} tucked away</span>
          <Plus />
        </button>
      ))}
    </div>
  )
})
