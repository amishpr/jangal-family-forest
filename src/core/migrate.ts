import { SCHEMA_VERSION } from './model'

// Schema migrations (PLAN E-2). Each step takes a file one version forward. There's only version 1
// so far, plus the prototype format the mockups exported ("jangal-mockup"), which is converted so
// nothing saved from a prototype is lost.

export class MigrationError extends Error {}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

export function migrate(raw: unknown): unknown {
  if (!isObj(raw)) throw new MigrationError("This file doesn't contain a family tree")
  const v = raw.schemaVersion
  if (typeof v === 'number' && v > SCHEMA_VERSION) {
    throw new MigrationError('This file was made by a newer version of Jangal. Update the app, then try again.')
  }
  if (typeof raw.app === 'string' && raw.app.endsWith('-mockup')) return fromMockup(raw)
  if (v !== SCHEMA_VERSION) throw new MigrationError("This file doesn't look like a Jangal backup")
  return raw
}

const date = (d: unknown) => {
  if (!isObj(d) || typeof d.y !== 'number') return undefined
  return { year: d.y, ...(typeof d.m === 'number' ? { month: d.m } : {}), ...(typeof d.d === 'number' ? { day: d.d } : {}), ...(d.approx ? { approx: true } : {}) }
}
const GENDER: Record<string, string> = { m: 'male', f: 'female', u: 'unknown', o: 'other' }
const KIND: Record<string, string> = { bio: 'biological', adopted: 'adopted', step: 'step', foster: 'foster' }

/** The mockups' export: short field names, and photos as data URLs keyed by person id */
function fromMockup(raw: Json): Json {
  const stampNow = new Date().toISOString()
  const peopleIn = isObj(raw.people) ? raw.people : {}
  const photosIn = isObj(raw.photos) ? raw.photos : {}
  const people: Json = {}
  const photos: Json = {}
  for (const [id, p] of Object.entries(peopleIn)) {
    if (!isObj(p)) continue
    const birth = isObj(p.birth) ? { date: date(p.birth), place: p.birth.place } : undefined
    const death = isObj(p.death) ? { date: date(p.death), place: p.death.place } : undefined
    const photo = photosIn[id]
    let photoId: string | undefined
    if (typeof photo === 'string') {
      const m = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(photo)
      if (m) {
        photoId = `ph_${id}`
        photos[photoId] = { mime: m[1], data: m[2] }
      }
    }
    people[id] = {
      id,
      firstName: p.first ?? '',
      lastName: p.last || undefined,
      birthSurname: p.birthSurname,
      nickname: p.nickname,
      gender: GENDER[String(p.gender)] ?? 'unknown',
      genderOther: p.genderOther,
      birth,
      death,
      deceased: death ? true : undefined,
      notes: p.notes,
      photoId,
      createdAt: stampNow,
      updatedAt: stampNow,
    }
  }
  const families: Json = {}
  const famsIn = isObj(raw.families) ? raw.families : {}
  for (const [id, f] of Object.entries(famsIn)) {
    if (!isObj(f)) continue
    families[id] = {
      id,
      partnerIds: Array.isArray(f.partners) ? f.partners : [],
      status: f.status,
      start: date(f.start),
      end: date(f.end),
      children: Array.isArray(f.children)
        ? f.children.filter(isObj).map((c) => ({ personId: c.id, kind: KIND[String(c.kind)] ?? 'biological' }))
        : [],
    }
  }
  const view = isObj(raw.view) ? raw.view : {}
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'imported',
    title: raw.title ?? '',
    titleAuto: raw.titleAuto ?? true,
    subtitle: raw.subtitle,
    showStats: raw.showStats ?? true,
    homePersonId: raw.homePersonId ?? null,
    people,
    families,
    view: { collapsedFamilies: view.collapsedFamilies ?? [], collapsedAncestors: view.collapsedAncestors ?? [], direction: 'down' },
    meta: { createdAt: stampNow, updatedAt: stampNow, app: 'jangal' },
    photos: Object.keys(photos).length ? photos : undefined,
  }
}
