import '@fontsource-variable/source-sans-3/wght.css'
import '@fontsource-variable/figtree/wght.css'
import '../styles/app.css'
import '../styles/gujarati.css'
import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot } from './boot'
import { useTree } from '../store/treeStore'

// The first render waits for the saved tree, which usually takes a few milliseconds, so the tree
// and the chrome paint together instead of a placeholder and then a second full render. If the
// browser's storage is slow to answer, the placeholder shows after a moment.
const root = createRoot(document.getElementById('root')!)
let rendered = false
const render = () => {
  if (rendered) return
  rendered = true
  stop()
  clearTimeout(slow)
  // A transition lets React build the first screen in small slices, so a slow phone stays
  // responsive to taps while the tree is drawn
  startTransition(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
const stop = useTree.subscribe((s) => s.status !== 'loading' && render())
const slow = setTimeout(render, 400)

void boot()

// The service worker keeps a copy of the app for offline use and instant repeat visits. A new
// version never reloads the page by itself: it asks first (PLAN 10.5).
// It starts a few seconds in, so its download of the whole app doesn't compete with the first view.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  setTimeout(() => void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        void import('../store/uiStore').then(({ useUi }) =>
          useUi.getState().showToast('Update ready', { label: 'Reload', run: () => void update(true) }),
        )
      },
    })
  }), 4000)
}

// ?debug puts the stores on window, for tests and for looking around in the console
if (new URLSearchParams(location.search).has('debug')) {
  void Promise.all([import('../store/treeStore'), import('../store/uiStore')]).then(([t, u]) => {
    Object.assign(window, { __jangal: { tree: t.useTree, ui: u.useUi } })
  })
}
