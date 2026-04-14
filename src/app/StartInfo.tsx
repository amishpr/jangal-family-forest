import { BRAND } from '../brand'

// What Jangal is, under the start screen's buttons (TODO.md F6): the same About text as the info
// button, and a few one-line points from the old landing page. It's quiet on purpose, so the buttons
// stay the focus. It's also rendered into the page's <noscript> at build time
// (src/site/entry-server.tsx), so it mustn't touch the browser or the stores.

const POINTS: [string, string][] = [
  ['How are we related?', 'Pick any two people and get the answer in plain words, with the chain of people behind it.'],
  ['Private by design', 'No account and no server. Your tree stays in this browser unless you export it.'],
  ['Made for big families', "Each side of the family gets its own green, and branches tuck away when you don't need them."],
  ['Family titles', 'See the Gujarati or Hindi word for each relative, like Kaka, Foi or Masi.'],
  ['Share it your way', 'A page relatives can open on any phone, even offline, a poster PDF, or a backup file.'],
  ['Bring your tree', 'Import a GEDCOM file from Ancestry, FamilySearch or MyHeritage.'],
]

/** BRAND.about, with its Gujarati word marked as Gujarati for screen readers and fonts */
export function AboutText() {
  const [before, ...after] = BRAND.about.split(BRAND.script)
  return (
    <>
      {before}
      {after.length > 0 && <span lang="gu">{BRAND.script}</span>}
      {after.join(BRAND.script)}
    </>
  )
}

export function StartInfo() {
  return (
    <section className="start-info" aria-labelledby="start-info-h">
      <h2 id="start-info-h">About {BRAND.word}</h2>
      <p className="start-about">
        <AboutText />
      </p>
      <ul className="start-points">
        {POINTS.map(([title, text]) => (
          <li key={title}>
            <b>{title}</b>
            {text}
          </li>
        ))}
      </ul>
      <p className="start-foot">
        Free, with nothing to install. <a href={`${import.meta.env.BASE_URL}privacy/`}>Privacy</a>
        {BRAND.repoUrl && (
          <>
            {' · '}
            <a href={BRAND.repoUrl} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </>
        )}
      </p>
    </section>
  )
}
