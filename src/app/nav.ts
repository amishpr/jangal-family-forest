import { useUi, type Tab } from '../store/uiStore'

/** Switches tab and keeps it in the URL (?view=timeline) */
export function setTab(tab: Tab) {
  useUi.getState().setTab(tab)
  const url = new URL(location.href)
  if (tab === 'tree') url.searchParams.delete('view')
  else url.searchParams.set('view', tab)
  history.replaceState(null, '', url)
}

/** Each tab can say how it shows a person: the tree flies there, the timeline scrolls, the fan recenters */
export const tabGoTo: Partial<Record<Tab, (id: string) => void>> = {}
