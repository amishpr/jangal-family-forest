import { AboutText } from '../../app/StartInfo'
import { BRAND } from '../../brand'
import { useHome, useSides } from '../../app/derive'
import { fullName, isSampleTree } from '../../core/model'
import credits from '../../core/sampleCredits.json'
import { useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { LeafPortrait, SeedMark } from '../../ui/Avatar'
import { GithubLogo } from '../../ui/icons'
import { Wordmark } from '../../ui/Wordmark'
import { Sheet } from '../sheets/Sheet'
import { ShortcutList } from './ShortcutsSheet'

// About (PLAN A-8): what the name means, the privacy promise, what the marks and colors mean,
// shortcuts, credits, and the repo link. While the sample family is open, its sources too.

const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') || ''

export default function AboutSheet() {
  const sides = useSides()
  const home = useHome()
  const readOnly = useUi((s) => s.readOnly)
  const sample = useTree((s) => (s.doc ? isSampleTree(s.doc) : false))
  const n = sides?.names
  return (
    <Sheet title={BRAND.full} label={`About ${BRAND.full}`} hideTitle>
      <div className="about-hero">
        <Wordmark />
        <span className="sub">- {BRAND.sub}</span>
      </div>
      <p className="lede">
        <AboutText />
      </p>
      {readOnly && (
        <p className="lede">
          Someone in your family made this page for you. Everything is inside this one file: it works offline and never
          connects to the internet. Pick who you are from the dock to see how everyone is related to you. That choice stays
          in your browser.
        </p>
      )}
      <div className="about-grid">
        <section className="about-card">
          <h3>{readOnly ? 'Want your own?' : 'Private by default'}</h3>
          <p>
            {readOnly
              ? 'Jangal is free, and your tree stays in your own browser. This page doubles as a backup: import it into Jangal to keep building the tree.'
              : "Your tree lives only in this browser. There's no account, and nothing is uploaded. To keep a copy or move it to another computer, use Share, then Backup file."}
          </p>
          {readOnly && SITE && (
            <p style={{ marginTop: 8 }}>
              <a href={`${SITE}/`} target="_blank" rel="noopener noreferrer">
                Make a family tree with Jangal
              </a>
            </p>
          )}
        </section>
        <section className="about-card span2">
          <h3>What you're looking at</h3>
          <ul className="keys">
            <li>
              <span className="av s-own" style={{ ['--sz' as string]: '36px' }}>
                <span className="pic">
                  <LeafPortrait />
                </span>
              </span>
              <span>
                <b>A leaf</b>No photo yet. It takes the person's branch color.
              </span>
            </li>
            <li>
              <span className="mk s-pat">
                <SeedMark />
              </span>
              <span>
                <b>A sprouting seed</b>Someone who has passed away. What they planted keeps growing.
              </span>
            </li>
            <li>
              <span className="sw-you" />
              <span>
                <b>A filled tile</b>
                {home ? 'You. Change who you are from the dock.' : 'You, once you pick yourself from the dock.'}
              </span>
            </li>
            <li>
              <span className="sw-sides">
                <i className="s-pat" />
                <i className="s-mat" />
                <i className="s-own" />
              </span>
              <span>
                <b>Branch colors</b>
                {n ? `${n.paternal}, ${n.maternal}, and ${n.own.toLowerCase()}.` : 'Each side of the family gets its own green.'}
              </span>
            </li>
            <li>
              <span className="sw-dash" />
              <span>
                <b>Dotted lines</b>Adopted, step and foster children, and former partners.
              </span>
            </li>
          </ul>
        </section>
        <section className="about-card">
          <h3>Shortcuts</h3>
          <ShortcutList short />
          {!readOnly && (
            <p className="help" style={{ marginTop: 10 }}>
              To put brothers and sisters in the order you like, press and hold a tile, then drag it left or right.
            </p>
          )}
        </section>
      </div>
      {sample && <SampleCredits />}
      <div className="about-foot">
        <span>
          Type: Eczar, Rasa, Source Sans 3, Figtree. Icons: Phosphor. Canvas: React Flow.{' '}
          {!readOnly && <a href={`${import.meta.env.BASE_URL}privacy/`}>Privacy</a>}
        </span>
        {BRAND.repoUrl && !readOnly && (
          <a className="chunky" href={BRAND.repoUrl} target="_blank" rel="noopener noreferrer">
            <GithubLogo />
            GitHub repo
          </a>
        )}
      </div>
    </Sheet>
  )
}

/** Where the sample family comes from (TODO.md KP-4, KP-5). The photo licenses ask for each author to be named. */
function SampleCredits() {
  const people = useTree((s) => s.doc?.people)
  return (
    <details className="about-card credits">
      <summary>About the sample family</summary>
      <p>
        The Kapoor family of Hindi cinema, from Prithviraj Kapoor to Ranbir's generation, with the Bhatts and the Bachchans.
        It opens with Ranbir's own line; the + pills show the rest. The facts are from Wikipedia. Where
        no birthday was published, one was made up, and it says "about". Nobody under 18 is included. The photos are freely
        licensed ones from Wikimedia Commons:
      </p>
      <ul>
        {Object.entries(credits).map(([id, c]) => (
          <li key={id}>
            <a href={c.source} target="_blank" rel="noopener noreferrer">
              {people?.[id] ? fullName(people[id]) : id}
            </a>
            {' '}by {c.author},{' '}
            {c.licenseUrl ? (
              <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">
                {c.license}
              </a>
            ) : (
              c.license
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
