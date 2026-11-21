import { useEffect, useState } from 'react'
import { toast } from '../../app/actions'
import { useHome, useIndex, useTitle } from '../../app/derive'
import { askLinkFor, askUrl, type AskLink } from '../../core/askLink'
import { useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { Copy, Envelope, Info, ShareNetwork } from '../../ui/icons'
import { Sheet } from '../sheets/Sheet'

// Asking someone to fill in their own details (SHARE.md SH-2, SH-3): a link to the fill-in page,
// with what it holds said plainly. Your name and email are remembered in this browser, so the next
// link is one tap.

const FROM_KEY = 'jangal:ask-from'

type From = { name: string; email: string }

function readFrom(): From | null {
  try {
    const o = JSON.parse(localStorage.getItem(FROM_KEY) ?? 'null')
    return o && typeof o.name === 'string' ? { name: o.name, email: typeof o.email === 'string' ? o.email : '' } : null
  } catch {
    return null
  }
}

function saveFrom(from: From) {
  try {
    localStorage.setItem(FROM_KEY, JSON.stringify(from))
  } catch {
    // Without storage it's asked for again next time
  }
}

const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export default function AskSheet() {
  const id = useUi((s) => s.askFor)
  const ix = useIndex()
  const treeId = useTree((s) => s.doc?.id)
  const { title } = useTitle()
  const home = useHome()
  const [from, setFrom] = useState<From>(() => readFrom() ?? { name: (home && ix?.person(home)?.firstName) || '', email: '' })
  const person = id && ix ? ix.person(id) : undefined
  const link = person && ix && treeId ? askLinkFor(ix, { id: treeId, title }, person.id, from) : null
  // The link is deflated, which the browser does asynchronously, so it follows a moment behind
  const key = link ? JSON.stringify(link) : ''
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!key) return
    let live = true
    void askUrl(JSON.parse(key) as AskLink, location.origin, import.meta.env.BASE_URL).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [key])
  if (!person || !link) return null

  const first = person.firstName || 'them'
  const others = link.families.flatMap((f) => [f.partner, ...f.children]).filter((x) => x !== undefined).map((x) => x.first)
  const holds = `The link holds ${first}'s name${others.length ? `, the names of ${and(others)},` : ''} and the tree's title${title ? `, ${title}` : ''}. No dates, places, notes or photos. Anyone ${first} forwards it to can see those names.`
  // Written like a letter from you: a short note with a bare link was getting marked as spam
  const tree = !title ? 'our family tree' : /^the /i.test(title) ? `${title} tree` : `the ${title} tree`
  const subject = `${person.firstName ? `${person.firstName}, can` : 'Can'} you help with ${tree}?`
  const filled = others.length === 0 ? 'your name' : others.length === 1 ? `your name and ${others[0]}'s` : `your name and the names of ${and(others)}`
  const message = [
    person.firstName ? `Hello ${person.firstName},` : 'Hello,',
    `I'm putting together a family tree for ${title || 'our family'}, and I'd love your help with your part of it.`,
    `The link below opens a short form with ${filled} already filled in. You can fix anything that's wrong, add birthdays and places, and add a photo if you'd like. It takes about five minutes, and nothing you type is uploaded.`,
    url,
    "When you're done, the page saves your answers as a small file for you to send back to me.",
    `Thanks,\n${from.name.trim()}`,
  ].join('\n\n')
  const ready = !!from.name.trim() && !!url
  const canShare = typeof navigator.share === 'function'

  const update = (patch: Partial<From>) => {
    const next = { ...from, ...patch }
    setFrom(next)
    saveFrom(next)
  }
  const share = async () => {
    try {
      await navigator.share({ title: subject, text: message })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast("The link couldn't be shared. Copy it instead.")
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Link copied')
    } catch {
      toast("The link couldn't be copied. Select it below and copy it.")
    }
  }

  return (
    <Sheet title={`Ask ${first} to fill in`} label={`Ask ${first} to fill in`} className="ask-sheet">
      <p className="lede">
        Send {first} a link. On any phone or computer, {first} can check the details, add a photo and add family, then send you back
        a small file. Drop that file on Import to add it to the tree.
      </p>
      <div className="ask-holds">
        <Info />
        <span>{holds}</span>
      </div>
      <div className="fields">
        <div className="two">
          <label>
            Your name
            <input
              className="field-in"
              value={from.name}
              maxLength={120}
              onChange={(e) => update({ name: e.target.value })}
              aria-invalid={!ready}
              aria-describedby={!ready ? 'ask-why' : undefined}
              autoComplete="name"
              data-autofocus
            />
          </label>
          <label>
            Your email (optional)
            <input
              className="field-in"
              type="email"
              value={from.email}
              maxLength={200}
              onChange={(e) => update({ email: e.target.value })}
              placeholder={`So ${first} can email it back`}
              autoComplete="email"
            />
          </label>
        </div>
        {!ready && (
          <span className="help" id="ask-why">
            Add your name, so {first} knows who's asking.
          </span>
        )}
        <div className="fl">
          The message
          <p className="ask-msg">{message}</p>
        </div>
      </div>
      <div className="row">
        {canShare && (
          <button type="button" className="chunky go" disabled={!ready} onClick={() => void share()}>
            <ShareNetwork />
            Share link
          </button>
        )}
        <button type="button" className={`chunky ${canShare ? '' : 'go'}`} disabled={!ready} onClick={() => void copy()}>
          <Copy />
          Copy link
        </button>
        {ready ? (
          // Mail links want CRLF line breaks (RFC 6068)
          <a className="chunky" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message.replace(/\n/g, '\r\n'))}`}>
            <Envelope />
            Email it
          </a>
        ) : (
          <button type="button" className="chunky" disabled>
            <Envelope />
            Email it
          </button>
        )}
      </div>
    </Sheet>
  )
}
