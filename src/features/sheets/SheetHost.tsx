import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { useUi, type SheetName } from '../../store/uiStore'

// Each sheet loads the first time it's opened (PLAN 10.5)

const SHEETS: Partial<Record<SheetName, LazyExoticComponent<ComponentType>>> = {
  me: lazy(() => import('./WhoAreYouSheet')),
  find: lazy(() => import('../search/FindSheet')),
  relate: lazy(() => import('../related/RelateSheet')),
  about: lazy(() => import('../about/AboutSheet')),
  shortcuts: lazy(() => import('../about/ShortcutsSheet')),
  bdays: lazy(() => import('../birthdays/BirthdaysSheet')),
  titles: lazy(() => import('../titles/TitlesSheet')),
  // The family page can't export or import, so those sheets aren't in its build
  ...(__VIEWER__
    ? {}
    : {
        export: lazy(() => import('../export/ShareSheet')),
        import: lazy(() => import('../import/ImportSheet')),
        ask: lazy(() => import('../person/AskSheet')),
      }),
}

export default function SheetHost() {
  const sheet = useUi((s) => s.sheet)
  const Comp = sheet ? SHEETS[sheet] : undefined
  return Comp ? <Comp key={sheet} /> : null
}
