import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { AskLink, AskPerson } from '../core/askLink'
import type { ChildKind, FamilyStatus, Gender, PartialDate } from '../core/model'
import { GENDER_LABELS } from '../core/model'
import { buildReply, replyFileName, replyHtml, type Answers, type Photo, type PersonAnswers } from '../core/reply'
import { download } from '../features/export/download'
import { cropToBlob, PHOTO_TYPES } from '../features/person/image'
import { PartialDateField } from '../features/person/PartialDateField'
import { readPartialDate } from '../features/person/readPartialDate'
import { Camera, DownloadSimple, Envelope, Info, Moon, PaperPlaneTilt, PencilSimple, Plus, Sun, Trash } from '../ui/icons'
import { LeafPortrait } from '../ui/LeafPortrait'
import { Wordmark } from '../ui/Wordmark'

// The fill-in form (SHARE.md SH-4 to SH-10): one page that scrolls, the relative first, then each
// partner with their children. Fields are the person card's, read back with FormData the same way.
// A draft is kept in this browser as they type, photos included, so switching apps to find a photo
// loses nothing. "Send" makes the reply file and hands it to the share sheet, or downloads it.

const PhotoCropper = lazy(() => import('../features/person/PhotoCropper'))

type Row = { key: string; id?: string; first?: string; last?: string; isNew?: boolean }
type Fam = { key: string; partner?: Row; children: Row[]; isNew?: boolean }
type Draft = {
  fams: Fam[]
  /** Every field by its name, as typed */
  values: Record<string, string>
  /** Photos as data URLs, by row */
  photos: Record<string, string>
  /** Rows ticked "Has passed away", and each partnership's status: these change what's shown */
  dead: string[]
  statuses: Record<string, FamilyStatus>
  seq: number
}

const GENDERS = Object.entries(GENDER_LABELS) as [Gender, string][]
const STATUSES: [FamilyStatus, string][] = [
  ['married', 'Married'],
  ['partners', 'Partners'],
  ['engaged', 'Engaged'],
  ['divorced', 'Divorced'],
  ['separated', 'Separated'],
  ['widowed', 'Widowed'],
]
const STARTED: Record<FamilyStatus, string> = {
  married: 'Married on',
  partners: 'Together since',
  engaged: 'Engaged on',
  divorced: 'Married on',
  separated: 'Together since',
  widowed: 'Married on',
}
const KINDS: [ChildKind, string][] = [
  ['biological', 'Birth'],
  ['adopted', 'Adopted'],
  ['step', 'Step'],
]

const draftKey = (link: AskLink) => `jangal:ask:${link.tree.id}:${link.person.id}`

/**
 * Where a downloaded file lands, said the way the phone says it. An email link can't attach a file
 * (no web page can), so the steps say exactly where to find it.
 */
function downloadsPlace(): { where: string; attach: string } {
  const ua = navigator.userAgent
  // iPadOS asks for the desktop site, so it looks like a Mac with a touch screen
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return { where: 'In the Files app, under Downloads', attach: 'tap the paperclip or +, choose Files, then Downloads, and pick it' }
  }
  if (/Android/.test(ua)) return { where: 'In Downloads, in the Files app', attach: 'tap the paperclip, and pick it from Downloads' }
  return { where: 'In your Downloads folder', attach: 'attach it from your Downloads folder' }
}

/** The form as the link describes it: the families the tree has, nothing typed yet */
function fresh(link: AskLink): Draft {
  let seq = 0
  const row = (p: AskPerson): Row => ({ key: `k${++seq}`, id: p.id, first: p.first, last: p.last })
  const fams = link.families.map((f): Fam => ({ key: `f${++seq}`, ...(f.partner ? { partner: row(f.partner) } : {}), children: f.children.map(row) }))
  const statuses: Record<string, FamilyStatus> = {}
  link.families.forEach((f, i) => f.status && (statuses[fams[i].key] = f.status))
  return { fams, values: {}, photos: {}, dead: [], statuses, seq }
}

function readDraft(link: AskLink): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(link)) ?? 'null')
    return d && Array.isArray(d.fams) && d.values && typeof d.seq === 'number' ? { photos: {}, dead: [], statuses: {}, ...d } : null
  } catch {
    return null
  }
}

/** true when saved, 'text' when only the typing fit, false when nothing could be saved */
function writeDraft(link: AskLink, d: Draft): true | 'text' | false {
  try {
    localStorage.setItem(draftKey(link), JSON.stringify(d))
    return true
  } catch {
    try {
      localStorage.setItem(draftKey(link), JSON.stringify({ ...d, photos: {} }))
      return 'text'
    } catch {
      return false
    }
  }
}

function clearDraft(link: AskLink) {
  try {
    localStorage.removeItem(draftKey(link))
  } catch {
    // Nothing was saved
  }
}

function formValues(form: HTMLFormElement) {
  const out: Record<string, string> = {}
  for (const [k, v] of new FormData(form)) if (typeof v === 'string' && v !== '') out[k] = v
  return out
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

function photoOf(url: string | undefined): Photo | undefined {
  const m = url && /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(url)
  return m ? { mime: m[1] as Photo['mime'], data: m[2] } : undefined
}

/** The theme button, the same as the app's: light or dark, remembered for the app too */
function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark')
  return (
    <button
      type="button"
      className="round"
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title="Light or dark"
      onClick={() => {
        const t = dark ? 'light' : 'dark'
        document.documentElement.dataset.theme = t
        try {
          localStorage.setItem('jangal:theme', t)
        } catch {
          // Just for this visit, then
        }
        setDark(!dark)
      }}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="add">
      <header className="add-head">
        <Wordmark />
        <ThemeButton />
      </header>
      {children}
    </main>
  )
}

/** A link that was cut off or changed: nothing to fill in */
export function BadLink() {
  return (
    <Frame>
      <section className="add-sec add-note">
        <h1>This link didn't come through whole</h1>
        <p>Part of it may have been cut off when it was copied. Ask whoever sent it for a new one, and tap the whole link.</p>
      </section>
    </Frame>
  )
}

/** A photo to tap: the picture, or the leaf, with the camera badge */
function Face({ url, size, label, onPick }: { url?: string; size: number; label: string; onPick: (file: File) => void }) {
  return (
    <label className="add-face" title={label}>
      <input
        type="file"
        accept={PHOTO_TYPES}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file) onPick(file)
        }}
      />
      <span className="av s-own" style={{ ['--sz' as string]: `${size}px` }}>
        <span className="pic">{url ? <img src={url} alt="" /> : <LeafPortrait />}</span>
        <span className="cam">
          <Camera />
        </span>
      </span>
    </label>
  )
}

export function AddPage({ link }: { link: AskLink }) {
  const [draft, setDraft] = useState<Draft>(() => readDraft(link) ?? fresh(link))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [crop, setCrop] = useState<{ key: string; file: File; who: string } | null>(null)
  const [done, setDone] = useState<{ how: 'shared' | 'saved'; file: File } | null>(null)
  const [saved, setSaved] = useState<true | 'text' | false>(true)
  const [confirmClear, setConfirmClear] = useState(false)
  const [busy, setBusy] = useState(false)
  // Start over gives a new form, so nothing typed stays in the fields
  const [formKey, setFormKey] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const draftRef = useRef(draft)
  const timer = useRef<number | undefined>(undefined)
  const asker = link.from.name
  const me = link.person.first

  // The draft: what's typed, read from the form, plus the rows and photos
  const persistNow = useCallback(() => {
    clearTimeout(timer.current)
    const form = formRef.current
    const d = form ? { ...draftRef.current, values: formValues(form) } : draftRef.current
    setSaved(writeDraft(link, d))
  }, [link])
  const persistSoon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(persistNow, 300)
  }, [persistNow])
  useEffect(() => {
    draftRef.current = draft
    persistSoon()
  }, [draft, persistSoon])
  useEffect(() => {
    // Phones can drop a tab in the background, so the draft is saved when the page is hidden
    const hide = () => document.visibilityState === 'hidden' && persistNow()
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', persistNow)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', persistNow)
    }
  }, [persistNow])

  /** Changes the rows, keeping what's typed */
  const change = (fn: (d: Draft) => Partial<Draft>) =>
    setDraft((d) => {
      const values = formRef.current ? formValues(formRef.current) : d.values
      return { ...d, values, ...fn({ ...d, values }) }
    })
  const nextKey = (d: Draft, p: string) => `${p}${d.seq + 1}`
  const addChild = (fkey: string) =>
    change((d) => ({ seq: d.seq + 1, fams: d.fams.map((f) => (f.key === fkey ? { ...f, children: [...f.children, { key: nextKey(d, 'k'), isNew: true }] } : f)) }))
  const addPartner = () => change((d) => ({ seq: d.seq + 2, fams: [...d.fams, { key: nextKey(d, 'f'), partner: { key: `k${d.seq + 2}`, isNew: true }, children: [], isNew: true }] }))
  const addSoloChild = () => change((d) => ({ seq: d.seq + 2, fams: [...d.fams, { key: nextKey(d, 'f'), children: [{ key: `k${d.seq + 2}`, isNew: true }], isNew: true }] }))
  const removeRow = (fkey: string, key: string) =>
    change((d) => ({ fams: d.fams.map((f) => (f.key === fkey ? { ...f, children: f.children.filter((c) => c.key !== key) } : f)).filter((f) => !f.isNew || f.partner || f.children.length) }))
  const removeFam = (fkey: string) => change((d) => ({ fams: d.fams.filter((f) => f.key !== fkey) }))
  const toggleDead = (key: string, on: boolean) => change((d) => ({ dead: on ? [...d.dead, key] : d.dead.filter((k) => k !== key) }))
  const setStatus = (fkey: string, s: FamilyStatus) => change((d) => ({ statuses: { ...d.statuses, [fkey]: s } }))

  const v = (name: string, fallback = '') => draft.values[name] ?? fallback
  const dateOf = (name: string): PartialDate | undefined => {
    const n = (k: string) => (/^\d+$/.test(v(`${name}.${k}`)) ? Number(v(`${name}.${k}`)) : undefined)
    const d = { year: n('year'), month: n('month'), day: n('day'), approx: v(`${name}.approx`) === 'on' }
    return d.year || d.month || d.day ? d : undefined
  }
  const err = (k: string) =>
    errors[k] ? (
      <span className="field-err" role="alert">
        {errors[k]}
      </span>
    ) : null

  const send = async (file: File) => {
    setBusy(true)
    try {
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `For ${asker}` })
          setDone({ how: 'shared', file })
          return
        } catch (e) {
          // Closing the share sheet isn't a failure: the form stays as it was
          if ((e as Error)?.name === 'AbortError') return
        }
      }
      download(file.name, file, 'text/html')
      setDone({ how: 'saved', file })
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const t = (k: string) => String(f.get(k) ?? '').trim()
    const errs: Record<string, string> = {}
    const person = (row: Row): PersonAnswers => {
      const k = row.key
      if (!t(`${k}.first`)) errs[`${k}.first`] = 'Add a first name'
      const birth = readPartialDate(f, `${k}.birth`)
      if (birth.error) errs[`${k}.birth`] = birth.error
      const dead = f.get(`${k}.dead`) === 'on'
      const dy = t(`${k}.deathYear`)
      let deathYear: number | undefined
      if (dead && dy) {
        if (/^\d{1,4}$/.test(dy) && Number(dy) >= 1) deathYear = Number(dy)
        else errs[`${k}.deathYear`] = 'Write the year as a number, like 2019'
      }
      const gender = (f.get(`${k}.gender`) as Gender | null) ?? undefined
      return {
        id: row.id,
        first: t(`${k}.first`),
        middle: t(`${k}.middle`) || undefined,
        last: t(`${k}.last`) || undefined,
        birthSurname: t(`${k}.birthSurname`) || undefined,
        nickname: t(`${k}.nickname`) || undefined,
        gender,
        birth: birth.date,
        birthPlace: t(`${k}.birthPlace`) || undefined,
        livesIn: t(`${k}.livesIn`) || undefined,
        deceased: dead || undefined,
        deathYear,
        notes: String(f.get(`${k}.notes`) ?? '').trim() || undefined,
        photo: photoOf(draft.photos[k]),
      }
    }
    const answers: Answers = {
      me: person({ key: 'me', id: link.person.id }),
      families: draft.fams.map((fam) => {
        const start = readPartialDate(f, `${fam.key}.start`)
        if (start.error) errs[`${fam.key}.start`] = start.error
        return {
          partner: fam.partner ? person(fam.partner) : undefined,
          status: fam.partner ? draft.statuses[fam.key] : undefined,
          start: fam.partner ? start.date : undefined,
          children: fam.children.map((c) => ({ ...person(c), kind: (f.get(`${c.key}.kind`) as ChildKind | null) ?? 'biological' })),
        }
      }),
    }
    setErrors(errs)
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    // Keep what's typed for "Change something", then send
    const values = formValues(form)
    setDraft((d) => ({ ...d, values }))
    const tree = buildReply(link, answers)
    const html = replyHtml(tree)
    void send(new File([html], replyFileName(tree), { type: 'text/html' }))
  }

  const startOver = () => {
    clearDraft(link)
    setDraft(fresh(link))
    setErrors({})
    setConfirmClear(false)
    setFormKey((n) => n + 1)
    window.scrollTo({ top: 0 })
  }

  if (done) {
    const mail = link.from.email
      ? `mailto:${encodeURIComponent(link.from.email)}?subject=${encodeURIComponent('My details for the family tree')}&body=${encodeURIComponent(`Hi ${asker}, my details for ${link.tree.title || 'the family tree'} are in the attached file, ${done.file.name}.`)}`
      : null
    const place = downloadsPlace()
    return (
      <Frame>
        {done.how === 'shared' ? (
          <section className="add-sec add-note" aria-live="polite">
            <h1>Thank you, {me}!</h1>
            <p>If it went to {asker}, you're done. Your answers are still here if you want to send them again.</p>
            <button type="button" className="chunky go wide" disabled={busy} onClick={() => void send(done.file)}>
              <PaperPlaneTilt />
              Send again
            </button>
            <button type="button" className="chunky wide" onClick={() => setDone(null)}>
              <PencilSimple />
              Change something
            </button>
          </section>
        ) : (
          <section className="add-sec add-note" aria-live="polite">
            <h1>Your answers are saved as a file</h1>
            <div className="add-file">
              <span className="doc">HTML</span>
              <span>
                {done.file.name}
                <small>{place.where}</small>
              </span>
            </div>
            <ol>
              <li>Write to {asker}, by email, WhatsApp or Messages.</li>
              <li>To add the file, {place.attach}.</li>
            </ol>
            {mail && (
              <>
                <a className="chunky go wide" href={mail}>
                  <Envelope />
                  Write to {asker}
                </a>
                <p className="help">This starts the email, but can't attach the file for you. Attach it before you send.</p>
              </>
            )}
            <button type="button" className={`chunky wide ${mail ? '' : 'go'}`} onClick={() => download(done.file.name, done.file, 'text/html')}>
              <DownloadSimple />
              Download again
            </button>
            <button type="button" className="chunky wide" onClick={() => setDone(null)}>
              <PencilSimple />
              Change something
            </button>
            <p className="help">
              Opened this inside WhatsApp, Instagram or an email app, and nothing downloaded? Open the link in Safari or Chrome instead.
            </p>
          </section>
        )}
      </Frame>
    )
  }

  const errorCount = Object.keys(errors).length
  const solo = draft.fams.find((f) => !f.partner)

  const childRow = (fam: Fam, c: Row) => {
    const k = c.key
    const dead = draft.dead.includes(k)
    const name = v(`${k}.first`, c.first ?? '') || 'A child'
    return (
      <div className="add-kid" key={k}>
        <div className="add-kid-h">
          <Face url={draft.photos[k]} size={44} label={`Add a photo of ${c.first || 'this child'}`} onPick={(file) => setCrop({ key: k, file, who: c.first || 'them' })} />
          <b>{name}</b>
          {c.isNew && (
            <button type="button" className="round" aria-label={`Remove ${c.first || 'this child'}`} onClick={() => removeRow(fam.key, k)}>
              <Trash />
            </button>
          )}
        </div>
        <div className="two">
          <label>
            First name
            <input className="field-in" name={`${k}.first`} defaultValue={v(`${k}.first`, c.first)} maxLength={120} aria-invalid={!!errors[`${k}.first`]} autoComplete="off" />
            {err(`${k}.first`)}
          </label>
          <label>
            Last name
            <input className="field-in" name={`${k}.last`} defaultValue={v(`${k}.last`, c.last)} maxLength={120} autoComplete="off" />
          </label>
        </div>
        <PartialDateField name={`${k}.birth`} label="Birthday" value={dateOf(`${k}.birth`)} error={errors[`${k}.birth`]} />
        <Segments name={`${k}.gender`} label="Gender" options={GENDERS} value={v(`${k}.gender`)} />
        <Segments name={`${k}.kind`} label="Their child by" options={KINDS} value={v(`${k}.kind`, 'biological')} three />
        <Passed k={k} dead={dead} year={v(`${k}.deathYear`)} onToggle={(on) => toggleDead(k, on)} error={err(`${k}.deathYear`)} />
      </div>
    )
  }

  const partnerSection = (fam: Fam, p: Row) => {
    const k = p.key
    const status = draft.statuses[fam.key]
    const extras = ['gender', 'birth.year', 'birth.month', 'birth.day', 'birthPlace', 'livesIn', 'dead'].some((x) => v(`${k}.${x}`))
    const pname = v(`${k}.first`, p.first ?? '')
    return (
      <section className="add-sec" key={fam.key} aria-label={pname ? `You and ${pname}` : 'Your partner'}>
        <div className="add-sec-h">
          <Face url={draft.photos[k]} size={64} label={`Add a photo of ${p.first || 'your partner'}`} onPick={(file) => setCrop({ key: k, file, who: p.first || 'them' })} />
          <div>
            <h2>{pname ? `You and ${pname}` : 'Your partner'}</h2>
            <small>{p.isNew ? 'Someone new to the tree' : 'From the tree'}</small>
          </div>
          {fam.isNew && (
            <button type="button" className="round" aria-label="Remove this partner" onClick={() => removeFam(fam.key)}>
              <Trash />
            </button>
          )}
        </div>
        <div className="fields">
          <div className="two">
            <label>
              First name
              <input className="field-in" name={`${k}.first`} defaultValue={v(`${k}.first`, p.first)} maxLength={120} aria-invalid={!!errors[`${k}.first`]} autoComplete="off" />
              {err(`${k}.first`)}
            </label>
            <label>
              Last name
              <input className="field-in" name={`${k}.last`} defaultValue={v(`${k}.last`, p.last)} maxLength={120} autoComplete="off" />
            </label>
          </div>
          <div className="fl">
            Together as
            <div className="gseg trio" role="radiogroup" aria-label="Together as">
              {STATUSES.map(([s, label]) => (
                <label key={s}>
                  <input type="radio" name={`${fam.key}.status`} value={s} checked={status === s} onChange={() => setStatus(fam.key, s)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <PartialDateField name={`${fam.key}.start`} label={status ? STARTED[status] : 'Together since'} value={dateOf(`${fam.key}.start`)} error={errors[`${fam.key}.start`]} />
          <details className="add-more" open={extras || undefined}>
            <summary>
              <Plus />
              More about {p.first || 'them'}
            </summary>
            <div className="fields">
              <Segments name={`${k}.gender`} label="Gender" options={GENDERS} value={v(`${k}.gender`)} />
              <PartialDateField name={`${k}.birth`} label="Birthday" value={dateOf(`${k}.birth`)} error={errors[`${k}.birth`]} />
              <div className="two">
                <label>
                  Born in
                  <input className="field-in" name={`${k}.birthPlace`} defaultValue={v(`${k}.birthPlace`)} maxLength={200} placeholder="Town, country" autoComplete="off" />
                </label>
                {!draft.dead.includes(k) && (
                  <label>
                    Lives in
                    <input className="field-in" name={`${k}.livesIn`} defaultValue={v(`${k}.livesIn`)} maxLength={200} placeholder="Town, country" autoComplete="off" />
                  </label>
                )}
              </div>
              <Passed k={k} dead={draft.dead.includes(k)} year={v(`${k}.deathYear`)} onToggle={(on) => toggleDead(k, on)} error={err(`${k}.deathYear`)} />
            </div>
          </details>
        </div>
        <h3 className="add-sub">Your children with {pname || 'them'}</h3>
        {fam.children.map((c) => childRow(fam, c))}
        <button type="button" className="mini add-btn" onClick={() => addChild(fam.key)}>
          <Plus />
          Add a child
        </button>
      </section>
    )
  }

  return (
    <Frame>
      <div className="add-hello">
        <h1>Hi {me}!</h1>
        <p>
          {asker} is putting together a family tree{link.tree.title ? <>: <b>{link.tree.title}</b></> : null}. Check your details, add a photo,
          and add your family. It takes about five minutes.
        </p>
        <p className="add-private">
          <Info />
          <span>Nothing is uploaded. Your answers stay on this device until you send them to {asker}.</span>
        </p>
      </div>
      <form
        key={formKey}
        ref={formRef}
        className="add-form"
        onSubmit={onSubmit}
        onInput={persistSoon}
        onChange={persistSoon}
        // Leaving a field brings what's typed into the headings, like a new child's name
        onBlur={() => change(() => ({}))}
        noValidate
      >
        <section className="add-sec" aria-label="You">
          <div className="add-sec-h">
            <Face url={draft.photos.me} size={64} label="Add your photo" onPick={(file) => setCrop({ key: 'me', file, who: 'you' })} />
            <div>
              <h2>You</h2>
              <small>Tap the photo to add yours</small>
            </div>
          </div>
          <div className="fields">
            <div className="two">
              <label>
                First name
                <input className="field-in" name="me.first" defaultValue={v('me.first', link.person.first)} maxLength={120} aria-invalid={!!errors['me.first']} autoComplete="given-name" />
                {err('me.first')}
              </label>
              <label>
                Last name
                <input className="field-in" name="me.last" defaultValue={v('me.last', link.person.last)} maxLength={120} autoComplete="family-name" />
              </label>
            </div>
            <div className="two">
              <label>
                Middle name
                <input className="field-in" name="me.middle" defaultValue={v('me.middle')} maxLength={120} autoComplete="additional-name" />
              </label>
              <label>
                Goes by
                <input className="field-in" name="me.nickname" defaultValue={v('me.nickname')} maxLength={120} placeholder="A nickname" autoComplete="off" />
              </label>
            </div>
            <label>
              Birth surname
              <input className="field-in" name="me.birthSurname" defaultValue={v('me.birthSurname')} maxLength={120} placeholder="If it changed" autoComplete="off" />
            </label>
            <Segments name="me.gender" label="Gender" options={GENDERS} value={v('me.gender')} />
            <PartialDateField name="me.birth" label="Birthday" value={dateOf('me.birth')} error={errors['me.birth']} />
            <label>
              Born in
              <input className="field-in" name="me.birthPlace" defaultValue={v('me.birthPlace')} maxLength={200} placeholder="Town, country" autoComplete="off" />
            </label>
            <label>
              Lives in
              <input className="field-in" name="me.livesIn" defaultValue={v('me.livesIn')} maxLength={200} placeholder="Town, country" autoComplete="off" />
            </label>
            <label>
              Anything else the family should know
              <textarea className="field-in" name="me.notes" defaultValue={v('me.notes')} maxLength={20000} placeholder="Where you studied, what you love, a story" />
            </label>
          </div>
        </section>

        {draft.fams.map((fam) =>
          fam.partner ? (
            partnerSection(fam, fam.partner)
          ) : (
            <section className="add-sec" key={fam.key} aria-label="Your children">
              <h2 className="add-sub">Your children</h2>
              {fam.children.map((c) => childRow(fam, c))}
              <button type="button" className="mini add-btn" onClick={() => addChild(fam.key)}>
                <Plus />
                Add a child
              </button>
            </section>
          ),
        )}

        <div className="add-more-btns">
          <button type="button" className="mini" onClick={addPartner}>
            <Plus />
            Add {draft.fams.some((f) => f.partner) ? 'another partner' : 'a partner'}
          </button>
          {!solo && !draft.fams.some((f) => f.partner) && (
            <button type="button" className="mini" onClick={addSoloChild}>
              <Plus />
              Add a child
            </button>
          )}
        </div>

        <div className="add-send">
          {errorCount > 0 && (
            <p className="field-err" role="alert">
              Check the {errorCount === 1 ? 'field' : `${errorCount} fields`} marked in red.
            </p>
          )}
          <button type="submit" className="chunky go wide" disabled={busy}>
            <PaperPlaneTilt />
            Send to {asker}
          </button>
          <small>
            {saved === true ? 'Saved on this device as you type' : saved === 'text' ? 'Your typing is saved, but the photos are too big to keep' : "This browser can't keep a draft, so send before you close it"}
            {' · '}
            {confirmClear ? (
              <>
                Clear everything?{' '}
                <button type="button" className="linkish" onClick={startOver}>
                  Yes, start over
                </button>{' '}
                <button type="button" className="linkish" onClick={() => setConfirmClear(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" className="linkish" onClick={() => setConfirmClear(true)}>
                Start over
              </button>
            )}
          </small>
        </div>
      </form>

      {crop && (
        <div
          className="add-crop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-title"
          onKeyDown={(e) => e.key === 'Escape' && setCrop(null)}
        >
          <div className="add-crop-card">
            <div className="pop-head">
              <div className="top">
                <div>
                  <h2 id="crop-title">{crop.key === 'me' ? 'Your photo' : `Photo of ${crop.who}`}</h2>
                  <div className="gline">Drag to move it, and zoom to fit the face in the circle</div>
                </div>
              </div>
            </div>
            <Suspense fallback={<div className="pop-body">Opening the photo</div>}>
              <PhotoCropper
                file={crop.file}
                onCrop={async (img, area) => {
                  const url = await blobToDataUrl(await cropToBlob(img, area, 512))
                  setDraft((d) => ({ ...d, photos: { ...d.photos, [crop.key]: url } }))
                }}
                onDone={() => setCrop(null)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </Frame>
  )
}

/** A row of choices, like the person card's gender switch */
function Segments({ name, label, options, value, three }: { name: string; label: string; options: [string, string][]; value: string; three?: boolean }) {
  return (
    <div className="fl">
      {label}
      <div className={`gseg ${three ? 'trio' : ''}`} role="radiogroup" aria-label={label}>
        {options.map(([k, text]) => (
          <label key={k}>
            <input type="radio" name={name} value={k} defaultChecked={value === k} />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/** "Has passed away", with the year when it's ticked */
function Passed({ k, dead, year, onToggle, error }: { k: string; dead: boolean; year: string; onToggle: (on: boolean) => void; error: ReactNode }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" name={`${k}.dead`} checked={dead} onChange={(e) => onToggle(e.target.checked)} />
        Has passed away
      </label>
      {dead && (
        <label>
          The year they passed (optional)
          <input className="field-in num" name={`${k}.deathYear`} defaultValue={year} inputMode="numeric" maxLength={4} placeholder="Like 2019" />
          {error}
        </label>
      )}
    </>
  )
}
