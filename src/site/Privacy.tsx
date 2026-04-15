import { Footer, SiteHeader } from './parts'
import { link } from './links'

// The privacy page (PLAN W-6): what happens to your data, in plain words

export function Privacy({ repoUrl }: { repoUrl: string }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="prose">
        <h1>Privacy</h1>
        <p className="lede">The short version: your family tree never leaves your browser unless you export it yourself.</p>

        <h2>Where your tree is kept</h2>
        <p>
          Everything you add, including names, dates, notes and photos, is saved in this browser's own storage on this device.
          There's no account and no server that holds a copy. If you use another browser or another computer, you'll need
          your backup file to bring the tree along.
        </p>

        <h2>What leaves your device</h2>
        <p>
          Nothing, unless you choose to export. A family page, a poster PDF, a picture, a calendar file or a backup file is made
          right in your browser and saved to your computer. What you do with it after that, like emailing it to relatives, is
          up to you.
        </p>
        <p>
          A family page can hide the birthdays, notes and photos of people who are living. It also has a security setting that
          stops it from connecting to the internet at all, so opening it can't send anything anywhere.
        </p>

        <h2>No tracking</h2>
        <p>
          There are no analytics, ads, cookies or tracking scripts, and no fonts or code from other companies. The only small
          things kept in your browser besides your trees are your light or dark theme, and whether this browser has a tree, so
          the home page can open the app for you.
        </p>

        <h2>The website itself</h2>
        <p>
          Like any website, the company that hosts these pages receives the standard details of each request, such as the page
          asked for and the address it came from. Those logs never include your family tree, because your tree is never sent.
        </p>

        <h2>Keeping your tree safe</h2>
        <p>
          Because your tree lives only in your browser, clearing your browsing data can delete it. Download a backup from Share
          now and then, and keep it somewhere safe.
        </p>

        <p className="ctas">
          <a className="chunky go" href={link()}>
            Open the app
          </a>
        </p>
      </main>
      <Footer repoUrl={repoUrl} />
    </>
  )
}
