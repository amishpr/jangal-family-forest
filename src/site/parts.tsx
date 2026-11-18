import { BRAND } from '../brand'
import { Wordmark } from '../ui/Wordmark'
import { Moon, Sun } from '../ui/icons'
import { link } from './links'

// Pieces shared by the public pages: the header and the footer

export function SiteHeader() {
  return (
    <header className="site-head">
      <a className="brandlink" href={link()} aria-label={BRAND.full}>
        <Wordmark />
        <span className="sub">- {BRAND.sub}</span>
      </a>
      <div className="head-actions">
        {/* Wired up by the inline script in the page's head. The icon shows the theme it switches to. */}
        <button type="button" className="theme-toggle" aria-label="Dark theme" aria-pressed="false" title="Light or dark">
          <Moon className="to-dark" />
          <Sun className="to-light" />
        </button>
        <a className="chunky" href={link()}>
          Open the app
        </a>
      </div>
    </header>
  )
}

export function Footer() {
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
        {BRAND.repoUrl && <a href={BRAND.repoUrl}>GitHub</a>}
      </nav>
    </footer>
  )
}
