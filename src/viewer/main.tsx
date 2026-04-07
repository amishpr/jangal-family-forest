import '@fontsource-variable/source-sans-3/wght.css'
import '@fontsource-variable/figtree/wght.css'
import '../styles/app.css'
import '../styles/viewer.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '../app/App'
import { viewerMeKey } from '../app/actions'
import type { ExportedTree } from '../core/model'
import { emptyView } from '../core/model'
import { registerInlinePhotos, setInlinePhotosOnly } from '../store/photos'
import { applyFileTitles } from '../store/settings'
import { useTree } from '../store/treeStore'
import { useUi, type Tab } from '../store/uiStore'

// The read only family page (PLAN E-3, 8.10). The tree is inside this same file, in the
// <script id="jangal-data"> block. Everything works offline: there's no database, no autosave, and
// the page's security policy blocks every network request.

function readEmbedded(): ExportedTree | null {
  try {
    const raw = JSON.parse(document.getElementById('jangal-data')?.textContent || '{}')
    if (!raw || typeof raw !== 'object' || !raw.people || typeof raw.people !== 'object') return null
    return { families: {}, view: emptyView(), ...raw } as ExportedTree
  } catch {
    return null
  }
}

setInlinePhotosOnly()
useUi.setState({ readOnly: true })
const tree = readEmbedded()
if (tree) {
  registerInlinePhotos(tree.photos)
  // The page opens with the family titles it was made with (TODO.md TP-8)
  if (tree.titles) applyFileTitles(tree.titles)
  const { photos: _photos, titles: _titles, ...doc } = tree
  void _photos
  void _titles
  // Whoever opens the page can pick who they are. That's kept in their browser, not in the file.
  try {
    const me = localStorage.getItem(viewerMeKey(doc.id))
    if (me === 'none') doc.homePersonId = null
    else if (me && doc.people[me]) doc.homePersonId = me
  } catch {
    // Without localStorage the page opens as it was exported
  }
  useTree.getState().load(doc)
  const view = new URLSearchParams(location.search).get('view')
  if (view === 'timeline' || view === 'fan') useUi.getState().setTab(view as Tab)
} else {
  useTree.getState().setStatus('error', "This page's family tree couldn't be read. The file may be damaged.")
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
