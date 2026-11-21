import { useTitle } from './derive'
import { Wordmark } from '../ui/Wordmark'

// When the browser prints the page ("Save as PDF" works too), the view gets its title on top and a
// small credit at the bottom, like the poster (PLAN E-7). Hidden on screen. App puts the head before
// the views and the credit after them, so on the Timeline and the Fan chart they print in the flow
// of the page, once each (PRINT.md PT-3).

export function PrintHead() {
  const { title, subtitle, stats, showStats } = useTitle()
  return (
    <div className="printhead" aria-hidden="true">
      <b>{title}</b>
      {subtitle && <span>{subtitle}</span>}
      {showStats && stats && <small>{stats}</small>}
    </div>
  )
}

export function PrintFoot() {
  return (
    <div className="printfoot" aria-hidden="true">
      Made with <Wordmark />
    </div>
  )
}
