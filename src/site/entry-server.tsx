import { renderToStaticMarkup } from 'react-dom/server'
import { StartInfo } from '../app/StartInfo'
import { NotFound } from './NotFound'
import { Privacy } from './Privacy'
import { setBase } from './links'

// Rendered at build time by scripts/prerender.mjs (PLAN 10.1). The privacy and 404 pages become
// plain HTML. 'start' is what the app's start screen says about Jangal, written into the app page's
// <noscript> so search engines and people without JavaScript can read it (TODO.md HP-4).

export type Page = 'privacy' | 'notFound' | 'start'

export function render(page: Page, opts: { base: string }): string {
  setBase(opts.base)
  if (page === 'start') return renderToStaticMarkup(<StartInfo />)
  if (page === 'privacy') return renderToStaticMarkup(<Privacy />)
  return renderToStaticMarkup(<NotFound />)
}

/** The backup file format as JSON Schema, published at /schema/v1.json (PLAN 8.10) */
export { treeFileJsonSchema } from './jsonSchema'
