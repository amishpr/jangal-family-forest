import { useEffect, useLayoutEffect, useRef } from 'react'
import { toast } from '../../app/actions'
import { startNewTree } from '../../app/boot'
import { useIndex, useSides, useTitle } from '../../app/derive'
import { isSampleTree } from '../../core/model'
import { suggestedTitle, treeStats } from '../../core/title'
import { undo, useTree } from '../../store/treeStore'
import { useSettings } from '../../store/settings'
import { useUi } from '../../store/uiStore'
import { BRAND } from '../../brand'
import { Check, PencilSimple, Plus } from '../../ui/icons'
import { Wordmark } from '../../ui/Wordmark'

// The pill at the top left (PLAN 6.12): the Jangal wordmark small on top (it opens About), then
// the tree's own title, which you click to rename, its subtitle, the stats line, and the legend.

export function BrandPill() {
  const editing = useUi((s) => s.editingTitle)
  const readOnly = useUi((s) => s.readOnly)
  const ref = useRef<HTMLDivElement>(null)
  const sample = useTree((s) => (s.doc ? isSampleTree(s.doc) : false))
  useTopSafe(ref)
  return (
    <div className={`brand ${editing ? 'editing' : ''} ${readOnly ? 'viewer' : ''} ${sample ? 'sample' : ''}`} ref={ref}>
      {/* The family page leads with the family's own title. Jangal is a small credit instead. */}
      {!readOnly && (
      <div className="row1">
        <button
          type="button"
          className="wmbtn"
          aria-label={`About ${BRAND.full}`}
          onClick={() => useUi.getState().toggleSheet('about')}
        >
          <Wordmark />
          <span className="sub">- {BRAND.sub}</span>
        </button>
        <SaveState />
        <NewTreeButton />
      </div>
      )}
      {editing ? <TitleForm /> : <TitleBlock />}
      <Legend />
    </div>
  )
}

function TitleBlock() {
  const { title, subtitle, stats, showStats } = useTitle()
  const readOnly = useUi((s) => s.readOnly)
  useEffect(() => {
    if (title) document.title = `${title} · ${BRAND.word}`
  }, [title])
  return (
    <div className="titleblock">
      {readOnly ? (
        <h1 className="ttl" style={{ margin: 0 }}>
          <span className="ttl-text">{title}</span>
        </h1>
      ) : (
        <button
          type="button"
          className="ttl"
          title={`${title}. Rename the tree`}
          aria-label={`${title}. Rename the tree`}
          onClick={() => useUi.getState().setEditingTitle(true)}
        >
          <span className="ttl-text">{title}</span>
          <PencilSimple />
        </button>
      )}
      {subtitle && (
        <div className="ttl-sub" title={subtitle}>
          {subtitle}
        </div>
      )}
      {showStats && stats && <div className="ttl-stats">{stats}</div>}
    </div>
  )
}

/** Renaming in place. Enter saves, Esc cancels. Saving is one undo step. */
function TitleForm() {
  const ix = useIndex()
  const doc = useTree((s) => s.doc)
  const titleRef = useRef<HTMLInputElement>(null)
  const { title } = useTitle()
  useEffect(() => {
    titleRef.current?.focus()
    titleRef.current?.select()
  }, [])
  if (!doc || !ix) return null
  const suggestion = suggestedTitle(ix)
  const auto = doc.titleAuto
  const close = () => useUi.getState().setEditingTitle(false)
  return (
    <form
      className="ttl-form"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const typed = String(f.get('title') ?? '').trim()
        const subtitle = String(f.get('subtitle') ?? '').trim()
        const showStats = f.get('stats') === 'on'
        // An empty title, or the suggestion itself, goes back to automatic
        const titleAuto = !typed || typed === suggestion
        const renamed = titleAuto ? !auto : typed !== doc.title || auto
        const changed = renamed || subtitle !== (doc.subtitle ?? '') || showStats !== doc.showStats
        close()
        if (!changed) return
        useTree.getState().setTreeInfo({ title: titleAuto ? suggestion : typed, titleAuto, subtitle, showStats })
        const now = titleAuto ? suggestion : typed
        toast(renamed ? `Renamed to ${now}` : 'Title saved', { label: 'Undo', run: () => undo() })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
        }
      }}
    >
      <input
        ref={titleRef}
        className="ttl-in"
        name="title"
        defaultValue={title}
        placeholder={suggestion}
        maxLength={60}
        aria-label="Tree title"
        autoComplete="off"
      />
      <input
        className="sub-in"
        name="subtitle"
        defaultValue={doc.subtitle ?? ''}
        placeholder="Add a subtitle or motto (optional)"
        maxLength={80}
        aria-label="Subtitle or motto"
        autoComplete="off"
      />
      <label className="check">
        <input type="checkbox" name="stats" defaultChecked={doc.showStats} />
        Show "{treeStats(ix)}"
      </label>
      <div className="ttl-foot">
        {auto ? (
          <span className="auto">Suggested from the family names. It updates as the tree grows until you change it.</span>
        ) : (
          <button
            type="button"
            className="mini"
            onClick={() => {
              if (titleRef.current) {
                titleRef.current.value = suggestion
                titleRef.current.focus()
              }
            }}
          >
            Use "{suggestion}"
          </button>
        )}
        <span className="acts">
          <button className="chunky go" type="submit">
            <Check />
            Save
          </button>
          <button type="button" className="chunky" onClick={close}>
            Cancel
          </button>
        </span>
      </div>
    </form>
  )
}

function Legend() {
  const sides = useSides()
  const on = useSettings((s) => s.branchColors)
  if (!sides) return null
  const n = sides.names
  return (
    <div className="legend">
      <span className="lg s-pat">
        <i />
        {n.paternal}
      </span>
      <span className="lg s-mat">
        <i />
        {n.maternal}
      </span>
      <span className="lg s-own">
        <i />
        {n.own}
      </span>
      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={on}
        title="Branch colors"
        onClick={() => useSettings.getState().setBranchColors(!on)}
      >
        <span className="knob" />
        Colors
      </button>
    </div>
  )
}

/** Leaves the sample family for a tree of your own, or starts another tree (the old one stays saved) */
function NewTreeButton() {
  const sample = useTree((s) => (s.doc ? isSampleTree(s.doc) : false))
  return (
    <button
      type="button"
      className={`newtree ${sample ? 'own' : ''}`}
      title={sample ? 'Leave the sample family and start your own tree' : 'Start a new tree. This one stays saved.'}
      onClick={() => void startNewTree()}
    >
      <Plus />
      {sample ? 'Start your own tree' : 'New tree'}
    </button>
  )
}

function SaveState() {
  const save = useUi((s) => s.save)
  const sample = useTree((s) => (s.doc ? isSampleTree(s.doc) : false))
  if (sample) return <span className="sample-tag">Sample family</span>
  if (save === 'saving') return <span className="saved">Saving</span>
  if (save === 'saved')
    return (
      <span className="saved">
        <Check /> Saved
      </span>
    )
  return null
}

/**
 * The Timeline and Fan chart cards start below the pill, whatever its height. On phones the tabs
 * sit under the pill, so they move with it too (PLAN 6.12).
 */
function useTopSafe(ref: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const root = document.documentElement.style
      const b = el.getBoundingClientRect()
      const narrow = window.innerWidth < 760
      if (narrow && !useUi.getState().editingTitle) root.setProperty('--tabs-top', `${Math.round(b.bottom + 8)}px`)
      else if (!narrow) root.removeProperty('--tabs-top')
      const tabs = document.querySelector('.tabs')?.getBoundingClientRect()
      const bottom = narrow ? (tabs?.bottom ?? b.bottom) : Math.max(b.bottom, tabs?.bottom ?? 0)
      root.setProperty('--top-safe', `${Math.round(bottom + 12)}px`)
    }
    // The observer reports the pill's size right after the browser lays out the page, including
    // the first time. Measuring here as well would force a second layout of the whole tree.
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref])
}

/** "Made with Jangal (જંગલ)", in the corner of the family page. It opens About. */
export function MadeCredit() {
  return (
    <button type="button" className="made-credit" onClick={() => useUi.getState().toggleSheet('about')}>
      Made with <Wordmark />
    </button>
  )
}
