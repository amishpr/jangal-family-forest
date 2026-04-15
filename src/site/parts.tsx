import { BRAND } from '../brand'
import { Wordmark } from '../ui/Wordmark'
import { link } from './links'

// Pieces shared by the public pages: the header and the footer

export function SiteHeader() {
  return (
    <header className="site-head">
      <a className="brandlink" href={link()} aria-label={BRAND.full}>
        <Wordmark />
        <span className="sub">- {BRAND.sub}</span>
      </a>
      <a className="chunky" href={link()}>
        Open the app
      </a>
    </header>
  )
}

export function Footer({ repoUrl }: { repoUrl: string }) {
  return (
    <footer className="site-foot">
      <p className="foot-brand">
        <Wordmark /> <span className="sub">- {BRAND.sub}</span>
      </p>
      <p className="foot-about">
        <span lang="gu">જંગલ</span> (Jangal) is Gujarati and Hindi for forest.
      </p>
      <nav aria-label="More">
        <a href={link()}>Open the app</a>
        <a href={link('privacy/')}>Privacy</a>
        {repoUrl && <a href={repoUrl}>GitHub</a>}
      </nav>
    </footer>
  )
}
