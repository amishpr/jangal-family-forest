import { useMemo, useState } from 'react'
import { goTo, toast } from '../../app/actions'
import { sideClass, useIndex, useSides, useTitle } from '../../app/derive'
import { BRAND } from '../../brand'
import { birthdaysIcs, birthdaysInMonth, upcoming } from '../../core/calendar'
import { inDays, MONTHS, MONTHS_LONG, today } from '../../core/dates'
import { calendarName, titleSlug } from '../../core/title'
import { Avatar } from '../../ui/Avatar'
import { CalendarPlus, CaretRight } from '../../ui/icons'
import { download } from '../export/download'
import { Sheet } from '../sheets/Sheet'

// Birthdays (PLAN X-3): the next 60 days with milestone callouts, a month grid with little
// avatars on each day, and "Add all to my calendar".

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function BirthdaysSheet() {
  const ix = useIndex()
  const sides = useSides()
  const { title } = useTitle()
  const [includeDeceased, setIncludeDeceased] = useState(false)
  const [includeAnniversaries, setIncludeAnniversaries] = useState(false)
  const [month, setMonth] = useState(() => today().getMonth() + 1)
  const opts = { includeDeceased, includeAnniversaries }
  const list = useMemo(
    () => (ix ? upcoming(ix, 60, { includeDeceased, includeAnniversaries }) : []),
    [ix, includeDeceased, includeAnniversaries],
  )
  const grid = useMemo(() => (ix ? birthdaysInMonth(ix, month, { includeDeceased }) : new Map<number, string[]>()), [ix, month, includeDeceased])
  if (!ix || !sides) return null

  const exportIcs = () => {
    const ics = birthdaysIcs(ix, { ...opts, appName: BRAND.word, slug: BRAND.slug, calendarName: calendarName(title) })
    download(`${titleSlug(title)}-birthdays.ics`, ics, 'text/calendar')
    toast('Birthdays calendar downloaded')
  }

  const year = today().getFullYear()
  const firstDay = new Date(year, month - 1, 1).getDay()
  const daysIn = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)]

  return (
    <Sheet title="Birthdays coming up" label="Birthdays">
      {list.length ? (
        <div className="bdays" tabIndex={0} aria-label="The next 60 days">
          {list.map((u) => {
            const when = `${cap(inDays(u.next.days))}, ${MONTHS[u.next.date.getMonth()]} ${u.next.date.getDate()}`
            if (u.kind === 'anniversary') {
              const fam = ix.family(u.id)!
              return (
                <div key={u.id} className={`bday ${u.milestone ? 'big' : ''}`}>
                  <span className="when">{when}</span>
                  <span style={{ display: 'flex' }}>
                    {fam.partnerIds.map((pid) => (
                      <Avatar key={pid} person={ix.person(pid)!} size={40} side={sideClass(sides, pid)} />
                    ))}
                  </span>
                  <b>{u.label}, married</b>
                  <span className="age">{u.next.turning ?? ''}</span>
                </div>
              )
            }
            const p = ix.person(u.id)!
            return (
              <button key={u.id} type="button" className={`bday ${u.milestone ? 'big' : ''}`} onClick={() => goTo(u.id)}>
                <span className="when">{when}</span>
                <Avatar person={p} size={52} side={sideClass(sides, u.id)} />
                <b>
                  {u.label} {u.deceased ? 'would have been' : 'turns'}
                </b>
                <span className="age">{u.next.turning ?? '?'}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="lede">No birthdays in the next 60 days. Add birthdays from anyone's card, and they'll show up here.</p>
      )}

      <div className="row">
        <button type="button" className="chunky go" onClick={exportIcs}>
          <CalendarPlus />
          Add all to my calendar
        </button>
        <div className="opts">
          <label className="check">
            <input type="checkbox" checked={includeDeceased} onChange={(e) => setIncludeDeceased(e.target.checked)} />
            Include people who have died
          </label>
          <label className="check">
            <input type="checkbox" checked={includeAnniversaries} onChange={(e) => setIncludeAnniversaries(e.target.checked)} />
            Anniversaries
          </label>
        </div>
      </div>

      <div className="month-head">
        <button type="button" className="round" aria-label="Previous month" onClick={() => setMonth((m) => (m === 1 ? 12 : m - 1))}>
          <CaretRight style={{ transform: 'scaleX(-1)' }} />
        </button>
        <h3 className="subhead" aria-live="polite">
          {MONTHS_LONG[month - 1]}
        </h3>
        <button type="button" className="round" aria-label="Next month" onClick={() => setMonth((m) => (m === 12 ? 1 : m + 1))}>
          <CaretRight />
        </button>
      </div>
      <div className="month" role="group" aria-label={`Birthdays in ${MONTHS_LONG[month - 1]}`}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((d, i) =>
          d == null ? (
            <span key={`e${i}`} />
          ) : (
            <div key={d} className={`day ${grid.get(d) ? 'has' : ''}`}>
              <span className="num">{d}</span>
              {(grid.get(d) ?? []).slice(0, 3).map((id: string) => (
                <button
                  key={id}
                  type="button"
                  className="day-av"
                  title={ix.person(id)!.firstName}
                  aria-label={`${ix.person(id)!.firstName}, birthday on ${MONTHS_LONG[month - 1]} ${d}`}
                  onClick={() => goTo(id)}
                >
                  <Avatar person={ix.person(id)!} size={22} side={sideClass(sides, id)} />
                </button>
              ))}
            </div>
          ),
        )}
      </div>
    </Sheet>
  )
}
