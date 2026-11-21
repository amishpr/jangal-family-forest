import { memo, type ReactNode } from 'react'
import type { Person } from '../core/model'
import { isDeceased } from '../core/model'
import { yearsLabel } from '../core/dates'
import { usePhotoUrl } from '../store/photos'
import { LeafPortrait } from './LeafPortrait'

export { LeafPortrait }

// A person's picture (PLAN 6.6): their photo, or the leaf portrait in their branch color. People
// who have died get the sprouting seed at the lower right.

/** A pet's portrait: a paw print in its owners' branch color (TODO.md F14) */
function PawPortrait() {
  return (
    <svg className="leafpic" viewBox="0 0 64 64" aria-hidden="true">
      <rect className="lp-bg" width="64" height="64" />
      <g className="lp-leaf">
        <ellipse cx="19.5" cy="29" rx="4.6" ry="6" transform="rotate(-24 19.5 29)" />
        <ellipse cx="27.5" cy="20.5" rx="4.6" ry="6.2" transform="rotate(-8 27.5 20.5)" />
        <ellipse cx="36.5" cy="20.5" rx="4.6" ry="6.2" transform="rotate(8 36.5 20.5)" />
        <ellipse cx="44.5" cy="29" rx="4.6" ry="6" transform="rotate(24 44.5 29)" />
        <path d="M32 31.5c6.4 0 12.5 7 12.5 12.6 0 3.8-2.9 5.9-6.3 5.9-2.6 0-4-1.4-6.2-1.4s-3.6 1.4-6.2 1.4c-3.4 0-6.3-2.1-6.3-5.9 0-5.6 6.1-12.6 12.5-12.6z" />
      </g>
    </svg>
  )
}

/** The remembrance mark: a bark brown seed with two new leaves in the person's branch color */
export function SeedMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path className="seed-fill" d="M12 9.6c3 1.9 5.3 4.2 5.3 7.1 0 2.8-2.3 4.8-5.3 4.8s-5.3-2-5.3-4.8c0-2.9 2.3-5.2 5.3-7.1z" />
      <path fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" d="M12 10.4V6.2" />
      <path fill="currentColor" d="M11.6 7.1C10.9 4.4 8.6 2.8 5.4 3.1 5.3 6.2 7.7 8 11.6 7.1z" />
      <path fill="currentColor" d="M12.4 6.3C13.2 3.8 15.4 2.4 18.6 2.7 18.6 5.6 16.2 7.2 12.4 6.3z" />
    </svg>
  )
}

type AvatarProps = {
  person: Person
  size: number
  side: string
  /** Use the 512 px photo instead of the 144 px thumbnail */
  large?: boolean
  children?: ReactNode
  title?: string
}

export const Avatar = memo(function Avatar({ person, size, side, large = false, children, title }: AvatarProps) {
  const url = usePhotoUrl(person.photoId, large || size > 120 ? 'full' : 'thumb')
  return (
    <span className={`av ${side}`} style={{ ['--sz' as string]: `${size}px` }} title={title}>
      <span className="pic">{url ? <img src={url} alt="" draggable={false} /> : person.species ? <PawPortrait /> : <LeafPortrait />}</span>
      {isDeceased(person) && (
        <span className="mem" title={`In memory, ${yearsLabel(person)}`}>
          <SeedMark />
        </span>
      )}
      {children}
    </span>
  )
})
