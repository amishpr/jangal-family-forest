import type { ExportedTree, Family, Person, TreeDoc } from './model'
import { SCHEMA_VERSION } from './model'

// The backup file format (PLAN 8.10): the tree as JSON, pretty printed with a stable key order so
// two exports of the same tree are identical and diff nicely, plus optional photos as base64.

export const SCHEMA_URL = '/schema/v1.json'

const TREE_KEYS = ['$schema', 'schemaVersion', 'id', 'title', 'titleAuto', 'subtitle', 'showStats', 'homePersonId', 'reply', 'people', 'families', 'view', 'meta', 'titles', 'photos']
const PERSON_KEYS: (keyof Person)[] = [
  'id', 'firstName', 'middleName', 'lastName', 'birthSurname', 'nickname', 'calledBy', 'calledByFrom', 'gender', 'genderOther', 'species',
  'birth', 'death', 'deceased', 'livesIn', 'photoId', 'notes', 'tags', 'createdAt', 'updatedAt',
]
const FAMILY_KEYS: (keyof Family)[] = ['id', 'partnerIds', 'status', 'start', 'end', 'childOrder', 'children']

function pick<T extends object>(obj: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k]
    if (v !== undefined) out[k] = v
  }
  // Anything unexpected keeps its place at the end rather than being lost
  for (const [k, v] of Object.entries(obj)) if (!(k in out) && v !== undefined) out[k] = v
  return out
}

/** The file's text. `schemaUrl` is absolute on the live site, so editors can validate it. */
export function treeToJson(tree: ExportedTree, schemaUrl = SCHEMA_URL): string {
  const people = Object.fromEntries(Object.entries(tree.people).map(([id, p]) => [id, pick(p, PERSON_KEYS)]))
  const families = Object.fromEntries(Object.entries(tree.families).map(([id, f]) => [id, pick(f, FAMILY_KEYS)]))
  const ordered = pick({ $schema: schemaUrl, ...tree, schemaVersion: SCHEMA_VERSION, people, families }, TREE_KEYS)
  return JSON.stringify(ordered, null, 2) + '\n'
}

/** Text written into HTML, so a name or a note can never become markup */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * Data inside an exported HTML page lives in a <script type="application/json"> block. Every "<"
 * is escaped, so no name or note can ever close that block early (PLAN 8.10).
 */
export const embedJson = (json: string) =>
  json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')

const DATA_RE = /<script[^>]*\bid=["']jangal-data["'][^>]*>([\s\S]*?)<\/script>/i

/** Pulls the tree back out of an exported HTML page, or null if it isn't one */
export function extractFromHtml(html: string): string | null {
  const m = DATA_RE.exec(html)
  return m ? m[1].trim() : null
}

/** A filled-in document for saving or exporting: the view and meta always present */
export function completeDoc(doc: TreeDoc): TreeDoc {
  return { ...doc, meta: { ...doc.meta, app: 'jangal' } }
}
