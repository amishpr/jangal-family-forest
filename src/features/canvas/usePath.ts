import { useMemo } from 'react'
import { indexOf } from '../../core/index'
import { findPath, type PathResult } from '../../core/path'
import { useTree } from '../../store/treeStore'
import { useUi } from '../../store/uiStore'

/** The highlighted path, if there is one */
export function usePathResult(): PathResult | null {
  const path = useUi((s) => s.path)
  const people = useTree((s) => s.doc?.people)
  const families = useTree((s) => s.doc?.families)
  return useMemo(() => {
    if (!path || !people || !families) return null
    return findPath(indexOf({ people, families }), path.a, path.b)
  }, [path, people, families])
}
