import { useState } from 'react'
import { toast } from '../../app/actions'
import { readTreeText, summarize, MAX_FILE_BYTES, type ImportPreview } from '../../core/importTree'
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
// one that's open, or to add it to the open one (TODO.md F12).

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

  const read = async (file: File) => {
    setError(null)
    setLoaded(null)
    setConfirmReplace(false)
    setCombining(false)
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
        else setLoaded({ name: file.name, preview: res })
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
          importPhotos={async (t) => (await import('./commitImport')).importPhotos(t)}
          onDone={() => useUi.getState().openSheet(null)}
          onCancel={() => setCombining(false)}
        />
      )}
      {loaded && !combining && (
        <div className="report" style={{ marginTop: 12 }} role="status">
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
