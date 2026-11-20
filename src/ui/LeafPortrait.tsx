// The leaf portrait (PLAN 6.6), on its own so pages without the photo store can draw it

/** The leaf portrait: a leaf with a midrib and two pairs of veins, tilted 38 degrees */
export function LeafPortrait({ round = false }: { round?: boolean }) {
  return (
    <svg className="leafpic" viewBox="0 0 64 64" aria-hidden="true">
      {round ? <circle className="lp-bg" cx="32" cy="32" r="32" /> : <rect className="lp-bg" width="64" height="64" />}
      <g transform="rotate(38 32 34)">
        <path className="lp-stem" d="M32 47V57" />
        <path className="lp-leaf" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z" />
        <path className="lp-vein" d="M32 46V19M32 40.5L37.6 35M32 40.5L26.4 35M32 32L36.4 27.6M32 32L27.6 27.6" />
      </g>
    </svg>
  )
}
