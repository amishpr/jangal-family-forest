import { ReactFlow, ReactFlowProvider, useReactFlow, type Node, type NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { finishNaming } from '../../app/actions'
import { lineOf, relationTo, useSides, useTitles, useTreeLayout } from '../../app/derive'
import { yearsLabel } from '../../core/dates'
import { fullName, isDeceased } from '../../core/model'
import { useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'
import { attachCamera, firstView, MAX_ZOOM, MIN_ZOOM } from './camera'
import { isDragging, movableIds } from './drag'
import { Emphasis } from './Emphasis'
import { LinksLayer } from './LinksLayer'
import { PersonTile } from './PersonTile'
import { HoverTip } from './HoverTip'

// The Tree tab (PLAN 8.7): React Flow does pan, zoom, pinch and culling. Every person is a node
// placed by our own layout, and the connectors are one extra node underneath them all.

const nodeTypes = { person: PersonTile, links: LinksLayer }

function Canvas() {
  const tl = useTreeLayout()
  const sides = useSides()
  const home = useTree((s) => s.doc?.homePersonId ?? null)
  const titles = useTitles()
  const readOnly = useUi((s) => s.readOnly)
  const world = useRef<HTMLDivElement>(null)
  const flow = useReactFlow()
  // Fit once for each tree that's opened
  const treeId = useTree((s) => s.doc?.id ?? null)
  const fittedFor = useRef<string | null>(null)
  // The first tree starts where the camera would fly to anyway, so nothing is drawn twice
  const [start] = useState(() => (tl ? { view: firstView(tl.layout, tl.ix, home), treeId } : null))

  useLayoutEffect(() => {
    attachCamera(flow, world.current)
    return () => attachCamera(null, null)
  }, [flow])

  const nodes = useMemo<Node[]>(() => {
    if (!tl || !sides) return []
    const { layout, ix } = tl
    const out: Node[] = [
      {
        id: '__links',
        type: 'links',
        position: { x: 0, y: 0 },
        width: layout.bounds.w,
        height: layout.bounds.h,
        data: {},
        zIndex: 0,
        draggable: false,
        selectable: false,
        focusable: false,
      },
    ]
    // Tiles that can move among their brothers and sisters say so to the keyboard (TODO.md F18)
    const movable = readOnly ? new Set<string>() : movableIds(tl)
    for (const n of Object.values(layout.nodes)) {
      const p = ix.person(n.id)!
      const rel = relationTo(ix, home, n.id, titles) ?? lineOf(sides, n.id)
      out.push({
        id: n.id,
        type: 'person',
        position: { x: n.x, y: n.y },
        width: n.w,
        height: n.h,
        data: {},
        zIndex: 1,
        draggable: false,
        selectable: false,
        focusable: true,
        // A group, because a hovered tile holds its own + buttons. Enter opens the card.
        ariaRole: 'group',
        domAttributes: movable.has(n.id)
          ? { 'aria-roledescription': 'person', 'aria-keyshortcuts': 'Alt+ArrowLeft Alt+ArrowRight' }
          : { 'aria-roledescription': 'person' },
        ariaLabel: `${fullName(p)}, ${rel}, ${yearsLabel(p)}${isDeceased(p) ? ', in memory' : ''}`,
      })
    }
    return out
  }, [tl, sides, home, titles, readOnly])

  // Fit the whole tree the first time it appears. On a phone, start close in on you and your parents.
  // The first tree already started there; another one opened later moves the camera.
  useEffect(() => {
    if (fittedFor.current === treeId || !tl || !nodes.length) return
    const first = fittedFor.current === null && start?.treeId === treeId
    fittedFor.current = treeId
    if (first) return
    requestAnimationFrame(() => void flow.setViewport(firstView(tl.layout, tl.ix, useTree.getState().doc?.homePersonId ?? null)))
  }, [tl, nodes.length, treeId, start, flow])

  const onEnter: NodeMouseHandler = (_, node) => node.type === 'person' && !isDragging() && useUi.getState().setHover(node.id)
  const onLeave: NodeMouseHandler = () => useUi.getState().setHover(null)
  const onClick: NodeMouseHandler = (e, node) => {
    if (node.type !== 'person') return
    const ui = useUi.getState()
    if (ui.naming === node.id) return
    if (ui.naming) finishNaming(true)
    const rect = (e.target as Element).closest('.react-flow__node')?.getBoundingClientRect() ?? null
    if (ui.card?.id === node.id && ui.card.mode === 'view') ui.closeCard()
    else ui.openCard(node.id, 'view', rect)
  }

  return (
    <div className="canvas world" ref={world} id="view-tree">
      <ReactFlow
        nodes={nodes}
        edges={[]}
        defaultViewport={start?.view}
        nodeTypes={nodeTypes}
        onNodeMouseEnter={onEnter}
        onNodeMouseLeave={onLeave}
        onNodeClick={onClick}
        onPaneClick={() => {
          const ui = useUi.getState()
          if (ui.naming) finishNaming(true)
          if (ui.card?.mode !== 'edit') ui.closeCard()
          if (ui.path && ui.sheet !== 'relate') ui.setPath(null)
        }}
        onMoveStart={(e) => {
          // Panning closes a card you're only looking at. A card you're editing stays open.
          const ui = useUi.getState()
          if (e && ui.card?.mode === 'view') ui.closeCard()
        }}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onlyRenderVisibleElements
        preventScrolling
        proOptions={{ hideAttribution: true }}
        aria-label="Family tree"
      />
      <Emphasis world={world} />
      <HoverTip />
    </div>
  )
}

export default function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
