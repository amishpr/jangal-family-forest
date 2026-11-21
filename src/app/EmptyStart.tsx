import { useEffect, useRef } from 'react'
import { BRAND } from '../brand'
import { ThemeButton } from '../features/chrome/Chrome'
import { LeafPortrait } from '../ui/Avatar'
import { Wordmark } from '../ui/Wordmark'
import { FileArrowUp, Plus, TreeStructure } from '../ui/icons'
import { isPet } from '../core/model'
import { useTree } from '../store/treeStore'
import { useUi } from '../store/uiStore'
import { openSample, startNewTree, startWithYou } from './boot'
import { useIndex, useTitle } from './derive'
import { StartInfo } from './StartInfo'

// The empty tree, and the first thing a visitor sees at "/" (PLAN 6.10, TODO.md F6): one dashed tile
// that says "Start with you", with importing a file and exploring the sample family as the other
// ways in. Below them, a short and quiet word about what Jangal is. With a tree in the browser, "/"
// opens the tree instead, and About's "See the start page" shows this page with the way back to it
// first. Starting a new tree keeps the open one saved, as New tree in the title pill does.

export function EmptyStart() {
  const ix = useIndex()
  const hasTree = useTree((s) => s.status === 'ready') && !!ix
  const { title } = useTitle()
  // Opened from About, the sheet that had focus is gone, so focus goes to the way back
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus(), [])
  const ui = useUi.getState()
  const people = ix ? ix.ids.filter((id) => !isPet(ix.person(id))).length : 0
  const portrait = (
    <span className="av s-own" style={{ ['--sz' as string]: '72px' }}>
      <span className="pic">
        <LeafPortrait />
      </span>
    </span>
  )
  return (
    <main className="empty-start" aria-label={hasTree ? 'Start page' : 'Start a family tree'}>
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
        {hasTree ? (
          <button ref={back} type="button" className="start-tile" onClick={() => ui.setStartPage(false)}>
            {portrait}
            <b>Back to your tree</b>
            <span>
              {title}
              <br />
              {people} {people === 1 ? 'person' : 'people'}
            </span>
          </button>
        ) : (
          <button type="button" className="start-tile" onClick={() => void startWithYou()}>
            {portrait}
            <b>Start with you</b>
            <span>Add yourself, then your parents and grandparents</span>
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {hasTree && (
            <button type="button" className="chunky" onClick={() => void startNewTree()}>
              <Plus />
              Start a new tree
            </button>
          )}
          <button
            type="button"
            className="chunky"
            onClick={() => {
              // With a tree, Import opens over it, so a file combined into it shows there
              if (hasTree) ui.setStartPage(false)
              ui.openSheet('import')
            }}
          >
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
