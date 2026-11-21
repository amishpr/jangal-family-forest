import { useState } from 'react'
import { toast } from '../../app/actions'
import { openNewTree } from '../../app/boot'
import { readTreeText, summarize, MAX_FILE_BYTES, type ImportPreview } from '../../core/importTree'
import type { ReplyInfo } from '../../core/model'
import { listTrees, loadTree } from '../../store/persist'
import { applyFileTitles } from '../../store/settings'
import { packFor } from '../../core/titles'
import { useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { FileArrowUp } from '../../ui/icons'
import { Sheet } from '../sheets/Sheet'
import { MergeReview } from './MergeReview'

// Import (PLAN E-2, E-8, TODO.md F3): a backup file, a family page exported from Jangal, a GEDCOM file
// from Ancestry, FamilySearch or MyHeritage, or a spreadsheet filled in from the template. You see
// what's in it before anything changes, and it opens as a new tree unless you choose to replace the
// one that's open, or to add it to the open one (TODO.md F12). A relative's reply from a fill-in
// link (SHARE.md SH-12) goes straight to the review when it's for the open tree.

type Loaded = { name: string; preview: ImportPreview; report?: string[] }

export default function ImportSheet() {
  const hasTree = useTree((s) => !!s.doc)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [combining, setCombining] = useState(false)
  const [useTitles, setUseTitles] = useState(true)
  // A reply for a tree other than the open one: that tree, if it's in this browser
  const [replyTree, setReplyTree] = useState<{ id: string; title: string } | 'missing' | null>(null)

  /** A reply joins the tree it's for: straight to the review, or that tree opened first */
  const placeReply = async (reply: ReplyInfo) => {
    if (useTree.getState().doc?.id === reply.treeId) return setCombining(true)
    const t = (await listTrees()).find((x) => x.id === reply.treeId)
    setReplyTree(t ? { id: t.id, title: t.title || reply.treeTitle } : 'missing')
  }
  const openReplyTree = async (id: string) => {
    setBusy(true)
    try {
      const doc = await loadTree(id)
      if (!doc) return setError("That tree couldn't be opened.")
      await openNewTree(doc)
      setReplyTree(null)
      setCombining(true)
    } finally {
      setBusy(false)
    }
  }

  const read = async (file: File) => {
    setError(null)
    setLoaded(null)
    setConfirmReplace(false)
    setCombining(false)
    setReplyTree(null)
    if (file.size > MAX_FILE_BYTES) return setError('That file is over 100 MB, which is too big to be a family tree.')
    setBusy(true)
    try {
      const text = await file.text()
      if (/\.(csv|tsv|txt|xlsx)$/i.test(file.name)) {
        const { readSheetFile } = await import('../../core/sheet/import')
        const res = readSheetFile(await file.arrayBuffer())
        if (!res.ok) setError(res.error)
        else setLoaded({ name: file.name, preview: res.preview, report: res.report })
      } else if (/\.ged$/i.test(file.name) || /^﻿?\s*0\s+HEAD/.test(text)) {
        const { readGedcomFile } = await import('../../core/gedcom/import')
        const res = readGedcomFile(await file.arrayBuffer())
        if (!res.ok) setError(res.error)
        else setLoaded({ name: file.name, preview: res.preview, report: res.report })
      } else {
        const res = readTreeText(text, file.name)
        if (!res.ok) setError(res.error)
        else {
          setLoaded({ name: file.name, preview: res })
          if (res.tree.reply) await placeReply(res.tree.reply)
        }
      }
    } catch (err) {
      console.error(err)
      setError("That file couldn't be read.")
    } finally {
      setBusy(false)
    }
  }

  const commit = async (mode: 'new' | 'replace') => {
    if (!loaded) return
    setBusy(true)
    try {
      const { commitImport } = await import('./commitImport')
      const doc = await commitImport(loaded.preview.tree, mode)
      const titles = loaded.preview.tree.titles
      if (titles && useTitles) applyFileTitles(titles)
      useUi.getState().openSheet(null)
      toast(`Opened ${doc.title || 'the imported tree'}`)
    } catch (err) {
      console.error(err)
      setError("The tree couldn't be saved in this browser. Try again, or free up some space.")
      setBusy(false)
    }
  }

  return (
    <Sheet title="Import a family tree" label="Import a family tree">
      <p className="lede">
        Open a backup file, a family page someone sent you, a GEDCOM file exported from Ancestry, FamilySearch or MyHeritage,
        or a spreadsheet. You'll see what's in it before anything changes.
      </p>
      <label
        className={`drop ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) void read(f)
        }}
      >
        <FileArrowUp style={{ fontSize: 30, color: 'var(--leaf-deep)' }} />
        <span>{busy ? 'Reading the file' : 'Drop a file here, or click to choose one'}</span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>.jangal.json, .json, .html, .ged, .xlsx or .csv</span>
        <input
          type="file"
          accept=".json,.html,.htm,.ged,.csv,.xlsx,application/json,text/html,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          data-autofocus
          onChange={(e) => {
            const f = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (f) void read(f)
          }}
        />
      </label>
      <p className="help sheet-tip">
        Starting from scratch? Fill in a spreadsheet in Excel, Google Sheets or Numbers, one row per person, then drop it here.{' '}
        Download the template for{' '}
        <button type="button" className="linkish" onClick={() => void downloadTemplate('xlsx')}>
          Excel
        </button>{' '}
        or as{' '}
        <button type="button" className="linkish" onClick={() => void downloadTemplate('csv')}>
          CSV
        </button>
        .
      </p>
      {error && (
        <p className="err" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}
      {loaded && combining && (
        <MergeReview
          other={loaded.preview.tree}
          reply={loaded.preview.tree.reply}
          importPhotos={async (t) => (await import('./commitImport')).importPhotos(t)}
          onDone={() => useUi.getState().openSheet(null)}
          onCancel={() => setCombining(false)}
        />
      )}
      {loaded && !combining && typeof replyTree === 'object' && replyTree && (
        <div className="report" style={{ marginTop: 12 }} role="status">
          <b>{loaded.preview.tree.title}</b>
          <span>This reply is for {replyTree.title}, which isn't the tree that's open. Open it to add the reply to it.</span>
          <div className="row" style={{ marginTop: 4 }}>
            <button type="button" className="chunky go" disabled={busy} onClick={() => void openReplyTree(replyTree.id)}>
              Open {replyTree.title}
            </button>
          </div>
        </div>
      )}
      {loaded && !combining && !(typeof replyTree === 'object' && replyTree) && (
        <div className="report" style={{ marginTop: 12 }} role="status">
          {replyTree === 'missing' && (
            <span>
              This reply is for {loaded.preview.tree.reply?.treeTitle || 'a tree'}, which isn't in this browser. You can open it as a tree of
              its own, or add it to the open tree.
            </span>
          )}
          <b>{loaded.preview.tree.title || loaded.name}</b>
          <span>{summarize(loaded.preview)}</span>
          {(loaded.report?.length || loaded.preview.warnings.length) > 0 && (
            <ul>
              {[...(loaded.report ?? []), ...loaded.preview.warnings].slice(0, 50).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {loaded.preview.tree.titles && (
            <label className="check">
              <input type="checkbox" checked={useTitles} onChange={(e) => setUseTitles(e.target.checked)} />
              Use this file's family titles ({titlesName(loaded.preview.tree.titles)}) in this browser
            </label>
          )}
          <div className="row" style={{ marginTop: 4 }}>
            <button type="button" className="chunky go" disabled={busy} onClick={() => void commit('new')}>
              Open as a new tree
            </button>
            {hasTree && (
              <button type="button" className="chunky" disabled={busy} onClick={() => setCombining(true)}>
                Add to the open tree
              </button>
            )}
            {hasTree &&
              (confirmReplace ? (
                <button type="button" className="chunky danger" disabled={busy} onClick={() => void commit('replace')}>
                  Replace the open tree
                </button>
              ) : (
                <button type="button" className="chunky" onClick={() => setConfirmReplace(true)}>
                  Replace the open tree
                </button>
              ))}
          </div>
          {confirmReplace && (
            <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 600 }}>
              The open tree will be replaced. Export a backup first if you want to keep it.
            </span>
          )}
        </div>
      )}
    </Sheet>
  )
}

/** "Marathi": the name of the language a file's family titles are in */
function titlesName(t: { lang: string; pack?: unknown }): string {
  const own = t.pack as { name?: string } | undefined
  return own?.name ?? packFor({}, t.lang)?.name ?? t.lang
}

/** The template, from a lazily loaded module, so the spreadsheet code loads only when it's used */
const downloadTemplate = (format: 'xlsx' | 'csv') =>
  import('../export/exportSheet')
    .then((m) => m.downloadTemplate(format))
    .catch(() => toast("The template couldn't be made. Check the connection and try again."))
