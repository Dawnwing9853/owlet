// The only code that reads or writes localStorage.
import { pickColorSlot } from '../domain/colors'
import { entryPersonIds } from '../domain/ledger'
import { finalizeBill, type BillIssue } from '../domain/split'
import type { Bill, Person, PersonId } from '../domain/types'
import { newId } from './ids'
import { emptyData, parseStore, type AppData, type Quarantined } from './parse'
import { ME_ID, entrySchema, personSchema, problemsOf, type Problem } from './schema'

export const STORAGE_KEY = 'owlet:data'

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type LoadResult =
  | { status: 'ok'; data: AppData; quarantine: Quarantined[]; firstRun: boolean }
  /** Nothing may be written over this. `raw` is for the recovery screen. */
  | { status: 'unreadable' | 'newer-version'; raw: string }

/** A bill as the form knows it. `owed` is deliberately not accepted. */
export type BillInput = Omit<Bill, 'kind' | 'id' | 'owed'> & { id?: string }

export type SaveFailure =
  | { ok: false; reason: 'invalid-bill'; issues: BillIssue[] }
  | { ok: false; reason: 'invalid-data'; problems: Problem[] }
  | { ok: false; reason: 'unknown-person'; personIds: PersonId[] }
  | { ok: false; reason: 'store-unavailable' }
  | { ok: false; reason: 'write-failed' }

export type SaveResult<T> = { ok: true; value: T; data: AppData } | SaveFailure

/** `random` only breaks ties between equally used person colours. */
export function createRepository(store: KeyValueStore, random: () => number = Math.random) {
  function load(): LoadResult {
    let raw: string | null
    try {
      raw = store.getItem(STORAGE_KEY)
    } catch {
      return { status: 'unreadable', raw: '' }
    }
    if (raw === null) return { status: 'ok', data: emptyData(), quarantine: [], firstRun: true }

    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return { status: 'unreadable', raw }
    }
    const result = parseStore(json)
    return result.status === 'ok' ? { ...result, firstRun: false } : { status: result.status, raw }
  }

  function write(data: AppData, quarantine: Quarantined[]): boolean {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify({ data, quarantine }))
      return true
    } catch {
      return false
    }
  }

  /** Re-reads before every change, so a stale copy never overwrites newer data. */
  function update<T>(change: (data: AppData) => { data: AppData; value: T } | SaveFailure): SaveResult<T> {
    const current = load()
    if (current.status !== 'ok') return { ok: false, reason: 'store-unavailable' }
    const next = change(current.data)
    if ('ok' in next) return next
    if (!write(next.data, current.quarantine)) return { ok: false, reason: 'write-failed' }
    return { ok: true, value: next.value, data: next.data }
  }

  return {
    load,

    /** Loads, and on the very first run saves the starting data. */
    initialize(): LoadResult {
      const result = load()
      if (result.status === 'ok' && result.firstRun) write(result.data, result.quarantine)
      return result
    },

    /** The only way to save a bill. `owed` always comes from `finalizeBill`. */
    saveBill(input: BillInput): SaveResult<Bill> {
      const finalized = finalizeBill(input)
      if (!finalized.ok) return { ok: false, reason: 'invalid-bill', issues: finalized.issues }

      // Checked with the same schema as loading, so we never save what we'd reject.
      const checked = entrySchema.safeParse({ ...input, kind: 'bill', id: input.id ?? newId('b'), owed: finalized.owed })
      if (!checked.success) return { ok: false, reason: 'invalid-data', problems: problemsOf(checked.error) }
      const bill = checked.data as Bill

      return update<Bill>((data) => {
        // Only people who exist can be chosen. An unknown groupId is allowed, so
        // that editing a bill never drops what was stored.
        const known = new Set(data.people.map((p) => p.id))
        const personIds = entryPersonIds(bill).filter((id) => !known.has(id))
        if (personIds.length > 0) return { ok: false, reason: 'unknown-person', personIds }

        const index = data.entries.findIndex((e) => e.id === bill.id)
        if (index >= 0 && data.entries[index]!.kind !== 'bill') {
          return { ok: false, reason: 'invalid-data', problems: ['duplicate-id'] }
        }
        const entries = index < 0 ? [...data.entries, bill] : data.entries.with(index, bill)
        return { data: { ...data, entries }, value: bill }
      })
    },

    deleteEntry(id: string): SaveResult<null> {
      return update((data) => ({
        data: { ...data, entries: data.entries.filter((e) => e.id !== id) },
        value: null,
      }))
    },

    addPerson(name: string): SaveResult<Person> {
      const checked = personSchema.safeParse({ id: newId('p'), name: name.trim(), isMe: false })
      if (!checked.success) return { ok: false, reason: 'invalid-data', problems: problemsOf(checked.error) }
      return update((data) => {
        // The colour is chosen once and stored, never picked while drawing.
        const person: Person = { ...checked.data, colorSlot: pickColorSlot(data.people, random) }
        return { data: { ...data, people: [...data.people, person] }, value: person }
      })
    },

    /** Renames a friend and clears `needsName`. My own record can't be renamed. */
    renamePerson(id: PersonId, name: string): SaveResult<Person> {
      if (id === ME_ID) return { ok: false, reason: 'invalid-data', problems: ['me'] }
      return update<Person>((data) => {
        const index = data.people.findIndex((p) => p.id === id)
        if (index < 0) return { ok: false, reason: 'unknown-person', personIds: [id] }
        const { needsName: _, ...person } = data.people[index]!
        const checked = personSchema.safeParse({ ...person, name: name.trim() })
        if (!checked.success) return { ok: false, reason: 'invalid-data', problems: problemsOf(checked.error) }
        return { data: { ...data, people: data.people.with(index, checked.data) }, value: checked.data }
      })
    },

    /** Everything exactly as stored, for the recovery screen. */
    exportRaw(): string {
      try {
        return store.getItem(STORAGE_KEY) ?? ''
      } catch {
        return ''
      }
    },

    /** Deletes everything. The caller must have asked the owner first. */
    reset(): void {
      store.removeItem(STORAGE_KEY)
    },
  }
}

export type Repository = ReturnType<typeof createRepository>
