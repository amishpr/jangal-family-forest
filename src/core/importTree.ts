import { migrate, MigrationError } from './migrate'
import type { ExportedTree } from './model'
import { repairTree, TreeFileSchema } from './schema'
import { extractFromHtml } from './treeFile'

// Reading a file someone picked (PLAN E-2): a JSON backup, an exported family page (its data is
// pulled back out), or a backup from the prototypes. It's validated and summarized before anything
// in the app changes. GEDCOM files go through core/gedcom instead.

export const MAX_FILE_BYTES = 100 * 1024 * 1024

export type ImportPreview = {
  ok: true
  tree: ExportedTree
  people: number
  photos: number
  warnings: string[]
  source: 'json' | 'html' | 'sheet'
}

export type ImportFailure = { ok: false; error: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function summarize(p: Pick<ImportPreview, 'people' | 'photos' | 'warnings'>) {
  return [plural(p.people, 'person', 'people'), plural(p.photos, 'photo'), p.warnings.length ? plural(p.warnings.length, 'warning') : '']
    .filter(Boolean)
    .join(', ')
}

/** Where in the text a JSON error happened, as a line number */
function jsonErrorLine(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  const pos = /position (\d+)/.exec(msg)?.[1]
  const line = pos ? text.slice(0, Number(pos)).split('\n').length : null
  return line ? `Line ${line}: this isn't valid JSON, so the file may be cut off or edited by hand.` : "This file isn't valid JSON."
}

/** "people.p_8.firstName" becomes "Person p_8, first name" */
function describePath(path: PropertyKey[]): string {
  const [top, id, field] = path.map(String)
  const nice = (f?: string) => (f ? f.replace(/([A-Z])/g, ' $1').toLowerCase() : '')
  if (top === 'people' && id) return `Person ${id}${field ? `, ${nice(field)}` : ''}`
  if (top === 'families' && id) return `Family ${id}${field ? `, ${nice(field)}` : ''}`
  return nice(top) || 'The file'
}

export function readTreeText(text: string, fileName = ''): ImportPreview | ImportFailure {
  let source: ImportPreview['source'] = 'json'
  let json = text
  if (/\.html?$/i.test(fileName) || /^\s*<!doctype html|^\s*<html/i.test(text)) {
    const inner = extractFromHtml(text)
    if (!inner) return { ok: false, error: "This page doesn't have a family tree in it. Only pages exported from Jangal can be imported." }
    json = inner
    source = 'html'
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    return { ok: false, error: jsonErrorLine(json, err) }
  }
  let migrated: unknown
  try {
    migrated = migrate(raw)
  } catch (err) {
    return { ok: false, error: err instanceof MigrationError ? err.message : "This file couldn't be read." }
  }
  return checkTree(migrated, source)
}

/** The checks every imported tree goes through, whatever file it came from: the schema, then repairs */
export function checkTree(migrated: unknown, source: ImportPreview['source']): ImportPreview | ImportFailure {
  const parsed = TreeFileSchema.safeParse(migrated)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `${describePath(issue.path)}: ${issue.message}` }
  }
  const { doc, warnings } = repairTree(parsed.data)
  if (!Object.keys(doc.people).length) return { ok: false, error: 'This file has no people in it.' }
  return {
    ok: true,
    tree: doc,
    people: Object.keys(doc.people).length,
    photos: Object.keys(doc.photos ?? {}).length,
    warnings,
    source,
  }
}
