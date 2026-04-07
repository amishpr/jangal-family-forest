import { useEffect, useRef, useState } from 'react'
import { cleanPack, newPack, packFor, packNameError, TITLE_GROUPS, TITLE_KEYS, titleLangs, type TitleKey, type TitlePack } from '../../core/titles'
import { useSettings } from '../../store/settings'

// A new language, step by step (TODO.md F9, mockup C): name it, start from a copy of any language
// or from nothing, fill in the words one group at a time, then save. Editing it later happens in
// the sheet's edit mode.

const split = (text: string) => text.split(',').map((w) => w.trim()).filter(Boolean)

export function NewLanguage({ onDone }: { onDone(): void }) {
  const titles = useSettings((s) => s.titles)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [group, setGroup] = useState(0)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [native, setNative] = useState('')
  const [from, setFrom] = useState('hi')
  const [words, setWords] = useState<Partial<Record<TitleKey, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const source = from ? packFor(titles, from) : undefined
  const lang = code.trim().toLowerCase()

  // Each step starts at its heading, so a screen reader hears where it is
  useEffect(() => head.current?.focus(), [step, group])

  const pack = (): TitlePack => {
    const p = newPack(lang, name, native)
    for (const k of TITLE_KEYS) if (split(words[k] ?? '').length) p.words[k] = split(words[k]!)
    return p
  }

  const toWords = () => {
    const bad = packNameError(lang, name)
    if (bad) return setError(bad)
    if (lang === 'en' || packFor(titles, lang)) return setError(`${lang} is already ${titleLangs(titles).find(([l]) => l === lang)?.[1] ?? 'used'}. Use another code, or edit its words instead.`)
    setError(null)
    setWords(Object.fromEntries(TITLE_KEYS.map((k) => [k, (source?.words[k] ?? []).join(', ')])))
    setGroup(0)
    setStep(2)
  }

  const save = () => {
    const r = cleanPack(pack())
    if ('error' in r) return setError(r.error)
    useSettings.getState().addTitlePack(r.pack)
    onDone()
  }

  const steps = (
    <div className="nl-steps" aria-hidden="true">
      {['1 Language', '2 Words', '3 Save'].map((s, i) => (
        <span key={s} className={step === i + 1 ? 'on' : undefined}>
          {s}
        </span>
      ))}
    </div>
  )

  if (step === 1) {
    return (
      <section className="nl" aria-labelledby="nl-h">
        {steps}
        <h3 id="nl-h" ref={head} tabIndex={-1}>
          A new language
        </h3>
        <label>
          Name in English
          <input className="field-in" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Marathi" />
        </label>
        <div className="two">
          <label>
            Code
            <input className="field-in" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="mr" autoCapitalize="off" />
          </label>
          <label>
            In its own writing
            <input className="field-in" value={native} onChange={(e) => setNative(e.target.value)} maxLength={40} placeholder="मराठी" />
          </label>
        </div>
        <fieldset className="nl-from">
          <legend>Start from</legend>
          {titleLangs(titles)
            .filter(([l]) => l !== 'en')
            .map(([l, n]) => (
              <label key={l} className="check">
                <input type="radio" name="nl-from" checked={from === l} onChange={() => setFrom(l)} />
                {n} words ({Object.keys(packFor(titles, l)!.words).length} filled)
              </label>
            ))}
          <label className="check">
            <input type="radio" name="nl-from" checked={!from} onChange={() => setFrom('')} />
            Nothing: start blank
          </label>
        </fieldset>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <div className="row nl-foot">
          <button type="button" className="chunky" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="chunky go" onClick={toWords}>
            Next: the words
          </button>
        </div>
      </section>
    )
  }

  if (step === 2) {
    const [gname, keys] = TITLE_GROUPS[group]
    const last = group === TITLE_GROUPS.length - 1
    return (
      <section className="nl" aria-labelledby="nl-h">
        {steps}
        <h3 id="nl-h" ref={head} tabIndex={-1}>
          {gname} <small>{group + 1} of {TITLE_GROUPS.length} groups</small>
        </h3>
        <p className="help">
          {source ? `From ${source.name}. Change what your family says differently, and leave the rest.` : 'Fill in the words your family says. Leave a box empty to keep the English.'} More than one
          word? Separate them with commas. The first is the usual one.
        </p>
        {(Object.entries(keys) as [TitleKey, string][]).map(([k, label]) => (
          <label key={k} className="nl-row">
            <span>
              {label}
              {source?.words[k] && <small>From {source.name}: {source.words[k]!.join(', ')}</small>}
            </span>
            <input className="field-in" lang={lang} aria-label={label} value={words[k] ?? ''} onChange={(e) => setWords({ ...words, [k]: e.target.value })} maxLength={500} />
          </label>
        ))}
        <div className="row nl-foot">
          <button type="button" className="chunky" onClick={() => (group ? setGroup(group - 1) : setStep(1))}>
            Back
          </button>
          <button type="button" className="chunky go" onClick={() => (last ? setStep(3) : setGroup(group + 1))}>
            {last ? 'Next: save' : 'Next group'}
          </button>
        </div>
      </section>
    )
  }

  const filled = Object.keys(pack().words).length
  return (
    <section className="nl" aria-labelledby="nl-h">
      {steps}
      <h3 id="nl-h" ref={head} tabIndex={-1}>
        {name.trim()}
        {native.trim() && <span lang={lang}> ({native.trim()})</span>}
      </h3>
      <p className="help">
        {filled} of {TITLE_KEYS.length} relationships have words. Anyone without one keeps the English. It stays in this browser,
        and you can change the words any time with Edit words.
      </p>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      <div className="row nl-foot">
        <button type="button" className="chunky" onClick={() => setStep(2)}>
          Back
        </button>
        <button type="button" className="chunky go" onClick={save}>
          Save {name.trim()}
        </button>
      </div>
    </section>
  )
}
