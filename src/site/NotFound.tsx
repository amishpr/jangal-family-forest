import { Footer, SiteHeader } from './parts'
import { link } from './links'

// The 404 page (PLAN 10.1)

export function NotFound({ repoUrl }: { repoUrl: string }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="prose notfound">
        <h1>This page isn't here</h1>
        <p className="lede">The address may have a typo, or the page may have moved. Your family tree is safe in the app.</p>
        <p className="ctas">
          <a className="chunky go" href={link()}>
            Open your tree
          </a>
        </p>
      </main>
      <Footer repoUrl={repoUrl} />
    </>
  )
}
