import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../app/actions'
import { useIndex } from '../../app/derive'
import { formatDate, yearsLabel } from '../../core/dates'
import { indexOf, type TreeIndex } from '../../core/index'
import { diffPeople, findMatches, mergeTrees, type Change, type MergeReport } from '../../core/merge'
import type { ExportedTree, ReplyInfo, TreeCore } from '../../core/model'
import { fullName, GENDER_LABELS, type Gender } from '../../core/model'
import { usePhotoUrl } from '../../store/photos'
import { undo, useTree } from '../../store/treeStore'
import { ArrowRight } from '../../ui/icons'

// Combining two trees, the review (TODO.md F12, CM-2 and CM-3): who looks like the same person in
// both, with enough beside each name to tell people apart, and what would change for them. Strong
// matches start ticked. Nothing changes until Combine, and Combine is one undo step. Used by Import
// and by Share's tree list. A relative's reply from a fill-in link (SHARE.md SH-13, SH-14) matches
// the people the link carried by id, and its answers start ticked.

/** "1950 - 2019 · Ahmedabad · child of Mohan and Sita" */
function about(ix: TreeIndex, id: string) {
  const p = ix.person(id)!
  const parents = ix.parentsOf(id).map((x) => ix.person(x)!.firstName)
  return [yearsLabel(p), p.birth?.place, parents.length ? `child of ${parents.join(' and ')}` : ''].filter(Boolean).join(' · ') || 'No dates or parents recorded'
}

/** A value as people say it: "Female", not "female" */
const shown = (c: Change, v: string) => (c.key.endsWith(':gender') ? (GENDER_LABELS[v as Gender] ?? v) : v)

/** A photo by its id: from the file being imported, or from this browser */
function PhotoById({ id, tree, alt }: { id: string; tree: ExportedTree | TreeCore; alt: string }) {
  const inFile = 'photos' in tree ? tree.photos?.[id] : undefined
  const stored = usePhotoUrl(inFile ? undefined : id, 'thumb')
  const src = inFile ? `data:${inFile.mime};base64,${inFile.data}` : stored
  return src ? <img src={src} alt={alt} /> : null
}

type Props = {
  other: ExportedTree | TreeCore
  /** For a file: its photos are added like an import. A tree in this browser already shares them. */
  importPhotos?: (tree: ExportedTree) => Promise<TreeCore['people']>
  /** Set when the file is a relative's reply to a fill-in link */
  reply?: ReplyInfo
  onDone(): void
  onCancel(): void
}

export function MergeReview({ other, importPhotos, reply, onDone, onCancel }: Props) {
  const ix = useIndex()
  const doc = useTree((s) => s.doc)
  // A reply's people match by id, but only the person asked and their partners and children here
  const [{ matches, strangers }] = useState(() => {
    if (!doc) return { matches: [], strangers: 0 }
    if (!reply) return { matches: findMatches(doc, other), strangers: 0 }
    const here = indexOf(doc)
    const theirs = new Set([reply.forId, ...here.partnersOf(reply.forId), ...here.childrenOf(reply.forId)])
    const same = reply.known.filter((id) => theirs.has(id))
    return { matches: findMatches(doc, other, same), strangers: reply.known.length - same.length }
  })
  const [ticked, setTicked] = useState(() => new Set(matches.filter((m) => m.strong).map((m) => m.other)))
  // The differences whose tick is the other way round from the default
  const [flipped, setFlipped] = useState(() => new Set<string>())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<MergeReport | null>(null)
  const theirs = useMemo(() => indexOf(other), [other])
  const pairs = useMemo(() => matches.filter((m) => ticked.has(m.other)).map((m): [string, string] => [m.base, m.other]), [matches, ticked])
  const { changes, fills } = useMemo(() => (doc ? diffPeople(doc, other, pairs, { photos: !!reply }) : { changes: [], fills: 0 }), [doc, other, pairs, reply])
  // It opens in place of a list partway down a sheet, so bring it into view
  const box = useRef<HTMLElement>(null)
  useEffect(() => box.current?.scrollIntoView({ block: 'start' }), [])
  if (!ix || !doc) return null
  const newcomers = Object.keys(other.people).length - ticked.size
  const picked = (key: string) => (reply ? !flipped.has(key) : flipped.has(key))
  const flip = (key: string) => {
    const next = new Set(flipped)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setFlipped(next)
  }
  const who = reply ? other.people[reply.forId] : undefined
  // "Kareena's", or "their" for a name the reply doesn't have
  const whose = who?.firstName ? `${who.firstName}'s` : 'their'
  const sent = reply?.sentAt ? formatDate({ year: Number(reply.sentAt.slice(0, 4)), month: Number(reply.sentAt.slice(5, 7)), day: Number(reply.sentAt.slice(8, 10)) }, true) : ''

  const combine = async () => {
    setBusy(true)
    setError(null)
    try {
      const people = importPhotos ? await importPhotos(other as ExportedTree) : other.people
      const take = new Set(changes.filter((c) => picked(c.key)).map((c) => c.key))
      let done: MergeReport | null = null
      const r = useTree.getState().edit((d) => {
        const res = mergeTrees(d, { people, families: other.families }, pairs, take)
        if (res.ok) done = res.report
        return res
      })
      if (!r.ok) return setError(r.reason)
      setReport(done)
      toast(`Combined the trees: ${done!.added} ${done!.added === 1 ? 'person' : 'people'} added`, { label: 'Undo', run: () => undo() })
    } catch (err) {
      console.error(err)
      setError("The trees couldn't be combined. Try again, or open the file as a new tree.")
    } finally {
      setBusy(false)
    }
  }

  if (report) {
    const notes = [...report.conflicts, ...report.skipped]
    return (
      <div className="report merge" role="status">
        <b>Combined</b>
        <span>
          {report.added} {report.added === 1 ? 'person was' : 'people were'} added, and {report.joined} {report.joined === 1 ? 'person was' : 'people were'} in
          both trees. Undo takes it all back in one step.
        </span>
        {notes.length > 0 && (
          <>
            <span>A few things didn't line up. This tree's details were kept:</span>
            <ul>
              {notes.slice(0, 50).map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </>
        )}
        <div className="row">
          <button type="button" className="chunky go" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    )
  }

  const unmatched = Object.keys(other.people).filter((id) => !ticked.has(id))

  return (
    <section ref={box} className="report merge" aria-labelledby="merge-h">
      {reply ? (
        <>
          <b id="merge-h">{who?.firstName ? `${who.firstName}'s reply` : 'A reply'}</b>
          <span>
            For {reply.treeTitle || 'this tree'}
            {sent && ` · sent ${sent}`}. Nothing changes until you combine, and Undo takes it all back.
          </span>
          <span className="merge-sub">In the tree already</span>
        </>
      ) : (
        <b id="merge-h">Who is in both trees?</b>
      )}
      {matches.length ? (
        !reply && (
          <span>
            These people have the same name in both. Tick the ones who are the same person, and they'll become one. Everyone else is
            added.
          </span>
        )
      ) : (
        <span>
          No one in the other tree has the same name as someone in this one, so there's nowhere to join them. Open it as a new
          tree instead, or add the people who link them to one of the trees first.
        </span>
      )}
      <ul className="merge-list">
        {matches.map((m) => (
          <li key={m.other}>
            <label className="check">
              <input
                type="checkbox"
                checked={ticked.has(m.other)}
                onChange={(e) => {
                  const next = new Set(ticked)
                  if (e.target.checked) next.add(m.other)
                  else next.delete(m.other)
                  setTicked(next)
                }}
              />
              <span>
                <b>{fullName(ix.person(m.base)!)}</b>
                {!m.strong && <em> · same name, check the dates</em>}
                <small>Here: {about(ix, m.base)}</small>
                <small>
                  {reply ? 'In the reply' : 'In the other tree'}: {about(theirs, m.other)}
                </small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {strangers > 0 && (
        <span className="help">
          The reply also names {strangers === 1 ? 'someone' : `${strangers} people`} who {strangers === 1 ? "isn't" : "aren't"} {whose} partner or
          child in this tree, so they're matched by name instead.
        </span>
      )}
      {changes.length > 0 && (
        <>
          <span className="merge-sub">What changes</span>
          <span>
            {reply
              ? `${whose.charAt(0).toUpperCase()}${whose.slice(1)} answers are ticked. Untick any you'd rather keep as they are.`
              : "These are different in the other tree. Tick the ones to take from it; the rest stay as they are here."}
          </span>
          <ul className="merge-list">
            {changes.map((c) => (
              <li key={c.key}>
                <label className="check">
                  <input type="checkbox" checked={picked(c.key)} onChange={() => flip(c.key)} />
                  <span>
                    <b>
                      {c.who} · {c.label}
                    </b>
                    {c.photo ? (
                      <span className="photo-swap">
                        <PhotoById id={c.here} tree={doc} alt="The photo here" />
                        <ArrowRight aria-hidden="true" />
                        <PhotoById id={c.theirs} tree={other} alt={reply ? 'The photo in the reply' : 'The photo in the other tree'} />
                      </span>
                    ) : (
                      <>
                        <small>Here: {shown(c, c.here)}</small>
                        <small>
                          {reply ? 'In the reply' : 'In the other tree'}: {shown(c, c.theirs)}
                        </small>
                      </>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {reply && unmatched.length > 0 && (
        <>
          <span className="merge-sub">New people</span>
          <ul className="merge-list">
            {unmatched.slice(0, 30).map((id) => (
              <li key={id} className="new">
                <span>
                  <b>{fullName(other.people[id])}</b>
                  <small>{about(theirs, id)}</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {fills > 0 && (
        <span>
          Also fills in {fills} blank {fills === 1 ? 'detail' : 'details'}, like a birthday or where someone lives.
        </span>
      )}
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="chunky go" disabled={busy || !ticked.size} aria-describedby={!ticked.size ? 'merge-why' : undefined} onClick={() => void combine()}>
          Combine: add {newcomers} {newcomers === 1 ? 'person' : 'people'}
        </button>
        <button type="button" className="chunky" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!ticked.size && (
        <span id="merge-why" className="help">
          Tick at least one person who is in both trees. That's where the other tree joins this one, so it can be shown.
        </span>
      )}
    </section>
  )
}
