// The tree document (PLAN 8.4). Only facts are stored: people, and families (a partnership plus the
// children that belong to it). Siblings, cousins, in-laws and sides are all derived from these.
// The zod schemas for imported files live in schema.ts, so zod only loads when a file is imported.

export type PartialDate = {
  year?: number
  month?: number // 1 to 12
  day?: number // 1 to 31
  approx?: boolean // "about 1920"
}

export type Gender = 'male' | 'female' | 'unknown' | 'other'

export type LifeEvent = { date?: PartialDate; place?: string }

export type Person = {
  id: string
  firstName: string
  middleName?: string
  lastName?: string
  birthSurname?: string // maiden name
  nickname?: string
  calledBy?: string // what everyone calls them, shown instead of the family title (TODO.md F10)
  calledByFrom?: Record<string, string> // what one person (by id) calls them, which wins for them
  gender?: Gender // unknown is the default
  genderOther?: string // free text when gender is 'other', like "nonbinary"
  species?: string // set for a pet: "Dog", "Cat" (TODO.md F14). A pet is its owners' child in the data.
  birth?: LifeEvent
  death?: LifeEvent
  deceased?: boolean // true even when no death date is known
  livesIn?: string // where a living person lives now (TODO.md F15)
  photoId?: string
  notes?: string
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export type ChildKind = 'biological' | 'adopted' | 'step' | 'foster' | 'unknown'

export type ChildLink = { personId: string; kind: ChildKind }

export type FamilyStatus = 'married' | 'partners' | 'engaged' | 'divorced' | 'separated' | 'widowed'

// A family is a partnership plus its children. It can have no partners (unknown parents), one
// (a single parent), or two.
export type Family = {
  id: string
  partnerIds: string[]
  status?: FamilyStatus
  start?: PartialDate
  end?: PartialDate
  children: ChildLink[]
  /** 'set': show the children in this list's order, as the family arranged them, not by birth (TODO.md F18) */
  childOrder?: 'set'
}

export type TreeView = {
  collapsedFamilies: string[] // descendants hidden
  collapsedAncestors: string[] // person ids whose parents are hidden
  direction: 'down' | 'right'
}

export const SCHEMA_VERSION = 1

// Everything undo covers. The view (what's tucked away) is saved with the tree but isn't an edit.
export type TreeCore = {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  title: string // "The Kapoor Family"
  titleAuto: boolean // true while it's still the suggestion, so it keeps updating
  subtitle?: string // "From Sevilla and Chennai to Texas"
  showStats: boolean // "23 people · 5 generations · since 1911" under the title
  homePersonId: string | null // "This is me". null is the neutral view
  people: Record<string, Person>
  families: Record<string, Family>
  meta: { createdAt: string; updatedAt: string; app: string }
}

export type TreeDoc = TreeCore & { view: TreeView }

export type PhotoMime = 'image/webp' | 'image/jpeg' | 'image/png'

// Only in exported JSON and HTML. In the app, photos live as Blobs in IndexedDB.
/** The family titles a backup or family page can carry (TODO.md TP-8). The pack is checked when it's used. */
export type ExportedTitles = { lang: string; picks: Record<string, string>; pack?: unknown }

/**
 * A relative's answers from a fill-in link (SHARE.md SH-11): which tree they're for, who was asked,
 * and the ids that came from the link, so the review can match those people without guessing.
 */
export type ReplyInfo = { treeId: string; treeTitle: string; forId: string; known: string[]; sentAt: string }

export type ExportedTree = TreeDoc & {
  photos?: Record<string, { mime: PhotoMime; data: string }>
  titles?: ExportedTitles
  reply?: ReplyInfo
}

export const emptyView = (): TreeView => ({ collapsedFamilies: [], collapsedAncestors: [], direction: 'down' })

/** True for the sample family (core/sample.ts), which is only loaded when it's opened */
export const isSampleTree = (doc: Pick<TreeDoc, 'id'>) => doc.id === 'sample'

// ---------------------------------------------------------------------------------------------
// Small helpers about one person
// ---------------------------------------------------------------------------------------------

export const fullName = (p: Pick<Person, 'firstName' | 'lastName'>) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Someone'

export const isDeceased = (p: Person) => !!p.deceased || !!p.death

/** A pet is a person with a species: a leaf in its owners' family, never a parent or a partner */
export const isPet = (p: Person | undefined | null) => !!p?.species

export const isLiving = (p: Person) => !isDeceased(p)

// Relationship words use the gender when it's male or female, and neutral words otherwise
export type WordGender = 'm' | 'f' | 'n'
export const wordGender = (p: Person | undefined): WordGender =>
  p?.gender === 'male' ? 'm' : p?.gender === 'female' ? 'f' : 'n'

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  unknown: 'Unknown',
  other: 'Other',
}

export const genderLabel = (p: Person) =>
  p.gender === 'other' ? p.genderOther || 'Other' : GENDER_LABELS[p.gender ?? 'unknown']
