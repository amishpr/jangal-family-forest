import { BRAND } from '../brand'
import { WORDMARK } from './wordmark.gen'

// "Jangal (જંગલ)" drawn from outlines (PLAN 6.11), so it looks the same everywhere without
// loading Eczar or Rasa. It's sized in em like a word and sits on the text baseline: the SVG
// drops below the line by the letters' descent.

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wm ${className}`}>
      <svg
        viewBox={WORDMARK.viewBox}
        role="img"
        aria-label={BRAND.mark}
        style={{ height: `${WORDMARK.height}em`, width: `${WORDMARK.width}em`, verticalAlign: `-${WORDMARK.descent}em` }}
      >
        <path d={WORDMARK.d} />
      </svg>
    </span>
  )
}
