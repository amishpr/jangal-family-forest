import { useStore } from 'zustand'
import { BRAND } from '../../brand'
import { sideClass, useHome, useIndex, useSides } from '../../app/derive'
import { useSettings } from '../../store/settings'
import { redo, undo, useTree } from '../../store/treeStore'
import { useUi, type SheetName, type Tab } from '../../store/uiStore'
import { Avatar } from '../../ui/Avatar'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  Cake,
  ChartBarHorizontal,
  ChartPieSlice,
  CornersOut,
  GithubLogo,
  Info,
  MagnifyingGlass,
  Minus,
  Moon,
  Path,
  Plus,
  ShareFat,
  Sun,
  Translate,
  TreeStructure,
  UserCircleDashed,
} from '../../ui/icons'
import { fitTree, zoomBy } from '../canvas/camera'
import { setTab } from '../../app/nav'

// Tabs at the top (PLAN A-7), the button groups at the top right, and the dock at the bottom.

const TABS: { id: Tab; label: string; Icon: typeof TreeStructure }[] = [
  { id: 'tree', label: 'Tree', Icon: TreeStructure },
  { id: 'timeline', label: 'Timeline', Icon: ChartBarHorizontal },
  { id: 'fan', label: 'Fan chart', Icon: ChartPieSlice },
]

export function Tabs() {
  const tab = useUi((s) => s.tab)
  return (
    <nav className="tabs" role="tablist" aria-label="Views">
      {TABS.map(({ id, label, Icon }, i) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-controls={tab === id ? `view-${id}` : undefined}
          title={`${label} (${i + 1})`}
          onClick={() => setTab(id)}
        >
          <Icon />
          <span className="label">{label}</span>
        </button>
      ))}
    </nav>
  )
}

export function Corner() {
  const tab = useUi((s) => s.tab)
  const canUndo = useStore(useTree.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useTree.temporal, (s) => s.futureStates.length > 0)
  const readOnly = useUi((s) => s.readOnly)
  return (
    <div className="corner">
      {!readOnly && (
      <div className="pillset undoset">
        <button type="button" className="round" aria-label="Undo" title="Undo (⌘Z)" disabled={!canUndo} onClick={() => undo()}>
          <ArrowUUpLeft />
        </button>
        <button type="button" className="round" aria-label="Redo" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={() => redo()}>
          <ArrowUUpRight />
        </button>
      </div>
      )}
      {tab === 'tree' && (
        <div className="pillset zoomset">
          <button type="button" className="round" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
            <Minus />
          </button>
          <button type="button" className="round" aria-label="Fit the tree" title="Fit (F)" onClick={() => fitTree()}>
            <CornersOut />
          </button>
          <button type="button" className="round" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.2)}>
            <Plus />
          </button>
        </div>
      )}
      <div className="pillset">
        <button type="button" className="round" aria-label="About" title="About" onClick={() => useUi.getState().toggleSheet('about')}>
          <Info />
        </button>
        <button
          type="button"
          className="round"
          aria-label="Family titles"
          title="Family titles: English, Gujarati or Hindi"
          onClick={() => useUi.getState().toggleSheet('titles')}
        >
          <Translate />
        </button>
        {BRAND.repoUrl && !readOnly && (
          <a className="round" href={BRAND.repoUrl} target="_blank" rel="noopener noreferrer" aria-label="GitHub repo" title="GitHub repo">
            <GithubLogo />
          </a>
        )}
        <ThemeButton />
      </div>
    </div>
  )
}

/** In the corner, and on its own on the start screen */
export function ThemeButton() {
  const dark = useSettings((s) => s.theme) === 'dark'
  return (
    <button
      type="button"
      className="round"
      aria-label={dark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      title="Light or dark"
      onClick={() => useSettings.getState().setTheme(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  )
}

const DOCK: { id: SheetName; label: string; Icon: typeof TreeStructure; sep?: boolean }[] = [
  { id: 'find', label: 'Find', Icon: MagnifyingGlass },
  { id: 'relate', label: 'Relate', Icon: Path },
  { id: 'bdays', label: 'Birthdays', Icon: Cake },
  { id: 'export', label: 'Share', Icon: ShareFat, sep: true },
]

export function Dock() {
  const sheet = useUi((s) => s.sheet)
  const readOnly = useUi((s) => s.readOnly)
  const home = useHome()
  const ix = useIndex()
  const sides = useSides()
  const me = home && ix ? ix.person(home) : null
  const toggle = (name: SheetName) => useUi.getState().toggleSheet(name)
  return (
    <nav className="dock" aria-label="Tools">
      <button
        type="button"
        className="me"
        aria-pressed={sheet === 'me'}
        aria-label={me ? `You are ${me.firstName}. Change who you are` : 'Who are you? Pick yourself'}
        title={me ? `Viewing as ${me.firstName}` : 'Neutral view. Pick yourself'}
        onClick={() => toggle('me')}
      >
        {me && sides ? (
          <>
            <Avatar person={me} size={30} side={sideClass(sides, me.id)} />
            <span className="label">{me.firstName}</span>
          </>
        ) : (
          <>
            <UserCircleDashed />
            <span className="label">Who are you?</span>
          </>
        )}
      </button>
      <span className="sep" />
      {DOCK.filter((d) => !readOnly || d.id !== 'export').map(({ id, label, Icon, sep }) => (
        <span key={id} style={{ display: 'contents' }}>
          {sep && <span className="sep" />}
          <button type="button" aria-pressed={sheet === id} title={label} onClick={() => toggle(id)}>
            <Icon />
            <span className="label">{label}</span>
          </button>
        </span>
      ))}
    </nav>
  )
}
