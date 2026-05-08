// Size budgets (PLAN 10.5), checked by `npm run size` after a build. The app's first load is
// every script the built index.html asks for up front: its entry and each modulepreload.
import { existsSync, readFileSync } from 'node:fs'

const appHtml = 'dist/index.html'
const firstLoad = existsSync(appHtml)
  ? [...readFileSync(appHtml, 'utf8').matchAll(/<(?:script type="module"[^>]*\bsrc|link rel="modulepreload"[^>]*\bhref)="([^"]+\.js)"/g)].map(
      (m) => 'dist/' + m[1].replace(/^.*?assets\//, 'assets/'),
    )
  : []
if (!firstLoad.length) throw new Error('Build first: npm run build')

export default [
  {
    name: 'App: the HTML page at "/"',
    path: 'dist/index.html',
    limit: '10 KB',
  },
  {
    name: 'Privacy page: HTML with its CSS inlined',
    path: 'dist/privacy/index.html',
    limit: '25 KB',
  },
  {
    name: `App: JavaScript on first load (${firstLoad.length} files)`,
    path: firstLoad,
    limit: '200 KB',
  },
  {
    name: 'App: CSS',
    path: 'dist/assets/app-*.css',
    limit: '25 KB',
  },
  {
    name: 'Fonts: Source Sans 3 and Figtree, Latin',
    path: ['dist/assets/source-sans-3-latin-wght-normal-*.woff2', 'dist/assets/figtree-latin-wght-normal-*.woff2'],
    limit: '70 KB',
    brotli: false,
  },
]
