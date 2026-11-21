import '../../styles/fan.css'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { lineOf, relationTo, sideClass, titleLangOf, useHome, useIndex, useSides, useTitles } from '../../app/derive'
import { tabGoTo } from '../../app/nav'
import { anchorId } from '../../core/collapse'
import { yearsLabel } from '../../core/dates'
import type { TreeIndex } from '../../core/index'
import type { Person } from '../../core/model'
import { fullName, isDeceased } from '../../core/model'
import type { Sides } from '../../core/sides'
import { useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { usePhotoUrl } from '../../store/photos'
import { ArrowDown, CaretRight, Crosshair, Printer } from '../../ui/icons'
import { reduceMotion } from '../canvas/camera'
import { toast } from '../../app/actions'

// The Fan chart tab (PLAN X-5, 8.11). The focus person sits in the middle with their parents in the
// first ring, grandparents in the second, and so on up to 5 generations. Descendants fan out below,
// sized by how many descendants each branch has. Dashed "+" wedges are ancestors not recorded yet:
// click one to add them. Click any wedge to recenter on that person.

const CX = 500
const CY = 500
const R0 = 90
const GAP = 4
const RW = [0, 86, 80, 74, 62, 54]
const A_START = 200
const A_END = -20
const D_START = 200
const D_END = 340
const ANC_PCT = [0, 100, 80, 58, 42, 30]
const DESC_PCT = [0, 68, 46, 32]

const rIn = (k: number) => R0 + GAP + RW.slice(1, k).reduce((s, v) => s + v + GAP, 0)
const rOut = (k: number) => rIn(k) + RW[k]
const f1 = (n: number) => Math.round(n * 10) / 10
const pt = (r: number, a: number): [number, number] => {
  const t = (a * Math.PI) / 180
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)]
}
function sector(r1: number, r2: number, a1: number, a2: number) {
  const [x1, y1] = pt(r2, a1)
  const [x2, y2] = pt(r2, a2)
  const [x3, y3] = pt(r1, a2)
  const [x4, y4] = pt(r1, a1)
  const large = Math.abs(a1 - a2) > 180 ? 1 : 0
  const sw = a1 > a2 ? 1 : 0
  return `M${f1(x1)},${f1(y1)} A${r2},${r2} 0 ${large} ${sw} ${f1(x2)},${f1(y2)} L${f1(x3)},${f1(y3)} A${r1},${r1} 0 ${large} ${1 - sw} ${f1(x4)},${f1(y4)} Z`
}
function arc(r: number, a1: number, a2: number) {
  const [x1, y1] = pt(r, a1)
  const [x2, y2] = pt(r, a2)
  return `M${f1(x1)},${f1(y1)} A${r},${r} 0 ${Math.abs(a1 - a2) > 180 ? 1 : 0} ${a1 > a2 ? 1 : 0} ${f1(x2)},${f1(y2)}`
}
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}.` : s)
const yrShort = (p: Person) => {
  const b = p.birth?.date?.year
  const d = p.death?.date?.year
  if (d) return `${b ?? '?'}-${String(d).slice(2)}`
  return b ? `b. ${b}` : ''
}

/** Father first, then mother, so the paternal line fans left */
function orderedParents(ix: TreeIndex, id: string): [string | null, string | null] {
  const ps = ix.parentsOf(id).map((x) => ix.person(x)!)
  const rank = (p: Person) => (p.gender === 'male' ? 0 : p.gender === 'female' ? 1 : 2)
  ps.sort((a, b) => rank(a) - rank(b))
  return [ps[0]?.id ?? null, ps[1]?.id ?? null]
}

type WedgeProps = {
  k: number
  a1: number
  a2: number
  p: Person
  pct: number
  slot: string
  kind: 'anc' | 'desc'
  sides: Sides
}

/** One person's wedge, with their name along the arc on the inner rings, or across it further out */
const Wedge = memo(function Wedge({ k, a1, a2, p, pct, slot, kind, sides }: WedgeProps) {
  const side = sideClass(sides, p.id)
  const onSide = pct >= 75
  const cls = onSide ? 'on-side' : 'ink'
  const am = (a1 + a2) / 2
  const span = Math.abs(a1 - a2)
  const rm = (rIn(k) + rOut(k)) / 2
  const arcLen = (span * Math.PI * rm) / 180
  const bottom = (am > 180 && am < 360) || am < 0
  const attr = kind === 'anc' ? { 'data-slot': slot } : { 'data-dslot': slot }
  let label: ReactNode
  if (k <= 2 && arcLen > 130) {
    const nameR = bottom ? rm - 10 : rm + 10
    const yrR = bottom ? rm + 14 : rm - 14
    const from = bottom ? Math.min(a1, a2) : Math.max(a1, a2)
    const to = bottom ? Math.max(a1, a2) : Math.min(a1, a2)
    const size = k === 1 ? 19 : 16
    const maxC = Math.floor(arcLen / (size * 0.56))
    const nm = fullName(p).length <= maxC ? fullName(p) : p.firstName || fullName(p)
    const ia = `fa-${kind}-${slot}-n`
    const ib = `fa-${kind}-${slot}-y`
    label = (
      <>
        <defs>
          <path id={ia} d={arc(nameR, from, to)} />
          <path id={ib} d={arc(yrR, from, to)} />
        </defs>
        <text className={`flbl ${cls}`} fontSize={size}>
          <textPath href={`#${ia}`} startOffset="50%" textAnchor="middle">
            {nm}
          </textPath>
        </text>
        <text className={`flbl ${cls}`} fontSize={13}>
          <textPath className="yr" href={`#${ib}`} startOffset="50%" textAnchor="middle">
            {yearsLabel(p)}
          </textPath>
        </text>
      </>
    )
  } else {
    const flip = am > 90 && am < 270
    const rot = flip ? 180 - am : -am
    const [x, y] = pt(rm, am)
    const size = k <= 3 ? 14.5 : k === 4 ? 12.5 : 11
    const maxC = Math.floor((RW[k] - 12) / (size * 0.56))
    const two = arcLen > size * 2.7
    label = (
      <g transform={`translate(${f1(x)},${f1(y)}) rotate(${f1(rot)})`}>
        <text className={`flbl ${cls}`} textAnchor="middle" fontSize={size} dy={two ? -2 : 4}>
          {short(p.firstName || '?', maxC)}
          {two && (
            <tspan className="yr" x="0" dy={size + 1} fontSize={size - 3}>
              {yrShort(p)}
            </tspan>
          )}
        </text>
      </g>
    )
  }
  // No remembrance seed on the wedges: it covered names. The tip says "in memory" instead.
  return (
    <g>
      <path
        className={`fw ${side}`}
        {...attr}
        data-id={p.id}
        style={{ fill: `color-mix(in srgb, var(--side) ${pct}%, var(--card))` }}
        d={sector(rIn(k), rOut(k), a1, a2)}
        tabIndex={0}
        role="button"
        aria-label={`${fullName(p)}. Center the chart on them`}
      />
      {label}
    </g>
  )
})

function Center({ p, side }: { p: Person; side: string }) {
  const url = usePhotoUrl(p.photoId, 'full')
  return (
    <g
      className={`fan-center ${side}`}
      tabIndex={0}
      role="button"
      aria-label={`Open ${fullName(p)}`}
      data-center=""
    >
      <defs>
        <clipPath id="fan-cclip">
          <circle cx={CX} cy={CY - 16} r={54} />
        </clipPath>
      </defs>
      <circle cx={CX} cy={CY + 6} r={R0} fill="var(--ledge)" />
      <circle cx={CX} cy={CY} r={R0} fill="var(--card)" />
      <circle cx={CX} cy={CY - 16} r={59} fill="color-mix(in srgb, var(--side) 60%, var(--tile))" />
      {url ? (
        <image href={url} x={CX - 54} y={CY - 70} width={108} height={108} clipPath="url(#fan-cclip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <svg x={CX - 54} y={CY - 70} width={108} height={108} viewBox="0 0 64 64" overflow="hidden">
          <LeafPortraitRound />
        </svg>
      )}
      <text className="fan-name" x={CX} y={CY + 64} textAnchor="middle">
        {short(p.firstName || fullName(p), 11)}
      </text>
    </g>
  )
}

/** The leaf portrait drawn straight into the chart's SVG, on a round background */
function LeafPortraitRound() {
  return (
    <g>
      <circle className="lp-bg" cx="32" cy="32" r="32" />
      <g transform="rotate(38 32 34)">
        <path className="lp-stem" d="M32 47V57" />
        <path className="lp-leaf" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z" />
        <path className="lp-vein" d="M32 46V19M32 40.5L37.6 35M32 40.5L26.4 35M32 32L36.4 27.6M32 32L27.6 27.6" />
      </g>
    </g>
  )
}

export default function FanTab() {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const titles = useTitles()
  const [focus, setFocus] = useState<string | null>(null)
  const [hist, setHist] = useState<string[]>([])
  const [gens, setGens] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 600 ? 3 : 4))
  const [showDesc, setShowDesc] = useState(true)
  const [lit, setLit] = useState<Set<string> | null>(null)
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)
  const rings = useRef<SVGGElement>(null)

  // The chart starts on you, or in the neutral view on the person where the most lines meet
  const start = ix ? (home && ix.person(home) ? home : anchorId(ix, null)) : null
  const center = focus && ix?.person(focus) ? focus : start

  const recenter = (id: string) => {
    setTip(null)
    setLit(null)
    if (id === center) return
    setHist((h) => [...(h.length ? h : center ? [center] : []).filter((x) => x !== id), id].slice(-6))
    const g = rings.current
    if (!g || reduceMotion()) {
      setFocus(id)
      return
    }
    g.classList.add('out')
    setTimeout(() => {
      setFocus(id)
      g.classList.remove('out')
      g.classList.add('in')
      requestAnimationFrame(() => requestAnimationFrame(() => g.classList.remove('in')))
    }, 200)
  }

  useEffect(() => {
    tabGoTo.fan = (id) => recenter(id)
    return () => {
      delete tabGoTo.fan
    }
  })


  const wedges = useMemo(() => {
    if (!ix || !sides || !center) return null
    const out: ReactNode[] = []
    let level: (string | null)[] = [center]
    for (let k = 1; k <= gens; k++) {
      const next: (string | null)[] = []
      const n = 2 ** k
      const span = (A_START - A_END) / n
      level.forEach((cid, ci) => {
        const pars = cid ? orderedParents(ix, cid) : [null, null]
        pars.forEach((pid, sd) => {
          const j = ci * 2 + sd
          const a1 = A_START - j * span
          const a2 = a1 - span
          next.push(pid)
          if (pid) {
            out.push(<Wedge key={`a${k}-${j}`} k={k} a1={a1} a2={a2} p={ix.person(pid)!} pct={ANC_PCT[k]} slot={`${k}-${j}`} kind="anc" sides={sides} />)
          } else if (cid && ix.parentsOf(cid).length < 2) {
            const [x, y] = pt((rIn(k) + rOut(k)) / 2, (a1 + a2) / 2)
            out.push(
              <g key={`g${k}-${j}`}>
                <path
                  className="fw ghost"
                  data-add-parent={cid}
                  d={sector(rIn(k), rOut(k), a1, a2)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Add a parent of ${ix.person(cid)!.firstName || 'this person'}`}
                >
                  <title>Add a parent of {ix.person(cid)!.firstName || 'this person'}</title>
                </path>
                <text className="ghost-plus" x={f1(x)} y={f1(y) + 6} textAnchor="middle">
                  +
                </text>
              </g>,
            )
          }
        })
      })
      level = next
      if (!level.some(Boolean)) break
    }
    if (showDesc) {
      const leaves = (id: string, d: number): number => {
        const c = ix.childrenOf(id)
        return d >= 3 || !c.length ? 1 : c.reduce((s, x) => s + leaves(x, d + 1), 0)
      }
      const kids = ix.childrenOf(center)
      if (!kids.length) {
        const [x, y] = pt((rIn(1) + rOut(1)) / 2, 270)
        out.push(
          <g key="add-child">
            <path className="fw ghost" data-add-child={center} d={sector(rIn(1), rOut(1), D_START + 30, D_END - 30)} tabIndex={0} role="button" aria-label="Add a child">
              <title>Add a child</title>
            </path>
            <text className="ghost-plus" x={f1(x)} y={f1(y) + 6} textAnchor="middle" fontSize={16}>
              + Add a child
            </text>
          </g>,
        )
      }
      const place = (id: string, d: number, a1: number, a2: number, path: string[]) => {
        out.push(<Wedge key={`d${path.join('>')}`} k={d} a1={a1} a2={a2} p={ix.person(id)!} pct={DESC_PCT[d]} slot={path.join('>')} kind="desc" sides={sides} />)
        if (d < 3) {
          const cs = ix.childrenOf(id)
          const tot = cs.reduce((s, c) => s + leaves(c, d + 1), 0)
          let a = a1
          for (const c of cs) {
            const w = ((a2 - a1) * leaves(c, d + 1)) / tot
            place(c, d + 1, a, a + w, path.concat(c))
            a += w
          }
        }
      }
      const tot = kids.reduce((s, c) => s + leaves(c, 1), 0)
      const pad = kids.length === 1 ? 35 : kids.length === 2 ? 15 : 0
      let a = D_START + pad
      for (const c of kids) {
        const w = ((D_END - D_START - 2 * pad) * leaves(c, 1)) / tot
        place(c, 1, a, a + w, [c])
        a += w
      }
    }
    return out
  }, [ix, sides, center, gens, showDesc])

  // Hovering a wedge lights its line back to the center
  useLayoutEffect(() => {
    const g = rings.current
    if (!g) return
    g.querySelectorAll('.on').forEach((el) => el.classList.remove('on'))
    if (!lit) return
    for (const key of lit) {
      g.querySelectorAll(`[data-slot="${key}"], [data-dslot="${CSS.escape(key)}"]`).forEach((el) => {
        el.classList.add('on')
        el.parentElement?.querySelectorAll('.flbl').forEach((t) => t.classList.add('on'))
      })
    }
  }, [lit, wedges])

  if (!ix || !sides || !center) return null
  const cp = ix.person(center)!
  const crumbs = hist.length ? hist.filter((id) => ix.person(id)) : [center]

  const onOver = (e: React.PointerEvent) => {
    const w = (e.target as Element).closest<SVGPathElement>('.fw[data-id]')
    if (!w) {
      setLit(null)
      setTip(null)
      return
    }
    const on = new Set<string>()
    if (w.dataset.slot) {
      let [k, j] = w.dataset.slot.split('-').map(Number)
      while (k >= 1) {
        on.add(`${k}-${j}`)
        j = Math.floor(j / 2)
        k--
      }
    } else if (w.dataset.dslot) {
      const parts = w.dataset.dslot.split('>')
      parts.forEach((_, i) => on.add(parts.slice(0, i + 1).join('>')))
    }
    setLit(on)
    setTip({ id: w.dataset.id!, x: e.clientX, y: e.clientY })
  }

  const onClick = (e: React.MouseEvent) => {
    const t = e.target as Element
    const c = t.closest('[data-center]')
    if (c) {
      useUi.getState().openCard(center, 'view', c.getBoundingClientRect())
      return
    }
    const w = t.closest<SVGPathElement>('.fw')
    if (!w) return
    if (w.dataset.id) return recenter(w.dataset.id)
    if (useUi.getState().readOnly) return
    const parentOf = w.dataset.addParent
    const childOf = w.dataset.addChild
    const of = parentOf ?? childOf
    if (!of) return
    const r = useTree.getState().addRelative(of, parentOf ? 'parent' : 'child')
    if (!r.ok) return toast(r.reason)
    const rect = document.querySelector('[data-center]')?.getBoundingClientRect() ?? null
    requestAnimationFrame(() => useUi.getState().openCard(r.id, 'edit', rect, true))
  }

  const tipPerson = tip ? ix.person(tip.id) : null

  // Frame just what's drawn: the ancestor fan above, and the descendants (if any) below
  const R = rOut(gens) + 12
  const descDepth = (id: string, d: number): number =>
    d >= 3 ? d : Math.max(d, ...ix.childrenOf(id).map((c) => descDepth(c, d + 1)))
  const depth = showDesc ? descDepth(center, 0) : 0
  const top = CY - R
  const bottom = Math.max(CY + R * Math.sin((20 * Math.PI) / 180) + 12, depth ? CY + rOut(Math.max(1, depth)) + 14 : CY + R0 + 30, showDesc ? CY + rOut(1) + 14 : 0)
  const viewBox = `${CX - R} ${top} ${2 * R} ${bottom - top}`

  return (
    <section className="panelview view-enter" id="view-fan" aria-label="Fan chart">
      <div className="fan-wrap">
        <div className="fan-bar">
          <nav className="crumbs" aria-label="Recently centered">
            {crumbs.length > 1 ? (
              crumbs.map((id, i) =>
                i === crumbs.length - 1 ? (
                  <b key={id}>{ix.person(id)?.firstName}</b>
                ) : ix.person(id) ? (
                  <span key={id} style={{ display: 'contents' }}>
                    <button type="button" onClick={() => recenter(id)}>
                      {ix.person(id)!.firstName}
                    </button>
                    <CaretRight />
                  </span>
                ) : null,
              )
            ) : (
              <b>Centered on {cp.firstName}</b>
            )}
            {home && center !== home && ix.person(home) && (
              <button type="button" onClick={() => recenter(home)} style={{ marginLeft: 6 }}>
                <Crosshair /> You
              </button>
            )}
          </nav>
          <div className="fan-ctl">
            <div className="seg" role="group" aria-label="Generations">
              <span className="lbl">Generations</span>
              {[3, 4, 5].map((g) => (
                <button key={g} type="button" aria-pressed={gens === g} onClick={() => setGens(g)}>
                  {g}
                </button>
              ))}
            </div>
            <div className="seg">
              <button type="button" aria-pressed={showDesc} onClick={() => setShowDesc((v) => !v)}>
                <ArrowDown />
                Descendants
              </button>
            </div>
            {/* The browser's print window, where Save as PDF makes the PDF (PRINT.md PT-1) */}
            <div className="seg">
              <button type="button" onClick={() => window.print()}>
                <Printer />
                Print
              </button>
            </div>
          </div>
        </div>
        {/* On paper only, in place of the bar above (PT-4) */}
        <p className="fan-cap">
          Centered on {fullName(cp)} · {gens} generations
        </p>
        <div className="fan-stage">
          <svg
            className={`fan-svg ${lit ? 'hovering' : ''}`}
            viewBox={viewBox}
            role="group"
            aria-label={`Fan chart centered on ${fullName(cp)}`}
            onPointerOver={onOver}
            onPointerMove={(e) => tip && setTip({ ...tip, x: e.clientX, y: e.clientY })}
            onPointerLeave={() => {
              setLit(null)
              setTip(null)
            }}
            onClick={onClick}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onClick(e as unknown as React.MouseEvent)
            }}
          >
            <g className="fan-rings" ref={rings}>
              {wedges}
              <Center p={cp} side={sideClass(sides, center)} />
            </g>
          </svg>
        </div>
      </div>
      {tip && tipPerson && (
        <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <b>{fullName(tipPerson)}</b>
          <span lang={titleLangOf(ix, home, tip.id, titles)}>{relationTo(ix, home, tip.id, titles) ?? lineOf(sides, tip.id)}</span>, {yearsLabel(tipPerson) || 'dates not recorded'}
          {isDeceased(tipPerson) ? ', in memory' : ''}
        </div>
      )}
    </section>
  )
}
