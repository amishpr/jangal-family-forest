import { useEffect, useState } from 'react'
import { toast } from '../../app/actions'
import { firstNameOf } from '../../app/actions'
import { useHome, useTitle } from '../../app/derive'
import { openNewTree, openSample, startNewTree } from '../../app/boot'
import { BRAND } from '../../brand'
import { isSampleTree, type TreeDoc } from '../../core/model'
import { deleteTree, listTrees, loadTree, type TreeMeta } from '../../store/persist'
import { useSettings } from '../../store/settings'
import { packFor } from '../../core/titles'
import { currentTreeDoc, useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { Browser, FileArrowUp, FloppyDisk, Image, PencilSimple, Plus, Printer, Table, Trash, TreeStructure } from '../../ui/icons'
import { Wordmark } from '../../ui/Wordmark'
import { Sheet } from '../sheets/Sheet'
import { MergeReview } from '../import/MergeReview'
import { PAGE_SIZES, type PageSize } from './pageSizes'

// Share (PLAN E-1 to E-6, 6.12). The cover shows what shared pages and posters open with: the
// family's title first, Jangal as a small credit. Then the three ways to share, each with its
// options, and the trees kept in this browser (A-3).

type Kind = 'page' | 'pdf' | 'json' | 'sheet'

export default function ShareSheet() {
  const { title, subtitle, stats, showStats } = useTitle()
  const home = useHome()
  const [kind, setKind] = useState<Kind>('page')
  const [busy, setBusy] = useState(false)
  // Page options
  const [pagePhotos, setPagePhotos] = useState(true)
  const [hideLiving, setHideLiving] = useState(false)
  const [pageTraits, setPageTraits] = useState(true)
  const [withTitles, setWithTitles] = useState(true)
  const [sheetFormat, setSheetFormat] = useState<'xlsx' | 'csv'>('xlsx')
  // The family titles in use, if tiles aren't in English (TODO.md TP-8)
  const titlesName = useSettings((s) => packFor(s.titles, s.titles.lang)?.name)
  const [openAs, setOpenAs] = useState<'me' | 'neutral'>(home ? 'me' : 'neutral')
  // Poster options
  const [size, setSize] = useState<PageSize>(() => (navigator.language.startsWith('en-US') ? 'letter' : 'a4'))
  const [everyone, setEveryone] = useState(true)
  const [pdfPhotos, setPdfPhotos] = useState(true)
  const [dates, setDates] = useState(true)
  const [profiles, setProfiles] = useState(true)
  const colors = useSettings((s) => s.branchColors)
  // The poster draws the tree. From the other tabs, Share points to printing the view (PRINT.md PT-10)
  const tab = useUi((s) => s.tab)
  const printView = () => {
    useUi.getState().openSheet(null)
    requestAnimationFrame(() => setTimeout(() => window.print()))
  }
  // Backup options
  const [jsonPhotos, setJsonPhotos] = useState(true)

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      toast(label)
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'That export failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const doExport = () => {
    const doc = currentTreeDoc()
    if (!doc) return
    if (kind === 'page') {
      return run('Family page downloaded', async () => {
        const { exportFamilyPage } = await import('./exportHtml')
        await exportFamilyPage({ photos: pagePhotos, hideLiving, openAs, traits: pageTraits, titles: withTitles })
      })
    }
    if (kind === 'pdf') {
      return run('Poster downloaded', async () => {
        const { exportPdf } = await import('./exportPdf')
        await exportPdf(doc, { size, everyone, photos: pdfPhotos, dates, profiles, colors })
      })
    }
    if (kind === 'sheet') {
      return run('Spreadsheet downloaded', async () => {
        const { exportSheet } = await import('./exportSheet')
        exportSheet(sheetFormat)
      })
    }
    return run('Backup downloaded', async () => {
      const { exportBackup } = await import('./exportJson')
      await exportBackup(jsonPhotos, withTitles)
    })
  }

  const exportImage = (format: 'png' | 'svg') =>
    run(format === 'png' ? 'Picture downloaded' : 'SVG downloaded', async () => {
      const doc = currentTreeDoc()
      if (!doc) return
      const { exportImage: go } = await import('./exportImage')
      await go(doc, format, { everyone, photos: pdfPhotos, dates, colors })
    })

  const CARDS: { id: Kind; Icon: typeof Browser; title: string; text: string }[] = [
    { id: 'page', Icon: Browser, title: 'A page for family', text: 'One file that opens anywhere, even offline. Relatives can pick who they are.' },
    { id: 'pdf', Icon: Printer, title: 'Poster PDF', text: 'The whole tree for the reunion, plus profile pages.' },
    { id: 'json', Icon: FloppyDisk, title: 'Backup file', text: 'Everything, photos too, and who you are. Load it back any time.' },
    { id: 'sheet', Icon: Table, title: 'Spreadsheet', text: 'One row per person, with parents and partners, for Excel, Google Sheets or Numbers.' },
  ]

  return (
    <Sheet title="Share the tree" label="Share the tree">
      <div className="cover">
        <span className="eyebrow">Shared pages and posters open with</span>
        <b>{title}</b>
        {subtitle && <span className="c-sub">{subtitle}</span>}
        {showStats && stats && <span className="c-stats">{stats}</span>}
        <span className="made">
          Made with <Wordmark />
        </span>
        <button type="button" className="mini" onClick={() => useUi.getState().setEditingTitle(true)}>
          <PencilSimple />
          Edit title
        </button>
      </div>

      <div className="exports" role="radiogroup" aria-label="What to share">
        {CARDS.map(({ id, Icon, title: t, text }) => (
          <button key={id} type="button" className="exp" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}>
            <Icon />
            <b>{t}</b>
            <span>{text}</span>
          </button>
        ))}
      </div>

      <div className="exp-opts">
        {kind === 'page' && (
          <>
            <label className="check">
              <input type="checkbox" checked={pagePhotos} onChange={(e) => setPagePhotos(e.target.checked)} />
              Include photos
            </label>
            <label className="check">
              <input type="checkbox" checked={pageTraits} onChange={(e) => setPageTraits(e.target.checked)} />
              Include traits
            </label>
            <label className="check">
              <input type="checkbox" checked={hideLiving} onChange={(e) => setHideLiving(e.target.checked)} />
              Hide birthdays, homes, notes, traits and photos of people who are living
            </label>
            <div className="seg" role="radiogroup" aria-label="Open as">
              <span className="lbl">Opens as</span>
              <button type="button" aria-pressed={openAs === 'me'} disabled={!home} onClick={() => setOpenAs('me')}>
                {home ? firstNameOf(home) : 'You'}
              </button>
              <button type="button" aria-pressed={openAs === 'neutral'} onClick={() => setOpenAs('neutral')}>
                Neutral
              </button>
            </div>
          </>
        )}
        {kind === 'pdf' && (
          <>
            <label className="fl" style={{ minWidth: 200 }}>
              Page size
              <select className="field-in" value={size} onChange={(e) => setSize(e.target.value as PageSize)}>
                {Object.entries(PAGE_SIZES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="seg" role="radiogroup" aria-label="Who">
              <button type="button" aria-pressed={everyone} onClick={() => setEveryone(true)}>
                Everyone
              </button>
              <button type="button" aria-pressed={!everyone} onClick={() => setEveryone(false)}>
                What's showing
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={pdfPhotos} onChange={(e) => setPdfPhotos(e.target.checked)} />
              Photos
            </label>
            <label className="check">
              <input type="checkbox" checked={dates} onChange={(e) => setDates(e.target.checked)} />
              Dates
            </label>
            <label className="check">
              <input type="checkbox" checked={profiles} onChange={(e) => setProfiles(e.target.checked)} />
              Profile pages after the poster
            </label>
            {tab !== 'tree' && (
              <p className="help" style={{ flexBasis: '100%' }}>
                The poster draws the tree.{' '}
                <button type="button" className="linkish" onClick={printView}>
                  Print the {tab === 'fan' ? 'fan chart' : 'timeline'} instead
                </button>
              </p>
            )}
          </>
        )}
        {kind === 'json' && (
          <label className="check">
            <input type="checkbox" checked={jsonPhotos} onChange={(e) => setJsonPhotos(e.target.checked)} />
            Include photos
          </label>
        )}
        {titlesName && (kind === 'page' || kind === 'json') && (
          <label className="check">
            <input type="checkbox" checked={withTitles} onChange={(e) => setWithTitles(e.target.checked)} />
            Include the family titles ({titlesName}), so it opens with the same words
          </label>
        )}
        {kind === 'sheet' && (
          <>
            <div className="seg" role="radiogroup" aria-label="File type">
              <span className="lbl">File</span>
              <button type="button" aria-pressed={sheetFormat === 'xlsx'} onClick={() => setSheetFormat('xlsx')}>
                Excel (.xlsx)
              </button>
              <button type="button" aria-pressed={sheetFormat === 'csv'} onClick={() => setSheetFormat('csv')}>
                CSV
              </button>
            </div>
            <p className="help">
              It keeps people, their parents and partners, dates, places, traits and notes, and imports back in. Photos and
              partnership dates stay in the backup file.{' '}
              <button
                type="button"
                className="linkish"
                onClick={() => void run('Template downloaded', async () => (await import('./exportSheet')).downloadTemplate(sheetFormat))}
              >
                Or download an empty template
              </button>
            </p>
          </>
        )}
      </div>
      <div className="row">
        <button type="button" className="chunky go" disabled={busy} onClick={() => void doExport()} aria-busy={busy}>
          {busy ? 'Making the file' : { page: 'Download the page', pdf: 'Download the PDF', json: 'Download the backup', sheet: 'Download the spreadsheet' }[kind]}
        </button>
        {kind === 'pdf' && (
          <>
            <button type="button" className="chunky" disabled={busy} onClick={() => void exportImage('png')}>
              <Image />
              Picture (PNG)
            </button>
            <button type="button" className="chunky" disabled={busy} onClick={() => void exportImage('svg')}>
              SVG
            </button>
          </>
        )}
      </div>

      <h3 className="subhead">Your trees</h3>
      <TreeList />
    </Sheet>
  )
}

/**
 * The trees kept in this browser: open, duplicate, delete, or start a new one (PLAN A-3). The sample
 * family is always one click away too, even once you have trees of your own (TODO.md F8).
 */
function TreeList() {
  const currentId = useTree((s) => s.doc?.id)
  const [trees, setTrees] = useState<TreeMeta[] | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  // Another tree in this browser, being combined into the open one (TODO.md F12)
  const [combining, setCombining] = useState<TreeDoc | null>(null)
  const refresh = () => void listTrees().then(setTrees)
  useEffect(refresh, [currentId])
  if (!trees) return null
  if (combining) {
    const back = () => {
      setCombining(null)
      refresh()
    }
    return <MergeReview other={combining} onDone={back} onCancel={back} />
  }
  const open = async (id: string) => {
    const doc = await loadTree(id)
    if (doc) await openNewTree(doc)
  }
  const duplicate = async (id: string) => {
    const doc = await loadTree(id)
    if (!doc) return
    const { nanoid } = await import('nanoid')
    await openNewTree({ ...doc, id: nanoid(10), title: `${doc.title} (copy)`, titleAuto: false, meta: { ...doc.meta, createdAt: new Date().toISOString() } })
    toast('Opened a copy of the tree')
  }
  const remove = async (id: string) => {
    await deleteTree(id)
    setConfirm(null)
    if (id === currentId) {
      const rest = (await listTrees()).filter((t) => t.id !== id)
      if (rest[0]) await open(rest[0].id)
      else {
        useUi.getState().openSheet(null)
        useTree.getState().setStatus('empty')
      }
    }
    refresh()
    toast('Tree deleted from this browser')
  }
  return (
    <div className="trees">
      {trees.map((t) => (
        <div key={t.id} className={`tree-row ${t.id === currentId ? 'current' : ''}`}>
          <TreeStructure />
          <span className="t-name">
            <b>{t.title || 'Untitled tree'}</b>
            <span>
              {t.people} {t.people === 1 ? 'person' : 'people'}
              {t.id === currentId ? ' · open now' : ''}
            </span>
          </span>
          <span className="t-acts">
            {t.id !== currentId && (
              <button type="button" className="mini" onClick={() => void open(t.id)}>
                Open
              </button>
            )}
            <button type="button" className="mini" onClick={() => void duplicate(t.id)}>
              Duplicate
            </button>
            {t.id !== currentId && (
              <button type="button" className="mini" aria-label={`Combine ${t.title || 'this tree'} into the open tree`} onClick={() => void loadTree(t.id).then(setCombining)}>
                Combine
              </button>
            )}
            {confirm === t.id ? (
              <button type="button" className="mini danger" onClick={() => void remove(t.id)}>
                <Trash />
                Delete for good
              </button>
            ) : (
              <button type="button" className="mini" aria-label={`Delete ${t.title}`} onClick={() => setConfirm(t.id)}>
                <Trash />
              </button>
            )}
          </span>
        </div>
      ))}
      <div className="row">
        <button type="button" className="chunky" onClick={() => void startNewTree()}>
          <Plus />
          Start a new tree
        </button>
        <button type="button" className="chunky" onClick={() => useUi.getState().openSheet('import')}>
          <FileArrowUp />
          Import a file
        </button>
        {!(currentId && isSampleTree({ id: currentId })) && (
          <button type="button" className="chunky" onClick={() => void openSample()}>
            <TreeStructure />
            Explore the sample family
          </button>
        )}
      </div>
      <p className="help" style={{ marginTop: 10 }}>
        Trees live only in this browser. Deleting one can't be undone, so download a backup first if you might want it back.
        {' '}
        {BRAND.word} never uploads anything.
      </p>
    </div>
  )
}
