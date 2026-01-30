// GEDCOM, the plain text format Ancestry, FamilySearch, MyHeritage and Gramps all export (PLAN
// 8.12). Each line is "level [@xref@] TAG [value]". This turns the bytes into text, whatever the
// encoding, and the lines into a tree of records.

export type GedNode = { level: number; xref?: string; tag: string; value: string; children: GedNode[]; line: number }

// ---- encodings

/** ANSEL (the old GEDCOM default): special letters, and combining marks written before their letter */
const ANSEL_SPECIAL: Record<number, string> = {
  0xa1: 'Ł', 0xa2: 'Ø', 0xa3: 'Đ', 0xa4: 'Þ', 0xa5: 'Æ', 0xa6: 'Œ', 0xa7: 'ʹ', 0xa8: '·', 0xa9: '♭', 0xaa: '®',
  0xab: '±', 0xac: 'Ơ', 0xad: 'Ư', 0xae: 'ʼ', 0xb0: 'ʻ', 0xb1: 'ł', 0xb2: 'ø', 0xb3: 'đ', 0xb4: 'þ', 0xb5: 'æ',
  0xb6: 'œ', 0xb7: 'ʺ', 0xb8: 'ı', 0xb9: '£', 0xba: 'ð', 0xbc: 'ơ', 0xbd: 'ư', 0xc0: '°', 0xc1: 'ℓ', 0xc2: '℗',
  0xc3: '©', 0xc4: '♯', 0xc5: '¿', 0xc6: '¡', 0xc7: 'ß', 0xc8: '€',
}
const ANSEL_COMBINING: Record<number, string> = {
  0xe0: '̉', 0xe1: '̀', 0xe2: '́', 0xe3: '̂', 0xe4: '̃', 0xe5: '̄', 0xe6: '̆',
  0xe7: '̇', 0xe8: '̈', 0xe9: '̌', 0xea: '̊', 0xeb: '︠', 0xec: '︡', 0xed: '̕',
  0xee: '̋', 0xef: '̐', 0xf0: '̧', 0xf1: '̨', 0xf2: '̣', 0xf3: '̤', 0xf4: '̥',
  0xf5: '̳', 0xf6: '̲', 0xf7: '̦', 0xf8: '̜', 0xf9: '̮', 0xfa: '︢', 0xfb: '︣',
  0xfe: '̓',
}

export function decodeAnsel(bytes: Uint8Array): string {
  let out = ''
  let marks = ''
  for (const b of bytes) {
    if (ANSEL_COMBINING[b]) {
      marks += ANSEL_COMBINING[b]
      continue
    }
    const ch = b < 0x80 ? String.fromCharCode(b) : (ANSEL_SPECIAL[b] ?? '�')
    out += ch + marks
    marks = ''
  }
  return (out + marks).normalize('NFC')
}

/** Finds the encoding from a byte order mark, or from the header's CHAR line */
export function decodeGedcom(buf: ArrayBuffer): { text: string; encoding: string } {
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'UTF-8' }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'UTF-16' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'UTF-16' }
  // UTF-16 without a mark: every other byte of "0 HEAD" is zero
  if (bytes[0] === 0x30 && bytes[1] === 0) return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'UTF-16' }
  if (bytes[0] === 0 && bytes[1] === 0x30) return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'UTF-16' }
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4000))
  const char = /\n\s*1\s+CHAR\s+(\S+)/i.exec(head)?.[1]?.toUpperCase() ?? 'UTF-8'
  if (char === 'ANSEL') return { text: decodeAnsel(bytes), encoding: 'ANSEL' }
  if (char === 'ANSI' || char === 'WINDOWS-1252' || char === 'IBMPC' || char === 'ASCII') {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: char }
  }
  // CHAR UNICODE means UTF-16, but real UTF-16 was caught above by its zero bytes, so these bytes are
  // 8-bit whatever the header says. UTF-8, but fall back to Windows-1252 if the bytes aren't valid UTF-8
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'ANSI' }
  }
}

// ---- lines and records

const LINE_RE = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/

/** The records at level 0, each with its sub-lines. CONC and CONT are joined into their value. */
export function parseGedcom(text: string): { records: GedNode[]; badLines: number } {
  const records: GedNode[] = []
  const stack: GedNode[] = []
  let badLines = 0
  const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  lines.forEach((raw, i) => {
    if (!raw.trim()) return
    const m = LINE_RE.exec(raw)
    if (!m) {
      badLines++
      return
    }
    const level = Number(m[1])
    const node: GedNode = { level, xref: m[2]?.slice(1, -1), tag: m[3].toUpperCase(), value: m[4] ?? '', children: [], line: i + 1 }
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const parent = stack[stack.length - 1]
    if (node.tag === 'CONC' && parent) {
      parent.value += node.value
      return
    }
    if (node.tag === 'CONT' && parent) {
      parent.value += `\n${node.value}`
      return
    }
    if (level === 0 || !parent) records.push(node)
    else parent.children.push(node)
    stack.push(node)
  })
  return { records, badLines }
}

export const child = (n: GedNode, tag: string) => n.children.find((c) => c.tag === tag)
export const childrenOf = (n: GedNode, tag: string) => n.children.filter((c) => c.tag === tag)
export const ref = (value: string) => /^@([^@]+)@$/.exec(value.trim())?.[1]
