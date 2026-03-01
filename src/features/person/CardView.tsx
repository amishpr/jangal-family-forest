import { useEffect, useState } from 'react'
import { relateWith, setMe, showPerson, showTrait } from '../../app/actions'
import { lineOf, relationTo, sideClass, titleLangOf, useHome, useIndex, useSides, useTitles } from '../../app/derive'
import { age, formatDate, inDays, MONTHS, nextBirthday, yearsLabel } from '../../core/dates'
import { partnerWord, relation } from '../../core/kinship'
import { traitLineage } from '../../core/traits'
import type { Person } from '../../core/model'
import { fullName, isDeceased, isPet } from '../../core/model'
import { useUi } from '../../store/uiStore'
import { Avatar, SeedMark } from '../../ui/Avatar'
import { Cake, MapPin, Path, PencilSimple, Plus, UserCircle, UserCircleCheck, X } from '../../ui/icons'
import { AddPanel } from './AddPanel'
import { backToBirthOrder } from '../canvas/drag'
import { linkify } from './linkify'

// The person card in view mode: who they are, how they're related to you, their birthday or the
// remembrance line, where they were born, notes, and their closest family as chips.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function CardView({ person: p }: { person: Person }) {
  const ix = useIndex()
  const sides = useSides()
  const home = useHome()
  const titles = useTitles()
  const [adding, setAdding] = useState(false)
  const readOnly = useUi((s) => s.readOnly)
  // The A key on a tile opens its card with the add panel showing
  useEffect(() => {
    const open = () => setAdding(true)
    window.addEventListener('jangal:add-relative', open)
    return () => window.removeEventListener('jangal:add-relative', open)
  }, [])
  if (!ix || !sides) return null
  const id = p.id
  const side = sideClass(sides, id)
  // Always the English words, since the title (theirs, or the family's) goes in front of them
  const rel = home && home !== id && ix.person(home) ? cap(relation(ix, home, id).label) : null
  // A family title comes first, with the English after it: "Kaka · your uncle"
  const title = relationTo(ix, home, id, titles)
  const your = `your ${rel?.toLowerCase()}`
  const lang = titleLangOf(ix, home, id, titles)
  const tag = home ? (id === home ? 'This is you' : title !== rel ? `${title} · ${your}` : cap(your)) : lineOf(sides, id)
  const dead = isDeceased(p)
  const nb = dead ? null : nextBirthday(p)
  const lived = dead ? age(p) : null
  const born = p.birth?.date
  const hp = home && home !== id ? ix.person(home) : null
  const altNames = [!home && p.calledBy && `Called ${p.calledBy}`, p.nickname && `Goes by ${p.nickname}`, p.birthSurname && p.birthSurname !== p.lastName && `Born ${p.birthSurname}`]
    .filter(Boolean)
    .join(' · ')

  const facts = [
    nb && (
      <div className="fact" key="bday">
        <span className="ic">
          <Cake weight="fill" />
        </span>
        <span>
          {nb.turning != null ? `Turns ${nb.turning} on ` : 'Birthday '}
          {MONTHS[nb.date.getMonth()]} {nb.date.getDate()}
          <small>{cap(inDays(nb.days))}</small>
        </span>
      </div>
    ),
    !nb && !dead && born?.year && (
      <div className="fact" key="born">
        <span className="ic">
          <Cake weight="fill" />
        </span>
        <span>
          Born {formatDate(born, true)}
          <small>{age(p) != null ? `${age(p)} years old` : 'Birthday not recorded'}</small>
        </span>
      </div>
    ),
    dead && (
      <div className="fact" key="mem">
        <span className="ic">
          <SeedMark />
        </span>
        <span>
          In memory{yearsLabel(p) ? `, ${yearsLabel(p)}` : ''}
          <small>{lived == null ? 'Dates not recorded' : `Lived to ${lived}`}</small>
        </span>
      </div>
    ),
    !dead && p.livesIn && (
      <div className="fact" key="lives">
        <span className="ic">
          <MapPin weight="fill" />
        </span>
        <span>
          {p.livesIn}
          <small>Lives here now</small>
        </span>
      </div>
    ),
    p.birth?.place && (
      <div className="fact" key="place">
        <span className="ic">
          <MapPin weight="fill" />
        </span>
        <span>
          {p.birth.place}
          <small>Birthplace</small>
        </span>
      </div>
    ),
    dead && p.death?.place && (
      <div className="fact" key="dplace">
        <span className="ic">
          <MapPin weight="fill" />
        </span>
        <span>
          {p.death.place}
          <small>Place of passing</small>
        </span>
      </div>
    ),
  ].filter(Boolean)

  // "married May 12, 1946" next to a partner (TODO.md WD-3)
  const since = (other: string) => {
    const f = ix.partnerFamilyBetween(id, other)
    const d = formatDate(f?.start, true)
    return d && `${f!.status === 'partners' || f!.status === 'separated' ? 'together since' : f!.status === 'engaged' ? 'engaged' : 'married'} ${d}`
  }

  // A pet has owners and nothing else. People's pets get a group of their own (TODO.md F14).
  const pet = isPet(p)
  const kids = ix.childrenOf(id)
  const groups: [string, { id: string; note?: string }[]][] = [
    [pet ? 'Owners' : 'Parents', ix.parentsOf(id).map((x) => ({ id: x }))],
    ['Partners', ix.partnersOf(id).map((x) => ({ id: x, note: [partnerWord(ix, id, x), since(x)].filter(Boolean).join(' · ') || undefined }))],
    ['Children', kids.filter((x) => !isPet(ix.person(x))).map((x) => ({ id: x }))],
    ['Pets', kids.filter((x) => isPet(ix.person(x))).map((x) => ({ id: x, note: ix.person(x)!.species }))],
    ['Siblings', ix.siblingsOf(id).map((x) => ({ id: x }))],
  ]

  // Families whose children were put in an order of their own (TODO.md F18), to go back to birth order
  const bf = ix.birthFamilyOf(id)
  const reordered = readOnly ? [] : [bf, ...ix.familiesOf(id)].filter((fid): fid is string => !!fid && !!ix.family(fid)?.childOrder)

  const openOther = (other: string) => {
    const ui = useUi.getState()
    ui.closeCard()
    if (ui.tab === 'tree') {
      showPerson(other)
      setTimeout(() => useUi.getState().openCard(other, 'view'), 700)
    } else ui.openCard(other, 'view', ui.card?.anchor ?? null)
  }

  return (
    <div className="pop-in">
      <div className="pop-head">
        <div className="top">
          <Avatar person={p} size={74} side={side} large />
          <div>
            <h3 id="pop-title">{fullName(p)}</h3>
            <span className="tag">
              {lang ? (
                <>
                  <span lang={lang}>{title}</span> · {your}
                </>
              ) : (
                tag
              )}
            </span>
            {p.gender === 'other' && p.genderOther && <div className="gline">{p.genderOther}</div>}
            {altNames && <div className="gline">{altNames}</div>}
          </div>
        </div>
        <button type="button" className="round x" aria-label="Close" onClick={() => useUi.getState().closeCard()}>
          <X />
        </button>
      </div>
      <div className="pop-body">
        <div>
          {facts.length > 0 && <div className="facts">{facts}</div>}
          {p.notes && <p className="notes">{linkify(p.notes)}</p>}
          {!!p.tags?.length && (
            <ul className="trait-chips" aria-label="Traits">
              {p.tags.map((t) => (
                <li key={t}>
                  <button type="button" className="trait-chip" title={`Show everyone with ${t} on the tree`} onClick={() => showTrait(t)}>
                    {t}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <TraitStories person={p} />
          {!facts.length && !p.notes && !p.tags?.length && (
            <p className="empty">Nothing here yet. Add a birthday, a birthplace, or a few words about {p.firstName || 'them'}.</p>
          )}
          {groups.some(([, list]) => list.length) && (
            <div className="family">
              {groups.map(([label, list]) =>
                list.length ? (
                  <div key={label} style={{ display: 'grid', gap: 4 }}>
                    <h4>{label}</h4>
                    <div className="chips">
                      {list.map(({ id: other, note }) => {
                        const o = ix.person(other)!
                        return (
                          <button key={other} type="button" className="pchip" onClick={() => openOther(other)} title={fullName(o)}>
                            <Avatar person={o} size={26} side={sideClass(sides, other)} />
                            {o.firstName || fullName(o)}
                            {note && note !== 'husband' && note !== 'wife' && note !== 'spouse' && (
                              <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{note}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          )}
          {reordered.length > 0 && (
            <div className="row">
              {reordered.map((fid) => (
                <button key={fid} type="button" className="mini" onClick={() => backToBirthOrder(fid)}>
                  {fid === bf ? 'Brothers and sisters' : 'Children'}: back to birth order
                </button>
              ))}
            </div>
          )}
          {adding && <AddPanel person={p} onDone={() => setAdding(false)} />}
        </div>
      </div>
      <div className="pop-foot">
        <div className="row">
          {!readOnly && (
            <button type="button" className="chunky" onClick={() => useUi.getState().openCard(id, 'edit')}>
              <PencilSimple />
              Edit
            </button>
          )}
          {id !== home && !pet && (
            <button type="button" className="chunky go" onClick={() => relateWith(id)}>
              <Path />
              {home ? "How we're related" : 'Relate to someone'}
            </button>
          )}
          {!readOnly && !pet && (
          <button
            type="button"
            className="chunky icon"
            aria-expanded={adding}
            aria-label="Add a relative"
            onClick={() => setAdding((a) => !a)}
            title="Add a parent, partner, child or sibling"
          >
            <Plus />
          </button>
          )}
        </div>
        {pet ? null : id === home ? (
          <div className="meline">
            <UserCircleCheck />
            <span>You're viewing the tree as {p.firstName || 'this person'}.</span>
            <button type="button" className="mini" onClick={() => setMe(null)}>
              View neutrally
            </button>
          </div>
        ) : (
          <div className="meline">
            <UserCircle />
            <span>Is this you?</span>
            <button type="button" className="mini" title={hp ? `Replaces ${hp.firstName} as you` : undefined} onClick={() => setMe(id)}>
              This is me
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** Where each trait came from and where it went (TODO.md TR-7): "from Rishi (father) · passed on to Raha (daughter)" */
function TraitStories({ person: p }: { person: Person }) {
  const ix = useIndex()
  if (!ix || !p.tags?.length) return null
  const who = (ids: string[]) => and(ids.map((x) => `${ix.person(x)?.firstName || fullName(ix.person(x)!)} (${relation(ix, p.id, x).label})`))
  const stories = p.tags.flatMap((t) => {
    const s = traitLineage(ix, p.id, t)
    const parts: string[] = []
    if (s.from.length) parts.push(`from ${who(s.from)}`)
    if (s.skippedFrom) {
      const gap = s.skippedFrom.generations - 1
      parts.push(`from ${who([s.skippedFrom.id])}, skipping ${gap === 1 ? 'a generation' : `${gap} generations`}`)
    }
    if (s.to.length) parts.push(`passed on to ${who(s.to)}`)
    return parts.length ? [[t, parts.join(' · ')] as const] : []
  })
  if (!stories.length) return null
  return (
    <ul className="trait-story">
      {stories.map(([t, text]) => (
        <li key={t}>
          <b>{t}</b> {text}
        </li>
      ))}
    </ul>
  )
}
