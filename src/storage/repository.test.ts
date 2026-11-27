import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeBill } from '../domain/split'
import { PEOPLE, validBillDraft } from '../domain/testing/arbitraries'
import { newId } from './ids'
import { STORAGE_KEY, createRepository, type BillInput, type KeyValueStore } from './repository'

function fakeStore(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(STORAGE_KEY, initial)
  const state = { writes: 0, failWrites: false, failReads: false }
  const store: KeyValueStore = {
    getItem: (key) => {
      if (state.failReads) throw new Error('SecurityError')
      return values.get(key) ?? null
    },
    setItem: (key, value) => {
      if (state.failWrites) throw new Error('QuotaExceededError')
      state.writes += 1
      values.set(key, value)
    },
    removeItem: (key) => void values.delete(key),
  }
  return { store, state, raw: () => values.get(STORAGE_KEY) }
}

const input = (over: Partial<BillInput> = {}): BillInput => ({
  title: 'หมูกระทะ',
  date: '2026-11-27',
  items: [{ id: 'i1', name: 'หมู', price: 10050, sharedBy: ['me', 'p-1'] }],
  payers: { me: 10000, 'p-1': 50 },
  servicePct: 0,
  vat: false,
  discount: 0,
  ...over,
})

/** A saved store containing these people besides me. */
function storeWith(...ids: string[]) {
  const people = ['me', ...ids].map((id) => ({ id, name: id, isMe: id === 'me' }))
  return JSON.stringify({ data: { people, groups: [], entries: [], settings: { schemaVersion: 1 } } })
}

function setup(initial: string = storeWith('p-1')) {
  const fake = fakeStore(initial)
  return { ...fake, repo: createRepository(fake.store) }
}

/** Nothing stored yet, as on a new phone. */
function blank() {
  const fake = fakeStore()
  return { ...fake, repo: createRepository(fake.store) }
}

function loaded(repo: ReturnType<typeof createRepository>) {
  const result = repo.load()
  if (result.status !== 'ok') throw new Error(result.status)
  return result
}

describe('first run', () => {
  it('saves starting data with only me, once', () => {
    const { repo, state } = blank()
    expect(repo.initialize()).toMatchObject({ status: 'ok', firstRun: true, quarantine: [] })
    expect(repo.initialize()).toMatchObject({ status: 'ok', firstRun: false, quarantine: [] })
    expect(state.writes).toBe(1)
    expect(loaded(repo).data.people).toEqual([{ id: 'me', name: 'เรา', isMe: true }])
  })

  it('does not write while only loading', () => {
    const { repo, state } = blank()
    repo.load()
    expect(state.writes).toBe(0)
  })
})

describe('saveBill', () => {
  it('computes owed itself and survives a reload', () => {
    const { repo, store } = setup()
    const saved = repo.saveBill(input())
    if (!saved.ok) throw new Error(saved.reason)
    expect(saved.value.owed).toEqual({ me: 5025, 'p-1': 5025 })
    expect(loaded(createRepository(store)).data.entries).toEqual([saved.value])
    expect(loaded(repo).quarantine).toEqual([])
  })

  it('ignores an owed passed in by the caller', () => {
    const { repo } = setup()
    const sneaky = { ...input(), owed: { me: 0, 'p-1': 10050 } }
    const saved = repo.saveBill(sneaky)
    expect(saved.ok && saved.value.owed).toEqual({ me: 5025, 'p-1': 5025 })
  })

  it('edits in place, recalculating owed and keeping the id and position', () => {
    const { repo } = setup()
    const first = repo.saveBill(input())
    repo.saveBill(input({ title: 'second' }))
    if (!first.ok) throw new Error(first.reason)
    repo.saveBill(input({ id: first.value.id, servicePct: 10, payers: { me: 11055 } }))
    const list = loaded(repo).data.entries
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ id: first.value.id, servicePct: 10, owed: { me: 5528, 'p-1': 5527 } })
  })

  it('refuses people who do not exist, writing nothing', () => {
    const { repo, state } = setup()
    const items = [{ id: 'i1', name: 'หมู', price: 10050, sharedBy: ['me', 'p-1', 'p-ghost'] }]
    expect(repo.saveBill(input({ items }))).toEqual({
      ok: false,
      reason: 'unknown-person',
      personIds: ['p-ghost'],
    })
    expect(repo.saveBill(input({ payers: { me: 10000, 'p-other': 50 } }))).toMatchObject({
      reason: 'unknown-person',
      personIds: ['p-other'],
    })
    expect(state.writes).toBe(0)
  })

  it('keeps a groupId it does not know when a bill is edited', () => {
    const { repo } = setup()
    const first = repo.saveBill(input({ groupId: 'gone' }))
    if (!first.ok) throw new Error(first.reason)
    repo.saveBill(input({ id: first.value.id, groupId: first.value.groupId, title: 'edited' }))
    expect(loaded(repo).data.entries).toMatchObject([{ title: 'edited', groupId: 'gone' }])
  })

  it('refuses a bill that finalizeBill refuses, writing nothing', () => {
    const { repo, state } = setup()
    expect(repo.saveBill(input({ payers: { me: 1 } }))).toEqual({
      ok: false,
      reason: 'invalid-bill',
      issues: [{ type: 'payer-mismatch', difference: 10049 }],
    })
    expect(state.writes).toBe(0)
  })

  it('refuses what loading would reject', () => {
    const { repo, state } = setup()
    expect(repo.saveBill(input({ date: '2026-02-30' }))).toEqual({
      ok: false,
      reason: 'invalid-data',
      problems: ['date'],
    })
    expect(state.writes).toBe(0)
  })

  it('will not replace a loan that has the same id', () => {
    const loan = { kind: 'loan', id: 'x', date: '2026-11-01', lenderId: 'me', borrowerId: 'p-1', amount: 1 }
    const { repo } = setup(
      JSON.stringify({ data: { people: [], groups: [], entries: [loan], settings: { schemaVersion: 1 } } }),
    )
    expect(repo.saveBill(input({ id: 'x' }))).toEqual({
      ok: false,
      reason: 'invalid-data',
      problems: ['duplicate-id'],
    })
    expect(loaded(repo).data.entries).toEqual([loan])
  })

  it('reports a full storage and leaves the old data alone', () => {
    const { repo, state, raw } = setup()
    repo.saveBill(input())
    const before = raw()
    state.failWrites = true
    expect(repo.saveBill(input({ title: 'second' }))).toEqual({ ok: false, reason: 'write-failed' })
    expect(raw()).toBe(before)
  })

  it('never saves a bill that loading would set aside', () => {
    fc.assert(
      fc.property(validBillDraft, (draft) => {
        const { repo } = setup(storeWith(...PEOPLE.filter((id) => id !== 'me')))
        const saved = repo.saveBill({ ...draft, title: 't', date: '2026-01-01' })
        expect(saved.ok).toBe(true)
        const result = loaded(repo)
        expect(result.quarantine).toEqual([])
        expect(result.data.entries).toEqual([saved.ok && saved.value])
        const owed = Object.values(computeBill(draft).people).map((p) => p.owed)
        expect(Object.values((saved.ok && saved.value.owed) || {})).toEqual(owed)
      }),
    )
  })
})

describe('delete and friends', () => {
  it('deletes only the entry asked for', () => {
    const { repo } = setup()
    const first = repo.saveBill(input())
    const second = repo.saveBill(input({ title: 'second' }))
    const third = repo.saveBill(input({ title: 'third' }))
    if (!first.ok || !second.ok || !third.ok) throw new Error('save failed')
    expect(repo.deleteEntry(second.value.id)).toMatchObject({ ok: true })
    expect(loaded(repo).data.entries).toEqual([first.value, third.value])
  })

  it('changes nothing when asked to delete an unknown id', () => {
    const { repo } = setup()
    const saved = repo.saveBill(input())
    if (!saved.ok) throw new Error(saved.reason)
    repo.deleteEntry('b-nope')
    expect(loaded(repo).data.entries).toEqual([saved.value])
  })

  it('gives a new bill its own kind of id, under the one storage key', () => {
    const { repo } = setup()
    const saved = repo.saveBill(input())
    expect(saved.ok && saved.value.id).toMatch(/^b-[0-9a-f]{24}$/)
    // Renaming the key would make every saved bill vanish.
    expect(STORAGE_KEY).toBe('owlet:data')
  })

  it('adds a friend with a trimmed name and an id that sorts after "me"', () => {
    const { repo } = setup()
    const added = repo.addPerson('  ต้น ')
    if (!added.ok) throw new Error(added.reason)
    expect(added.value).toMatchObject({ name: 'ต้น', isMe: false })
    expect(added.value.id > 'me').toBe(true)
    expect(loaded(repo).data.people.map((p) => p.name)).toEqual(['me', 'p-1', 'ต้น'])
  })

  it('refuses a blank name', () => {
    const { repo } = setup()
    expect(repo.addPerson('   ')).toMatchObject({ ok: false, reason: 'invalid-data' })
  })

  it('stores a colour slot chosen when the friend is added', () => {
    const fake = fakeStore()
    const repo = createRepository(fake.store, () => 0)
    for (let i = 0; i < 31; i += 1) repo.addPerson(`f${i}`)
    const slots = loaded(repo).data.people.filter((p) => !p.isMe).map((p) => p.colorSlot)
    expect(slots.slice(0, 30)).toEqual(Array.from({ length: 30 }, (_, i) => i))
    expect(slots[30]).toBe(0)
  })

  it('renames a friend, keeping the colour and clearing the request for a name', () => {
    const lost = { id: 'p-1', name: '(ไม่ทราบชื่อ)', isMe: false, needsName: true, colorSlot: 7 }
    const { repo } = setup(
      JSON.stringify({ data: { people: [lost], groups: [], entries: [], settings: { schemaVersion: 1 } } }),
    )
    expect(repo.renamePerson('p-1', '  ต้น ')).toMatchObject({ ok: true })
    expect(loaded(repo).data.people[1]).toStrictEqual({ id: 'p-1', name: 'ต้น', isMe: false, colorSlot: 7 })
  })

  it.each([
    ['a blank name', 'p-1', '  ', { reason: 'invalid-data', problems: ['shape'] }],
    ['my own record', 'me', 'ชื่อใหม่', { reason: 'invalid-data', problems: ['me'] }],
    ['someone who does not exist', 'p-nope', 'ต้น', { reason: 'unknown-person', personIds: ['p-nope'] }],
  ])('refuses to rename with %s', (_, id, name, failure) => {
    const { repo, state } = setup()
    expect(repo.renamePerson(id, name)).toEqual({ ok: false, ...failure })
    expect(state.writes).toBe(0)
  })

  it('makes me, not a friend, take the leftover satang', () => {
    const friend = newId('p')
    const { people } = computeBill(
      input({ items: [{ id: 'i', name: 'x', price: 101, sharedBy: [friend, 'me'] }] }),
    )
    expect(people.me!.owed).toBe(51)
    expect(people[friend]!.owed).toBe(50)
  })

  it('makes ids that do not repeat and always have the same shape', () => {
    const made = Array.from({ length: 1000 }, () => newId('b'))
    expect(new Set(made).size).toBe(1000)
    expect(made.filter((id) => !/^b-[0-9a-f]{24}$/.test(id))).toEqual([])
  })
})

describe('quarantined records', () => {
  const bad = { kind: 'bill', id: 'bad', title: 'ชาบู', date: 'nope', anything: [1, 2] }
  const stored = JSON.stringify({
    data: {
      people: [{ id: 'p-1', name: 'p-1', isMe: false }],
      groups: [],
      entries: [bad],
      settings: { schemaVersion: 1 },
    },
  })

  it('keep their raw data through later saves', () => {
    const { repo, raw } = setup(stored)
    repo.saveBill(input())
    repo.addPerson('มิว')
    repo.saveBill(input({ title: 'second' }))
    const result = loaded(repo)
    expect(result.data.entries).toHaveLength(2)
    expect(result.quarantine).toHaveLength(1)
    expect(result.quarantine[0]!.raw).toEqual(bad)
    expect(JSON.parse(raw()!).quarantine).toHaveLength(1)
  })

  it('stores a recreated person on the next save, once', () => {
    const loan = { kind: 'loan', id: 'l', date: '2026-11-01', lenderId: 'me', borrowerId: 'p-gone', amount: 5 }
    const { repo } = setup(
      JSON.stringify({
        data: { people: [{ id: 'p-1', name: 'p-1', isMe: false }], groups: [], entries: [loan], settings: { schemaVersion: 1 } },
      }),
    )
    expect(repo.saveBill(input())).toMatchObject({ ok: true })
    repo.saveBill(input({ title: 'second' }))
    const { data, quarantine } = loaded(repo)
    expect(data.people.filter((p) => p.id === 'p-gone')).toEqual([
      { id: 'p-gone', name: '(ไม่ทราบชื่อ)', isMe: false, needsName: true },
    ])
    expect(quarantine).toEqual([])
  })

  it('are not touched by just loading', () => {
    const { repo, raw } = setup(stored)
    repo.initialize()
    expect(raw()).toBe(stored)
  })
})

describe('a store that cannot be used', () => {
  const newer = JSON.stringify({ data: { settings: { schemaVersion: 99 } } })

  it.each([
    ['not JSON', '{oops', 'unreadable'],
    ['the wrong shape', '[1,2]', 'unreadable'],
    ['from a newer version', newer, 'newer-version'],
  ])('that is %s is never overwritten', (_, stored, status) => {
    const { repo, state, raw } = setup(stored)
    expect(repo.initialize()).toEqual({ status, raw: stored })
    for (const result of [repo.saveBill(input()), repo.addPerson('x'), repo.deleteEntry('x')]) {
      expect(result).toEqual({ ok: false, reason: 'store-unavailable' })
    }
    expect(state.writes).toBe(0)
    expect(raw()).toBe(stored)
    expect(repo.exportRaw()).toBe(stored)
  })

  it('that throws on reading is reported, not crashed on', () => {
    const { repo, state } = setup()
    state.failReads = true
    expect(repo.initialize()).toEqual({ status: 'unreadable', raw: '' })
    expect(repo.exportRaw()).toBe('')
  })

  it('has nothing to export before the first run', () => {
    expect(blank().repo.exportRaw()).toBe('')
  })

  it('can be reset', () => {
    const { repo, raw } = setup('{oops')
    repo.reset()
    expect(raw()).toBeUndefined()
    expect(repo.initialize()).toMatchObject({ status: 'ok', firstRun: true })
    expect(repo.exportRaw()).not.toBe('')
  })
})
