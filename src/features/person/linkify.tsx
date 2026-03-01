import type { ReactNode } from 'react'

// Notes keep their line breaks and turn web addresses into links (PLAN P-8). Nothing is ever
// read as HTML: the text is split and the links are real anchors.

const URL_RE = /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g

export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) out.push(text.slice(last, i))
    out.push(
      <a key={i} href={m[0]} target="_blank" rel="noopener noreferrer">
        {m[0].replace(/^https?:\/\//, '')}
      </a>,
    )
    last = i + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
