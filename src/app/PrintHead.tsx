import { useTitle } from './derive'
import { Wordmark } from '../ui/Wordmark'

// When the browser prints the page ("Save as PDF" works too), the tree gets its title on top and a
// small credit at the bottom, like the poster (PLAN E-7). Hidden on screen.

export function PrintHead() {
  const { title, subtitle, stats, showStats } = useTitle()
  return (
    <>
      <div className="printhead" aria-hidden="true">
        <b>{title}</b>
        {subtitle && <span>{subtitle}</span>}
        {showStats && stats && <small>{stats}</small>}
      </div>
      <div className="printfoot" aria-hidden="true">
        Made with <Wordmark />
      </div>
    </>
  )
}
