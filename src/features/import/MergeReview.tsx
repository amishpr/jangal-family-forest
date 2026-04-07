import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '../../app/actions'
import { useIndex } from '../../app/derive'
import { yearsLabel } from '../../core/dates'
import { indexOf, type TreeIndex } from '../../core/index'
import { findMatches, mergeTrees, type MergeReport } from '../../core/merge'
import type { ExportedTree, TreeCore } from '../../core/model'
import { fullName } from '../../core/model'
import { undo, useTree } from '../../store/treeStore'

// Combining two trees, the review (TODO.md F12, CM-2 and CM-3): who looks like the same person in
// both, with enough beside each name to tell people apart. Strong matches start ticked. Nothing
// changes until Combine, and Combine is one undo step. Used by Import and by Share's tree list.

/** "1950 - 2019 · Ahmedabad · child of Mohan and Sita" */
function about(ix: TreeIndex, id: string) {
  const p = ix.person(id)!
  const parents = ix.parentsOf(id).map((x) => ix.person(x)!.firstName)
  return [yearsLabel(p), p.birth?.place, parents.length ? `child of ${parents.join(' and ')}` : ''].filter(Boolean).join(' · ') || 'No dates or parents recorded'
}

type Props = {
  other: ExportedTree | TreeCore
  /** For a file: its photos are added like an import. A tree in this browser already shares them. */
  importPhotos?: (tree: ExportedTree) => Promise<TreeCore['people']>
  onDone(): void
  onCancel(): void
}

export function MergeReview({ other, importPhotos, onDone, onCancel }: Props) {
  const ix = useIndex()
  const doc = useTree((s) => s.doc)
  const [matches] = useState(() => (doc ? findMatches(doc, other) : []))
  const [ticked, setTicked] = useState(() => new Set(matches.filter((m) => m.strong).map((m) => m.other)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<MergeReport | null>(null)
  const theirs = useMemo(() => indexOf(other), [other])
  // It opens in place of a list partway down a sheet, so bring it into view
  const box = useRef<HTMLElement>(null)
  useEffect(() => box.current?.scrollIntoView({ block: 'start' }), [])
  if (!ix || !doc) return null
  const newcomers = Object.keys(other.people).length - ticked.size

  const combine = async () => {
    setBusy(true)
    setError(null)
    try {
      const people = importPhotos ? await importPhotos(other as ExportedTree) : other.people
      const pairs = matches.filter((m) => ticked.has(m.other)).map((m): [string, string] => [m.base, m.other])
      let done: MergeReport | null = null
      const r = useTree.getState().edit((d) => {
        const res = mergeTrees(d, { people, families: other.families }, pairs)
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

  return (
    <section ref={box} className="report merge" aria-labelledby="merge-h">
      <b id="merge-h">Who is in both trees?</b>
      {matches.length ? (
        <span>
          These people have the same name in both. Tick the ones who are the same person, and they'll become one. Everyone else is
          added.
        </span>
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
                <small>In the other tree: {about(theirs, m.other)}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
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
