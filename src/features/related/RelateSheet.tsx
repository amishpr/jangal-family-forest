import { useEffect } from 'react'
import { showPath } from '../../app/actions'
import { sideClass, useHome, useIndex, useSides } from '../../app/derive'
import { chain, headline, sentence } from '../../core/kinship'
import { fullName } from '../../core/model'
import { useUi } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import { ArrowRight, ArrowsLeftRight, Question } from '../../ui/icons'
import { PeoplePicker } from '../sheets/PeoplePicker'
import { Sheet } from '../sheets/Sheet'

// "How are we related?" (PLAN X-1): two people, the answer in plain words, and the hop chain behind
// it, so a wrong label never hides the truth (R-8). The path lights up on the tree behind the sheet.

export default function RelateSheet() {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const rel = useUi((s) => s.relate)

  // Opened from the dock: start from you, or show the last pair again
  useEffect(() => {
    const ui = useUi.getState()
    const r = ui.relate
    if (!r.a && !r.b) ui.setRelate({ a: home, b: null, picking: home ? 'b' : 'a' })
    else if (r.a && r.b && !ui.path) showPath(r.a, r.b)
  }, [home])

  if (!ix || !sides) return null
  const a = rel.a && ix.person(rel.a) ? rel.a : null
  const b = rel.b && ix.person(rel.b) ? rel.b : null

  const pick = (id: string) => {
    const ui = useUi.getState()
    const next = { ...ui.relate, [ui.relate.picking ?? 'b']: id }
    const picking = next.a && next.b ? null : next.a ? 'b' : 'a'
    ui.setRelate({ ...next, picking })
    if (next.a && next.b) showPath(next.a, next.b)
  }

  const slot = (k: 'a' | 'b') => {
    const id = k === 'a' ? a : b
    const p = id ? ix.person(id) : null
    const picking = rel.picking === k
    const cls = `slot ${p ? 'filled' : ''} ${picking ? 'picking' : ''}`
    const toggle = () => useUi.getState().setRelate({ picking: picking ? null : k })
    return p && id ? (
      <button type="button" className={cls} onClick={toggle} aria-pressed={picking}>
        <Avatar person={p} size={58} side={sideClass(sides, id)} />
        <span className="who">
          <b>{fullName(p)}</b>
          <span>{picking ? 'Pick someone below' : 'Tap to change'}</span>
        </span>
      </button>
    ) : (
      <button type="button" className={cls} onClick={toggle} aria-pressed={picking}>
        <span className="q">
          <Question />
        </span>
        <span className="who">
          <b>Anyone</b>
          <span>Pick someone below</span>
        </span>
      </button>
    )
  }

  const hops = a && b && a !== b ? chain(ix, a, b) : []
  return (
    <Sheet title="How are we related?" label="How are we related?">
      <div className="slots">
        {slot('a')}
        <button
          type="button"
          className="swap"
          aria-label="Swap"
          onClick={() => {
            const ui = useUi.getState()
            ui.setRelate({ a: b, b: a })
            if (a && b) showPath(b, a)
          }}
        >
          <ArrowsLeftRight />
        </button>
        {slot('b')}
      </div>
      {a && b && a !== b && (
        <div className="answer" aria-live="polite">
          <div className="big">{headline(ix, a, b)}</div>
          <div className="sen">{sentence(ix, a, b, home)}</div>
          {hops.length > 0 && (
            <div className="hops">
              {hops.map((h, i) => {
                const p = ix.person(h.id)!
                return (
                  <span key={`${h.id}-${i}`} style={{ display: 'contents' }}>
                    {i > 0 && <ArrowRight />}
                    <span className="hop">
                      <Avatar person={p} size={28} side={sideClass(sides, h.id)} />
                      <span>
                        {h.rel && <small>{h.rel} </small>}
                        {p.firstName || 'Someone'}
                      </span>
                    </span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}
      {rel.picking && (
        <PeoplePicker
          key={rel.picking}
          placeholder="Search the family"
          exclude={rel.picking === 'a' ? b : a}
          onPick={pick}
          autoFocus
        />
      )}
    </Sheet>
  )
}
