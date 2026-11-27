// Turns untrusted JSON into app data. Never throws. A bad record is set aside
// with its raw value; only a store we can't understand at all is refused.
import type { z } from 'zod'
import type { Entry, Group, Person, Settings } from '../domain/types'
import { migrate, MIGRATIONS, type Migration } from './migrations'
import {
  ME_ID,
  SCHEMA_VERSION,
  entrySchema,
  groupSchema,
  personSchema,
  problemsOf,
  settingsSchema,
  PROBLEMS,
  type Problem,
} from './schema'

export interface AppData {
  people: Person[]
  groups: Group[]
  entries: Entry[]
  settings: Settings
}

const COLLECTIONS = ['people', 'groups', 'entries', 'settings'] as const
export type Collection = (typeof COLLECTIONS)[number]

export interface Quarantined {
  collection: Collection
  /** Exactly what was stored, so nothing is ever lost. */
  raw: unknown
  problems: Problem[]
}

export type ParseResult =
  | { status: 'ok'; data: AppData; quarantine: Quarantined[] }
  | { status: 'unreadable' }
  | { status: 'newer-version' }

const ME: Person = { id: ME_ID, name: 'เรา', isMe: true }

export function emptyData(): AppData {
  return { people: [{ ...ME }], groups: [], entries: [], settings: { schemaVersion: SCHEMA_VERSION } }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseList<T extends { id: string }>(
  collection: Collection,
  list: unknown[],
  schema: z.ZodType<T>,
  quarantine: Quarantined[],
): T[] {
  const good: T[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const result = schema.safeParse(raw)
    if (!result.success) {
      quarantine.push({ collection, raw, problems: problemsOf(result.error) })
    } else if (seen.has(result.data.id)) {
      quarantine.push({ collection, raw, problems: ['duplicate-id'] })
    } else {
      seen.add(result.data.id)
      good.push(result.data)
    }
  }
  return good
}

/** Records set aside earlier are carried forward unchanged. */
function readQuarantine(list: unknown[]): Quarantined[] {
  return list.map((item) => {
    if (isObject(item) && 'raw' in item) {
      const collection = COLLECTIONS.find((c) => c === item.collection)
      const problems = Array.isArray(item.problems)
        ? PROBLEMS.filter((p) => (item.problems as unknown[]).includes(p))
        : []
      if (collection) return { collection, raw: item.raw, problems }
    }
    return { collection: 'entries', raw: item, problems: ['shape'] }
  })
}

/** `stored` is `{ data, quarantine? }`; the version is `data.settings.schemaVersion`. */
export function parseStore(
  stored: unknown,
  version = SCHEMA_VERSION,
  migrations: readonly Migration[] = MIGRATIONS,
): ParseResult {
  if (!isObject(stored) || !isObject(stored.data)) return { status: 'unreadable' }
  const settings = stored.data.settings
  if (!isObject(settings)) return { status: 'unreadable' }
  const from = settings.schemaVersion
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return { status: 'unreadable' }
  if (from > version) return { status: 'newer-version' }

  let data: Record<string, unknown>
  try {
    data = migrate(stored.data, from, version, migrations)
  } catch {
    return { status: 'unreadable' }
  }

  const { people, groups, entries } = data
  const setAside = stored.quarantine ?? []
  if (!Array.isArray(people) || !Array.isArray(groups) || !Array.isArray(entries)) {
    return { status: 'unreadable' }
  }
  if (!Array.isArray(setAside)) return { status: 'unreadable' }

  const quarantine = readQuarantine(setAside)

  const checkedSettings = settingsSchema.safeParse({ ...settings, schemaVersion: version })
  if (!checkedSettings.success) {
    quarantine.push({ collection: 'settings', raw: settings, problems: problemsOf(checkedSettings.error) })
  }

  const goodPeople = parseList<Person>('people', people, personSchema, quarantine)
  // Entries point at me by this id, so recreating the record keeps them linked.
  if (!goodPeople.some((p) => p.id === ME_ID)) goodPeople.unshift({ ...ME })

  return {
    status: 'ok',
    data: {
      people: goodPeople,
      groups: parseList<Group>('groups', groups, groupSchema, quarantine),
      entries: parseList<Entry>('entries', entries, entrySchema, quarantine),
      settings: checkedSettings.success ? checkedSettings.data : { schemaVersion: version },
    },
    quarantine,
  }
}
