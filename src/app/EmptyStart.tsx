import { BRAND } from '../brand'
import { ThemeButton } from '../features/chrome/Chrome'
import { LeafPortrait } from '../ui/Avatar'
import { Wordmark } from '../ui/Wordmark'
import { FileArrowUp, TreeStructure } from '../ui/icons'
import { useUi } from '../store/uiStore'
import { openSample, startWithYou } from './boot'
import { StartInfo } from './StartInfo'

// The empty tree, and the first thing a visitor sees at "/" (PLAN 6.10, TODO.md F6): one dashed tile
// that says "Start with you", with importing a file and exploring the sample family as the other
// ways in. Below them, a short and quiet word about what Jangal is.

export function EmptyStart() {
  return (
    <main className="empty-start" aria-label="Start a family tree">
      <div className="corner">
        <div className="pillset">
          <ThemeButton />
        </div>
      </div>
      <div className="start-col">
        <h1 className="empty-title">
          <Wordmark />
          <span className="sub">{BRAND.sub}</span>
        </h1>
        <button type="button" className="start-tile" onClick={() => void startWithYou()}>
          <span className="av s-own" style={{ ['--sz' as string]: '72px' }}>
            <span className="pic">
              <LeafPortrait />
            </span>
          </span>
          <b>Start with you</b>
          <span>Add yourself, then your parents and grandparents</span>
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="chunky" onClick={() => useUi.getState().openSheet('import')}>
            <FileArrowUp />
            Import a file
          </button>
          <button type="button" className="chunky" onClick={() => void openSample()}>
            <TreeStructure />
            Explore a sample family
          </button>
        </div>
        <StartInfo />
      </div>
    </main>
  )
}

export function Skeleton() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="Loading your tree">
      <div className="skeleton-row">
        <span className="skeleton-tile" />
        <span className="skeleton-tile" />
      </div>
      <div className="skeleton-row">
        <span className="skeleton-tile" />
        <span className="skeleton-tile" />
        <span className="skeleton-tile" />
      </div>
    </div>
  )
}
