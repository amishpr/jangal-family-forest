import { lazy, Suspense, useEffect, useState } from 'react'
import { BrandPill, MadeCredit } from '../features/chrome/BrandPill'
import { Corner, Dock, Tabs } from '../features/chrome/Chrome'
import TreeCanvas from '../features/canvas/TreeCanvas'
import { TraitBar } from '../features/canvas/TraitBar'
import { applyTheme, useSettings } from '../store/settings'
import { useTree } from '../store/treeStore'
import { useUi } from '../store/uiStore'
import { EmptyStart, Skeleton } from './EmptyStart'
import { useShortcuts } from './shortcuts'
import { Toast } from './Toast'
import { PrintFoot, PrintHead } from './PrintHead'

// The app screen (PLAN 7). The Tree tab, the dock and the chrome load first. Everything else
// (the other tabs, the person card, the sheets) loads the first time it's opened (PLAN 10.5).

const TimelineTab = lazy(() => import('../features/timeline/TimelineTab'))
const FanTab = lazy(() => import('../features/fan/FanTab'))
const PersonCard = lazy(() => import('../features/person/PersonCard'))
const SheetHost = lazy(() => import('../features/sheets/SheetHost'))

export function App() {
  const status = useTree((s) => s.status)
  const error = useTree((s) => s.error)
  const tab = useUi((s) => s.tab)
  const card = useUi((s) => s.card)
  const sheet = useUi((s) => s.sheet)
  const theme = useSettings((s) => s.theme)
  const colors = useSettings((s) => s.branchColors)
  const readOnly = useUi((s) => s.readOnly)
  const saveFailed = useUi((s) => s.save === 'error')
  // With a tree, the start page shows only when it's opened from About
  const startPage = useUi((s) => s.startPage)
  useShortcuts()

  // The tree is the heavy part of the first render. The chrome (the title, tabs and dock) paints
  // first and the tree a frame later, so the page shows up without waiting for every tile.
  const [treeShown, setTreeShown] = useState(false)
  useEffect(() => {
    if (status !== 'ready' || treeShown) return
    let live = true
    requestAnimationFrame(() => setTimeout(() => live && setTreeShown(true)))
    return () => {
      live = false
    }
  }, [status, treeShown])

  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    if (sheet) document.body.dataset.sheet = sheet
    else delete document.body.dataset.sheet
  }, [sheet])

  return (
    <div data-colors={colors ? 'on' : 'off'} style={{ display: 'contents' }}>
      {status === 'loading' && <Skeleton />}
      {status === 'error' && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
      {(status === 'empty' || (status === 'ready' && startPage)) && <EmptyStart />}
      {saveFailed && (
        // PLAN 6.10: never lose work to a storage problem
        <div className="banner" role="alert">
          Your latest changes couldn't be saved in this browser. Download a backup so nothing is lost.
          <button
            type="button"
            className="chunky"
            onClick={() => void import('../features/export/exportJson').then((m) => m.exportBackup(true))}
          >
            Download a backup
          </button>
        </div>
      )}
      {status === 'ready' && !startPage && (
        <>
          <PrintHead />
          {tab === 'tree' && treeShown && <TreeCanvas />}
          <Suspense fallback={null}>
            {tab === 'timeline' && <TimelineTab />}
            {tab === 'fan' && <FanTab />}
          </Suspense>
          <BrandPill />
          <Tabs />
          <Corner />
          <Dock />
          {tab === 'tree' && <TraitBar />}
          {readOnly && <MadeCredit />}
          <PrintFoot />
        </>
      )}
      <Suspense fallback={null}>
        {status === 'ready' && card && <PersonCard />}
        {sheet && <SheetHost />}
      </Suspense>
      <Toast />
    </div>
  )
}
