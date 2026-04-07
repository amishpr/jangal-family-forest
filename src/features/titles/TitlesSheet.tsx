import { useRef, useState, type KeyboardEvent } from 'react'
import { BUILT_IN_PACKS, packFor, TITLE_GROUPS, TITLE_KEYS, titleLangs, titleWords, type TitleKey, type TitlePack, type WordChange } from '../../core/titles'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/uiStore'
import { FileArrowUp } from '../../ui/icons'
import { download } from '../export/download'
import { Sheet } from '../sheets/Sheet'
import { NewLanguage } from './NewLanguage'

// Family titles (FAMILY-RELATIONS.MD, TODO.md F4): tiles and cards in English, or in the words a
// family uses (Kaka, Foi, Masi), and which of those words this family says. Families who speak
// another language, or say these differently, fill in a template and add it here. It stays in this
// browser, and can travel with a backup or a family page.

type Adding = { pack: TitlePack; dropped: string[] }

const packFile = () => import('../../core/titles/packFile')

/** Does something to the titles, with Undo in the toast that puts back what was there (TODO.md TE-6) */
function undoable(message: string, run: () => void) {
  const before = useSettings.getState().titles
  run()
  if (useSettings.getState().titles === before) {
    // editPack refused: the last word of a language can't go
    useUi.getState().showToast('A language needs at least one word. To stop using it, choose another language, or remove it.')
    return
  }
  useUi.getState().showToast(message, { label: 'Undo', run: () => useSettings.setState({ titles: before }) })
}

/**
 * One relationship's words in edit mode (TODO.md F9, mockup A): chips with ★ for the usual word and
 * × to remove, a box to add one, Alt+arrows to move one, and ↺ back to the built-in words.
 */
function WordRow({ lang, k, label }: { lang: string; k: TitleKey; label: string }) {
  const titles = useSettings((s) => s.titles)
  const words = titleWords(titles, lang, k)
  const builtIn = BUILT_IN_PACKS[lang]?.words[k] ?? []
  const changed = !!BUILT_IN_PACKS[lang] && words.join('\n') !== builtIn.join('\n')
  const change = (c: WordChange) => useSettings.getState().updateTitlePack(lang, k, c)
  const row = useRef<HTMLDivElement>(null)
  const move = (e: KeyboardEvent, w: string) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const button = (e.target as HTMLElement).closest('button')?.dataset.part
    change({ move: w, by: e.key === 'ArrowLeft' ? -1 : 1 })
    // The chip moved, so focus follows it
    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>(`[data-w="${CSS.escape(w)}"] [data-part="${button}"]`)?.focus())
  }
  return (
    <div className="word-row" role="group" aria-label={label} ref={row}>
      <span className="what">
        {label}
        {!words.length && <small>No word yet: shows the English</small>}
      </span>
      <div className="chips">
        {words.map((w, i) => (
          <span key={w} className={`wchip${i === 0 ? ' usual' : ''}`} data-w={w} onKeyDown={(e) => move(e, w)}>
            <button
              type="button"
              data-part="star"
              aria-label={i === 0 ? `${w} is the usual word` : `Make ${w} the usual word`}
              aria-pressed={i === 0}
              onClick={() => change({ usual: w })}
            >
              {i === 0 ? '★' : '☆'}
            </button>
            <span lang={lang}>{w}</span>
            <button type="button" data-part="x" aria-label={`Remove ${w}`} onClick={() => undoable(`Removed ${w}`, () => change({ remove: w }))}>
              ×
            </button>
          </span>
        ))}
        {words.length < 12 && (
          <input
            className="wadd"
            lang={lang}
            maxLength={40}
            placeholder="+ Add"
            aria-label={`Add a word for ${label}`}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              change({ add: e.currentTarget.value })
              e.currentTarget.value = ''
            }}
          />
        )}
      </div>
      {changed ? (
        <button type="button" className="reset-one" title="Back to the built-in words" aria-label={`Back to the built-in words for ${label}`} onClick={() => change({ reset: true })}>
          ↺
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

export default function TitlesSheet() {
  const titles = useSettings((s) => s.titles)
  const { setTitleLang, pickTitle, resetTitles, addTitlePack, removeTitlePack } = useSettings.getState()
  const { lang } = titles
  const pack = packFor(titles, lang)
  const own = titles.packs?.[lang]
  const picked = Object.keys(titles.picks).some((k) => k.startsWith(`${lang}:`))
  const [adding, setAdding] = useState<Adding | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [making, setMaking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const read = async (file: File) => {
    setError(null)
    setAdding(null)
    if (file.size > 1024 * 1024) return setError("That file is too big to be family titles. Start from one of the templates.")
    try {
      const { readPackFile } = await packFile()
      const r = readPackFile(await file.text(), file.name)
      if (r.ok) setAdding({ pack: r.pack, dropped: r.dropped })
      else setError(r.error)
    } catch (err) {
      console.error(err)
      setError("That file couldn't be read. Start from one of the templates.")
    }
  }
  const save = async (as: 'json' | 'csv', p?: TitlePack) => {
    setError(null)
    try {
      const { packToCsv, packToJson, templatePack } = await packFile()
      const what = p ?? templatePack()
      const base = p ? `jangal-titles-${p.lang}` : 'jangal-titles-template'
      if (as === 'csv') download(`${base}.csv`, packToCsv(what), 'text/csv')
      else download(`${base}.json`, packToJson(what, !p), 'application/json')
    } catch (err) {
      console.error(err)
      setError("That file couldn't be made. Check the connection and try again.")
    }
  }

  const removeOwn = () =>
    undoable(BUILT_IN_PACKS[lang] ? `${own!.name} is back to the built-in words` : `Removed ${own!.name}`, () => removeTitlePack(lang))

  if (making) {
    return (
      <Sheet title="Family titles" label="Family titles">
        <NewLanguage onDone={() => setMaking(false)} />
      </Sheet>
    )
  }

  return (
    <Sheet title="Family titles" label="Family titles">
      <div className="gseg langs" role="radiogroup" aria-label="Words for relatives">
        {titleLangs(titles).map(([l, name]) => (
          <label key={l}>
            <input type="radio" name="title-lang" checked={lang === l} onChange={() => setTitleLang(l)} />
            <span>{name}</span>
          </label>
        ))}
      </div>
      <div className="row titles-tools">
        {pack && (
          <button type="button" className="switch" role="switch" aria-checked={editing} onClick={() => setEditing(!editing)}>
            <span className="knob" />
            Edit words
          </button>
        )}
        <button type="button" className="mini" onClick={() => setMaking(true)}>
          + New language
        </button>
      </div>
      {pack && editing ? (
        <>
          <p className="lede titles-lede">★ is the word your family says. The others are there to choose from.</p>
          <div className="titles-banner">
            <span>
              Your changes to <b>{pack.name}</b> stay in this browser.
            </span>
            <button type="button" className="linkish" onClick={() => void save('json', pack)}>
              Download them
            </button>
            {own && BUILT_IN_PACKS[lang] && (
              <button type="button" className="linkish" onClick={removeOwn}>
                Back to the built-in words
              </button>
            )}
          </div>
          {TITLE_GROUPS.map(([group, keys]) => (
            <section key={group} className="word-group" aria-label={group}>
              <h3>{group}</h3>
              {(Object.entries(keys) as [TitleKey, string][]).map(([k, label]) => (
                <WordRow key={k} lang={lang} k={k} label={label} />
              ))}
            </section>
          ))}
        </>
      ) : !pack ? (
        <p className="lede titles-lede">
          Tiles and cards say how everyone is related to you in English. Choose Gujarati or Hindi to use the words your
          family says, like Kaka, Foi and Masi, or add your own language below.
        </p>
      ) : (
        <>
          <p className="lede titles-lede">
            Pick the word your family uses for each relative. Words that depend on age, like Bapa or Didi, need birth
            years, and anyone without a word here keeps the English one.
          </p>
          <div className="titles-grid">
            {TITLE_GROUPS.map(([group, keys]) => {
              const rows = (Object.entries(keys) as [TitleKey, string][]).filter(([k]) => titleWords(titles, lang, k).length)
              if (!rows.length) return null
              return (
                <section key={group} className="about-card title-group" aria-label={group}>
                  <h3>{group}</h3>
                  {rows.map(([k, label]) => {
                    const words = titleWords(titles, lang, k)
                    const id = `${lang}:${k}`
                    const pick = titles.picks[id]
                    return words.length > 1 ? (
                      <label key={k} className="title-row">
                        <span>{label}</span>
                        <select
                          className="field-in"
                          lang={lang}
                          value={pick && words.includes(pick) ? pick : words[0]}
                          onChange={(e) => pickTitle(id, e.target.value === words[0] ? null : e.target.value)}
                        >
                          {words.map((w) => (
                            <option key={w}>{w}</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div key={k} className="title-row">
                        <span>{label}</span>
                        <b lang={lang}>{words[0]}</b>
                      </div>
                    )
                  })}
                </section>
              )
            })}
          </div>
          {picked && (
            <button type="button" className="mini titles-reset" onClick={resetTitles}>
              Back to the usual words
            </button>
          )}
        </>
      )}

      <section className="about-card titles-own" aria-labelledby="titles-own-h">
        <h3 id="titles-own-h">Your own words</h3>
        <p>
          Does your family speak another language, or say these differently? Download a template, fill in the words in a text
          editor or a spreadsheet, and add it here. It stays in this browser.
        </p>
        <div className="row">
          <span className="lbl">Template</span>
          <button type="button" className="mini" onClick={() => void save('csv')}>
            Spreadsheet (CSV)
          </button>
          <button type="button" className="mini" onClick={() => void save('json')}>
            JSON
          </button>
        </div>
        {pack && (
          <div className="row">
            <span className="lbl">{pack.name} words</span>
            <button type="button" className="mini" onClick={() => void save('csv', pack)}>
              Spreadsheet (CSV)
            </button>
            <button type="button" className="mini" onClick={() => void save('json', pack)}>
              JSON
            </button>
          </div>
        )}
        <div className="row">
          <button type="button" className="chunky" onClick={() => fileRef.current?.click()}>
            <FileArrowUp />
            Add a language
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            aria-label="Choose a family titles file"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (f) void read(f)
            }}
          />
          {own && (
            <button type="button" className="chunky" onClick={removeOwn}>
              {BUILT_IN_PACKS[lang] ? `Back to the built-in ${own.name} words` : `Remove ${own.name}`}
            </button>
          )}
        </div>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {adding && (
          <div className="report" role="status">
            <b>
              {adding.pack.name}
              {adding.pack.nativeName && <span lang={adding.pack.lang}> ({adding.pack.nativeName})</span>}
            </b>
            <span>
              {Object.keys(adding.pack.words).length} of {TITLE_KEYS.length} relationships have words.
              {adding.dropped.length > 0 && ` ${adding.dropped.length} that aren't on the list were left out: ${adding.dropped.slice(0, 5).join(', ')}.`}
              {packFor(titles, adding.pack.lang) && ` It replaces the ${packFor(titles, adding.pack.lang)!.name} words in this browser.`}
            </span>
            <div className="row">
              <button
                type="button"
                className="chunky go"
                onClick={() => {
                  addTitlePack(adding.pack)
                  setAdding(null)
                }}
              >
                Add {adding.pack.name}
              </button>
              <button type="button" className="chunky" onClick={() => setAdding(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </Sheet>
  )
}
