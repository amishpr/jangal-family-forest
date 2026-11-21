import '../../styles/timeline.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useHome, useIndex, useSides, sideClass } from '../../app/derive'
import { tabGoTo } from '../../app/nav'
import { age, decimalYear, today, yearsLabel } from '../../core/dates'
import { fullName, isDeceased } from '../../core/model'
import { generationName, generations } from '../../core/title'
import { immediateFamily } from '../../core/path'
import { useUi } from '../../store/uiStore'
import { Avatar, SeedMark } from '../../ui/Avatar'
import { CalendarCheck, Pause, Play, Printer } from '../../ui/icons'
import { reduceMotion } from '../canvas/camera'

// The Timeline tab (PLAN X-4, 8.11). Everyone's lifespan as a bar in their branch color, grouped by
// generation. Drag the year marker (or use the arrow keys on it) to see who was alive that year and
// how old they were. "Watch the family grow" plays the years from the oldest birth to today.
// Every bar, tick and line is placed as a share of the list's width (100cqw), not in pixels, so the
// chart fits any width, the screen's or the paper's (PRINT.md PT-7). The names column is
// --tl-name in timeline.css.

const SIDE_ORDER: Record<string, number> = { paternal: 0, own: 1, maternal: 2, other: 3 }
const PLAY_MS = 9000

export default function TimelineTab() {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const hover = useUi((s) => s.hover)
  const scroller = useRef<HTMLDivElement>(null)
  const [year, setYearState] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  // Today, read once when the tab opens
  const [now] = useState(today)
  const NOW = now.getFullYear()

  const data = useMemo(() => {
    if (!ix || !sides) return null
    const gen = generations(ix)
    const years = ix.ids.map((id) => ix.person(id)!.birth?.date?.year).filter((y): y is number => !!y)
    const Y0 = years.length ? Math.floor((Math.min(...years) - 3) / 10) * 10 : now.getFullYear() - 100
    const rows = [...ix.ids].sort((a, b) => {
      const pa = ix.person(a)!
      const pb = ix.person(b)!
      return (
        gen.get(a)! - gen.get(b)! ||
        (SIDE_ORDER[sides.side(a) ?? 'other'] ?? 3) - (SIDE_ORDER[sides.side(b) ?? 'other'] ?? 3) ||
        (pa.birth?.date?.year ?? 9999) - (pb.birth?.date?.year ?? 9999)
      )
    })
    return { gen, Y0, rows, oldest: years.length ? Math.min(...years) : now.getFullYear() }
  }, [ix, sides, now])

  // Find scrolls to someone's row and pings it
  useEffect(() => {
    tabGoTo.timeline = (id) => {
      const row = document.querySelector<HTMLElement>(`.tl-row[data-id="${CSS.escape(id)}"]`)
      if (!row) return
      row.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' })
      row.classList.remove('ping')
      void row.offsetWidth
      row.classList.add('ping')
      setTimeout(() => row.classList.remove('ping'), 2300)
    }
    return () => {
      delete tabGoTo.timeline
    }
  }, [])

  // Watch the family grow
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const stop = () => {
    cancelAnimationFrame(raf.current)
    setPlaying(false)
  }
  const play = () => {
    if (!data) return
    if (playing) return stop()
    const start = data.oldest - 1
    const t0 = performance.now()
    const dur = reduceMotion() ? 1 : PLAY_MS
    setPlaying(true)
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      setYearState(Math.round(start + (NOW - start) * k))
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else {
        setPlaying(false)
        setYearState(null)
      }
    }
    raf.current = requestAnimationFrame(tick)
  }

  if (!ix || !sides || !data) return null
  const { gen, Y0, rows } = data
  const Y1 = NOW + 4
  // The years' share of the width left after the names column and 80 px for the end labels
  const share = (years: number) => `(100cqw - var(--tl-name) - 80px) * ${years / (Y1 - Y0)}`
  const x = (y: number) => `calc(var(--tl-name) + ${share(y - Y0)})`
  const setYear = (y: number | null) => setYearState(y == null ? null : Math.max(Y0, Math.min(NOW, Math.round(y))))
  const Y = year ?? NOW
  const marker = Y + (year == null ? now.getMonth() / 12 : 0.5)
  const markerAt = x(marker)
  const homeGen = home ? gen.get(home) : undefined
  const lit = hover ? immediateFamily(ix, hover).persons : null

  const counts = new Map<number, number>()
  for (const id of rows) counts.set(gen.get(id)!, (counts.get(gen.get(id)!) ?? 0) + 1)

  let alive = 0
  let unborn = 0
  let gone = 0
  const yearFromX = (clientX: number) => {
    const inner = scroller.current!.firstElementChild as HTMLElement
    const r = inner.getBoundingClientRect()
    const name = parseFloat(getComputedStyle(inner).getPropertyValue('--tl-name'))
    return Y0 + ((clientX - r.left - name) / (r.width - name - 80)) * (Y1 - Y0)
  }

  const body: React.ReactNode[] = []
  let last: number | null = null
  for (const id of rows) {
    const p = ix.person(id)!
    const g = gen.get(id)!
    if (g !== last) {
      const d = homeGen != null ? homeGen - g : null
      const label = d != null ? generationName(d) : g === 0 ? 'Oldest generation' : `Generation ${g + 1}`
      const n = counts.get(g)!
      body.push(
        <div className="tl-group" key={`g${g}`}>
          {label}
          <span>
            {n} {n === 1 ? 'person' : 'people'}
          </span>
        </div>,
      )
      last = g
    }
    const side = sideClass(sides, id)
    const b = decimalYear(p.birth?.date)
    const dead = isDeceased(p)
    const d = decimalYear(p.death?.date)
    const e = b == null ? null : dead ? (d ?? b + 1) : NOW + now.getMonth() / 12 + 0.3
    const by = p.birth?.date?.year
    const isUnborn = year != null && by != null && by > year
    const isGone = year != null && dead && p.death?.date?.year != null && p.death.date.year < year
    if (year != null && by != null) {
      if (isUnborn) unborn++
      else if (isGone) gone++
      else alive++
    }
    const a = age(p)
    const approx = !!p.birth?.date?.approx || !!p.death?.date?.approx
    body.push(
      <button
        type="button"
        key={id}
        data-id={id}
        className={`tl-row ${side} ${isUnborn ? 'unborn' : ''} ${isGone ? 'gone' : ''} ${lit?.has(id) ? 'lit' : ''}`}
        title={`${fullName(p)}${by ? `, ${by}` : ''}`}
        onMouseEnter={() => useUi.getState().setHover(id)}
        onMouseLeave={() => useUi.getState().setHover(null)}
        onClick={(ev) => {
          const r = ev.currentTarget.querySelector('.tl-name')!.getBoundingClientRect()
          useUi.getState().openCard(id, 'view', r)
        }}
      >
        <span className="tl-name">
          <Avatar person={p} size={30} side={side} />
          <span className="tl-nm">
            {fullName(p)}
            {/* On paper only, where the year scale is pages away (PT-8) */}
            <small className="tl-yrs">{yearsLabel(p)}</small>
          </span>
        </span>
        {b != null && e != null ? (
          <>
            <span
              className={`tl-bar ${dead ? '' : 'living'} ${approx ? 'approx' : ''}`}
              style={{ left: x(b), width: `max(6px, ${share(e - b)})` }}
            />
            <span className="tl-end" style={{ left: `calc(${x(e)} + 8px)` }}>
              {dead ? (
                <>
                  <SeedMark />
                  {a == null ? 'dates unknown' : `${a} years`}
                </>
              ) : (
                a
              )}
            </span>
            {year != null && !isUnborn && !isGone && by != null && (
              <span className="agechip" style={{ left: x(year + 0.5) }}>
                {year - by}
              </span>
            )}
          </>
        ) : (
          <span className="tl-none">
            Birth year not recorded
          </span>
        )}
      </button>,
    )
  }

  const me = home ? ix.person(home) : null
  const meBorn = me?.birth?.date?.year
  const readout =
    year == null ? (
      'Drag the year marker, or press play to watch the family grow'
    ) : (
      <>
        <b>{year}</b>
        {alive} living, {gone} remembered, {unborn} not born yet.
        {meBorn != null && (year < meBorn ? ` ${meBorn - year} years before you were born.` : ` You were ${year - meBorn}.`)}
      </>
    )

  const ticks: number[] = []
  for (let y = Math.ceil(Y0 / 10) * 10; y <= Y1; y += 10) ticks.push(y)

  return (
    <section className="panelview view-enter" id="view-timeline" aria-label="Timeline">
      <div className={`tl-card timeline ${lit ? 'focus' : ''}`}>
        <div className="tl-top">
          <div>
            <h2>Lifespans</h2>
            <div className={`tl-read ${year == null ? 'hint' : ''}`} aria-live="polite">
              {readout}
            </div>
          </div>
          <div className="tl-acts">
            <button type="button" className="chunky go" onClick={play}>
              {playing ? <Pause /> : <Play />}
              {playing ? 'Pause' : 'Watch the family grow'}
            </button>
            <button
              type="button"
              className="chunky"
              onClick={() => {
                stop()
                setYear(null)
              }}
            >
              <CalendarCheck />
              Today
            </button>
            {/* The browser's print window, where Save as PDF makes the PDF (PRINT.md PT-1) */}
            <button type="button" className="chunky" onClick={() => window.print()}>
              <Printer />
              Print
            </button>
          </div>
        </div>
        <div className="tl-scroll" ref={scroller}>
          <div
            className="tl-inner"
            onPointerDown={(e) => {
              if (!(e.target as Element).closest('.tl-axis')) return
              stop()
              e.currentTarget.setPointerCapture(e.pointerId)
              e.currentTarget.dataset.drag = '1'
              setYear(yearFromX(e.clientX))
              e.preventDefault()
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.dataset.drag) setYear(yearFromX(e.clientX))
            }}
            onPointerUp={(e) => {
              delete e.currentTarget.dataset.drag
            }}
          >
            <div className="tl-axis">
              {ticks.map((y) => (
                // Paper labels only every 20 years, since the decades sit close together there
                // --off is how far the year sits from the marker, so a year under it can hide (timeline.css)
                <span key={y} className={`tick ${y % 20 ? 'minor' : ''}`} style={{ left: x(y), ['--off' as string]: `calc(${share(y - marker)})` }}>
                  {y}
                </span>
              ))}
              <button
                type="button"
                className="tl-knob"
                style={{ left: markerAt }}
                role="slider"
                aria-label="Year"
                aria-valuemin={Y0}
                aria-valuemax={NOW}
                aria-valuenow={Y}
                aria-valuetext={year == null ? 'Today' : String(Y)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 10 : 1
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault()
                    stop()
                    setYear(Y - step)
                  } else if (e.key === 'ArrowRight') {
                    e.preventDefault()
                    stop()
                    if (Y + step >= NOW) setYear(null)
                    else setYear(Y + step)
                  } else if (e.key === 'Home') {
                    e.preventDefault()
                    setYear(Y0)
                  } else if (e.key === 'End') {
                    e.preventDefault()
                    setYear(null)
                  }
                }}
              >
                {year == null ? 'Today' : Y}
              </button>
            </div>
            {ticks.map((y) => (
              <div key={y} className="gridline" style={{ left: x(y) }} />
            ))}
            {body}
            <div className="tl-cursor" style={{ left: markerAt }} />
          </div>
        </div>
      </div>
    </section>
  )
}

