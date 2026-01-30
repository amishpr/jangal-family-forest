import { z } from 'zod'
import type { ExportedTree, TreeDoc } from './model'
import { SCHEMA_VERSION } from './model'
import { cleanPack } from './titles'

// Schemas for files coming in from outside: JSON backups, and the data inside an exported HTML
// page (PLAN 8.13). Unknown fields are dropped, text lengths are capped, and small mistakes are
// forgiven (an unknown gender becomes "unknown") rather than rejecting a whole family tree.
// This module is only loaded when someone imports a file, so zod stays out of the first load.

// Text over its cap is cut short rather than dropped, so a long note in a backup still comes back
const text = (max: number) =>
  z
    .string()
    .overwrite((s) => s.slice(0, max))
    .max(max)
const optText = (max: number) =>
  text(max)
    .optional()
    .catch(undefined)
    .transform((s) => (s?.trim() ? s : undefined))

export const PartialDateSchema = z.object({
  year: z.int().min(1).max(3000).optional().catch(undefined),
  month: z.int().min(1).max(12).optional().catch(undefined),
  day: z.int().min(1).max(31).optional().catch(undefined),
  approx: z.boolean().optional().catch(undefined),
})

const LifeEventSchema = z.object({
  date: PartialDateSchema.optional(),
  place: optText(200),
})

const IdSchema = z.string().min(1).max(80)

export const PersonSchema = z.object({
  id: IdSchema,
  firstName: text(120).catch(''),
  middleName: optText(120),
  lastName: optText(120),
  birthSurname: optText(120),
  nickname: optText(120),
  calledBy: optText(40),
  calledByFrom: z
    .record(IdSchema, text(40))
    .optional()
    .catch(undefined)
    .transform((r) => {
      const words = Object.entries(r ?? {}).filter(([, w]) => w.trim()).slice(0, 50)
      return words.length ? Object.fromEntries(words) : undefined
    }),
  gender: z.enum(['male', 'female', 'unknown', 'other']).optional().catch('unknown'),
  genderOther: optText(80),
  species: optText(40),
  birth: LifeEventSchema.optional().catch(undefined),
  death: LifeEventSchema.optional().catch(undefined),
  deceased: z.boolean().optional().catch(undefined),
  livesIn: optText(200),
  photoId: z.string().max(80).optional().catch(undefined),
  notes: optText(20_000),
  tags: z.array(text(60)).max(50).optional().catch(undefined),
  createdAt: z.string().max(40).catch(() => new Date().toISOString()),
  updatedAt: z.string().max(40).catch(() => new Date().toISOString()),
})

export const FamilySchema = z.object({
  id: IdSchema,
  partnerIds: z.array(IdSchema).max(2),
  status: z.enum(['married', 'partners', 'engaged', 'divorced', 'separated', 'widowed']).optional().catch(undefined),
  start: PartialDateSchema.optional().catch(undefined),
  end: PartialDateSchema.optional().catch(undefined),
  childOrder: z.literal('set').optional().catch(undefined),
  children: z
    .array(
      z.object({
        personId: IdSchema,
        kind: z.enum(['biological', 'adopted', 'step', 'foster', 'unknown']).catch('biological'),
      }),
    )
    .max(200),
})

const PhotoSchema = z.object({
  mime: z.enum(['image/webp', 'image/jpeg', 'image/png']),
  data: z.string().regex(/^[A-Za-z0-9+/=\s]+$/, 'Photos must be base64 image data'),
})

export const TreeFileSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdSchema.catch('imported'),
  title: text(200).catch(''),
  titleAuto: z.boolean().catch(false),
  subtitle: optText(200),
  showStats: z.boolean().catch(true),
  homePersonId: IdSchema.nullable().catch(null),
  people: z.record(z.string(), PersonSchema),
  families: z.record(z.string(), FamilySchema).default({}),
  view: z
    .object({
      collapsedFamilies: z.array(IdSchema).catch([]),
      collapsedAncestors: z.array(IdSchema).catch([]),
      direction: z.enum(['down', 'right']).catch('down'),
    })
    .catch({ collapsedFamilies: [], collapsedAncestors: [], direction: 'down' }),
  meta: z
    .object({ createdAt: z.string().max(40), updatedAt: z.string().max(40), app: z.string().max(60) })
    .catch(() => {
      const t = new Date().toISOString()
      return { createdAt: t, updatedAt: t, app: 'jangal' }
    }),
  photos: z.record(z.string(), PhotoSchema).optional().catch(undefined),
  // The family titles chosen when the file was made (TODO.md TP-8). The pack is checked in repairTree.
  titles: z
    .object({ lang: z.string().max(20), picks: z.record(z.string().max(80), z.string().max(40)).catch({}), pack: z.unknown().optional() })
    .optional()
    .catch(undefined),
})

export type TreeFile = z.infer<typeof TreeFileSchema>

/** Links to people who aren't in the file are dropped, and each one is counted as a warning */
export function repairTree(file: TreeFile): { doc: ExportedTree; warnings: string[] } {
  const warnings: string[] = []
  const people = { ...file.people }
  // The record key is the source of truth for the id
  for (const [key, p] of Object.entries(people)) if (p.id !== key) people[key] = { ...p, id: key }
  for (const [key, p] of Object.entries(people)) {
    if (!p.firstName.trim()) warnings.push(`Person ${p.id} has no name`)
    // What someone who isn't in the file calls them is dropped (TODO.md CT-4)
    if (p.calledByFrom && Object.keys(p.calledByFrom).some((v) => !people[v])) {
      const words = Object.entries(p.calledByFrom).filter(([v]) => people[v])
      const q = { ...p }
      if (words.length) q.calledByFrom = Object.fromEntries(words)
      else delete q.calledByFrom
      people[key] = q
    }
  }
  const families: TreeDoc['families'] = {}
  for (const [key, f] of Object.entries(file.families)) {
    const partnerIds = f.partnerIds.filter((pid) => {
      if (people[pid]) return true
      warnings.push(`Family ${key} names a partner who isn't in the file (${pid})`)
      return false
    })
    const seen = new Set<string>()
    const children = f.children.filter((c) => {
      if (!people[c.personId]) {
        warnings.push(`Family ${key} names a child who isn't in the file (${c.personId})`)
        return false
      }
      if (seen.has(c.personId)) return false
      seen.add(c.personId)
      return true
    })
    if (!partnerIds.length && !children.length) continue
    families[key] = { ...f, id: key, partnerIds, children }
  }
  // A pet is never a partner or a parent (TODO.md F14). Someone a file has as one stays a person.
  for (const f of Object.values(families)) {
    for (const pid of f.partnerIds) {
      if (!people[pid]?.species) continue
      warnings.push(`${people[pid].firstName || pid} is a partner or a parent, so they're kept as a person, not a pet`)
      people[pid] = { ...people[pid], species: undefined }
    }
  }
  let homePersonId = file.homePersonId
  if (homePersonId && people[homePersonId]?.species) {
    warnings.push(`A pet can't be the person marked as you, so it opens in the neutral view`)
    homePersonId = null
  }
  if (homePersonId && !people[homePersonId]) {
    warnings.push(`The person marked as you (${homePersonId}) isn't in the file, so it opens in the neutral view`)
    homePersonId = null
  }
  const view = {
    ...file.view,
    collapsedFamilies: file.view.collapsedFamilies.filter((id) => families[id]),
    collapsedAncestors: file.view.collapsedAncestors.filter((id) => people[id]),
  }
  const doc: ExportedTree = { ...file, people, families, homePersonId, view } as ExportedTree
  if (!doc.subtitle) delete doc.subtitle
  if (!doc.photos) delete doc.photos
  if (!doc.titles) delete doc.titles
  else if (doc.titles.pack !== undefined) {
    const r = cleanPack(doc.titles.pack)
    if ('pack' in r) doc.titles = { ...doc.titles, pack: r.pack }
    else {
      warnings.push(`The family titles in this file couldn't be read: ${r.error}`)
      delete doc.titles
    }
  }
  return { doc, warnings }
}
