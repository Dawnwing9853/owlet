import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { netBalances, overallDebts } from '../domain/ledger'
import { monthSummary } from '../domain/summary'
import { MONTHS, PEOPLE, entries, groups } from '../domain/testing/arbitraries'
import { describeQuarantined } from './messages'
import { migrate } from './migrations'
import { emptyData, parseStore, type AppData, type ParseResult } from './parse'
import { SCHEMA_VERSION } from './schema'

const people = PEOPLE.map((id) => ({ id, name: id, isMe: id === 'me' }))

const goodBill = {
  kind: 'bill',
  id: 'good',
  title: 'หมูกระทะ',
  date: '2026-11-27',
  items: [{ id: 'i1', name: 'หมู', price: 10000, sharedBy: ['me', 'p1'] }],
  payers: { me: 10000 },
  servicePct: 0,
  vat: false,
  discount: 0,
  owed: { me: 5000, p1: 5000 },
}

const store = (bills: unknown[], over: Record<string, unknown> = {}) => ({
  data: { people, groups: [], entries: bills, settings: { schemaVersion: SCHEMA_VERSION }, ...over },
})

function ok(result: ParseResult) {
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
  return result
}

/** Everything the screens derive from loaded data must not throw. */
function deriveEverything(data: AppData) {
  netBalances(data.entries)
  overallDebts(data.entries, data.groups)
  for (const month of MONTHS) monthSummary(data.entries, 'me', month)
}

describe('a corrupted bill', () => {
  it.each([
    ['payers and owed differ', { payers: { me: 9999 } }, 'unbalanced', 'ยอดคนจ่ายกับยอดที่หารไม่เท่ากัน'],
    ['an impossible date', { date: '2026-02-30' }, 'date', 'วันที่ไม่ถูกต้อง'],
    ['a wrongly formatted date', { date: '27/11/2026' }, 'date', 'วันที่ไม่ถูกต้อง'],
    ['a negative amount', { owed: { me: -5000, p1: 15000 } }, 'amount', 'จำนวนเงินไม่ถูกต้อง'],
    ['a fraction of a satang', { owed: { me: 5000.5, p1: 4999.5 } }, 'amount', 'จำนวนเงินไม่ถูกต้อง'],
    ['an amount over the limit', { discount: 1e12 }, 'amount', 'จำนวนเงินไม่ถูกต้อง'],
    ['money stored as text', { payers: { me: '100' } }, 'shape', 'ข้อมูลไม่ครบหรือผิดรูปแบบ'],
    ['a missing field', { owed: undefined }, 'shape', 'ข้อมูลไม่ครบหรือผิดรูปแบบ'],
  ])('with %s is set aside with a Thai message, and the rest loads', (_, broken, problem, message) => {
    const bad = { ...goodBill, id: 'bad', title: 'ชาบู', ...broken }
    const result = ok(parseStore(store([bad, goodBill])))
    expect(result.data.entries).toEqual([goodBill])
    expect(result.quarantine).toEqual([{ collection: 'entries', raw: bad, problems: [problem] }])
    expect(describeQuarantined(result.quarantine[0]!)).toContain('บิล “ชาบู”')
    expect(describeQuarantined(result.quarantine[0]!)).toContain(message)
    expect(() => deriveEverything(result.data)).not.toThrow()
  })

  it('that repeats an id is set aside, keeping the first', () => {
    const copy = { ...goodBill, title: 'copy' }
    const result = ok(parseStore(store([goodBill, copy])))
    expect(result.data.entries).toEqual([goodBill])
    expect(result.quarantine).toEqual([{ collection: 'entries', raw: copy, problems: ['duplicate-id'] }])
  })

  it('does not have its owed amounts recalculated', () => {
    // 6000/4000 is not an equal split, but it balances, so it is history.
    const historic = { ...goodBill, owed: { me: 6000, p1: 4000 } }
    expect(ok(parseStore(store([historic]))).data.entries).toEqual([historic])
  })
})

describe('other damaged records', () => {
  it('sets aside a bad loan, person and group but loads the rest', () => {
    const loan = { kind: 'loan', id: 'l', date: 'x', lenderId: 'me', borrowerId: 'p1', amount: 1 }
    const result = ok(
      parseStore(store([loan, goodBill], { people: [...people, { id: 'p9' }], groups: [{ id: 'g' }] })),
    )
    expect(result.data.entries).toEqual([goodBill])
    expect(result.data.people).toEqual(people)
    expect(result.data.groups).toEqual([])
    expect(result.quarantine.map((q) => q.collection).sort()).toEqual(['entries', 'groups', 'people'])
    expect(result.quarantine.map(describeQuarantined).join('\n')).toContain('รายการยืม x: วันที่ไม่ถูกต้อง')
  })

  it('recreates my record under the same id if it is damaged', () => {
    const damaged = { id: 'me', name: '', isMe: true }
    const result = ok(parseStore(store([goodBill], { people: [damaged] })))
    expect(result.data.people).toEqual([{ id: 'me', name: 'เรา', isMe: true }])
    expect(result.data.entries).toEqual([goodBill])
    expect(result.quarantine).toHaveLength(1)
  })

  it('does not let anyone else claim to be me', () => {
    const impostor = { id: 'p1', name: 'x', isMe: true }
    const result = ok(parseStore(store([], { people: [people[0], impostor] })))
    expect(result.data.people).toEqual([people[0]])
    expect(result.quarantine[0]!.problems).toEqual(['me'])
  })

  it('falls back to default settings when the PromptPay ID is invalid', () => {
    const settings = { schemaVersion: SCHEMA_VERSION, myPromptPayId: '123' }
    const result = ok(parseStore(store([], { settings })))
    expect(result.data.settings).toEqual({ schemaVersion: SCHEMA_VERSION })
    expect(result.quarantine).toEqual([{ collection: 'settings', raw: settings, problems: ['shape'] }])
    expect(describeQuarantined(result.quarantine[0]!)).toBe('การตั้งค่า: ข้อมูลไม่ครบหรือผิดรูปแบบ')
  })

  it.each([
    [{ collection: 'nowhere', raw: 1, problems: [] }, 'entries', ['shape']],
    [{ collection: 'people', raw: 1, problems: 'x' }, 'people', []],
    [{ collection: 'people', raw: 1, problems: ['nonsense', 'me'] }, 'people', ['me']],
  ])('reads a damaged quarantine item %j without losing it', (item, collection, problems) => {
    const [kept] = ok(parseStore({ ...store([]), quarantine: [item] })).quarantine
    expect(kept).toMatchObject({ collection, problems })
    expect(kept!.raw).toEqual(item.collection === 'nowhere' ? item : 1)
  })

  it('can still describe a record with nothing readable in it', () => {
    expect(describeQuarantined({ collection: 'entries', raw: null, problems: [] })).toBe(
      'รายการ: ข้อมูลไม่ครบหรือผิดรูปแบบ',
    )
    expect(describeQuarantined({ collection: 'people', raw: { name: '' }, problems: ['me'] })).toBe(
      'เพื่อน: ข้อมูลของเราไม่ถูกต้อง',
    )
  })

  it('carries earlier quarantined records forward, even odd ones', () => {
    const earlier = { collection: 'entries', raw: { x: 1 }, problems: ['date'] }
    const result = ok(parseStore({ ...store([]), quarantine: [earlier, 'junk'] }))
    expect(result.quarantine).toEqual([earlier, { collection: 'entries', raw: 'junk', problems: ['shape'] }])
  })
})

describe('a store that cannot be understood', () => {
  it.each([
    null,
    42,
    'text',
    [],
    {},
    { data: [] },
    { data: { people: [], groups: [], entries: [] } },
    { data: { people: [], groups: [], entries: [], settings: {} } },
    { data: { people: [], groups: [], entries: [], settings: { schemaVersion: 0 } } },
    { data: { people: {}, groups: [], entries: [], settings: { schemaVersion: 1 } } },
    { ...store([]), quarantine: {} },
  ])('is unreadable: %j', (value) => {
    expect(parseStore(value)).toEqual({ status: 'unreadable' })
  })

  it('from a newer app version is refused', () => {
    const settings = { schemaVersion: SCHEMA_VERSION + 1 }
    expect(parseStore(store([], { settings }))).toEqual({ status: 'newer-version' })
  })
})

describe('migrations', () => {
  const addNote = {
    from: 1,
    migrate: (data: Record<string, unknown>) => ({
      ...data,
      entries: (data.entries as object[]).map((e) => ({ ...e, note: 'v2' })),
    }),
  }

  it('runs on older data before it is checked', () => {
    const result = ok(parseStore(store([goodBill]), 2, [addNote]))
    expect(result.data.entries).toEqual([{ ...goodBill, note: 'v2' }])
    expect(result.data.settings.schemaVersion).toBe(2)
  })

  it('treats a missing or failing step as unreadable', () => {
    expect(parseStore(store([goodBill]), 2, [])).toEqual({ status: 'unreadable' })
    expect(parseStore(store([goodBill], { entries: 5 }), 2, [addNote])).toEqual({ status: 'unreadable' })
  })

  it('applies steps in version order', () => {
    const step = (from: number) => ({
      from,
      migrate: (data: Record<string, unknown>) => ({ trail: [...((data.trail as number[]) ?? []), from] }),
    })
    expect(migrate({}, 1, 4, [step(3), step(1), step(2)])).toEqual({ trail: [1, 2, 3] })
  })
})

describe('parse properties', () => {
  const validStore = fc.tuple(entries, groups).map(([list, groupList]) =>
    // Through JSON, exactly as it would be stored.
    JSON.parse(JSON.stringify(store(list, { groups: groupList }))) as ReturnType<typeof store>,
  )

  it('loads everything the app can create, with nothing set aside', () => {
    fc.assert(
      fc.property(validStore, (stored) => {
        const result = ok(parseStore(stored))
        expect(result.quarantine).toEqual([])
        expect(result.data).toEqual(stored.data)
      }),
    )
  })

  it('never throws on arbitrary JSON', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        parseStore(value)
        parseStore({ data: value })
      }),
      { numRuns: 500 },
    )
  })

  it('survives any single damaged field, and what loads is safe to use', () => {
    const damage = fc.tuple(
      validStore,
      fc.nat(),
      fc.constantFrom('kind', 'id', 'date', 'payers', 'owed', 'amount', 'items', 'lenderId', 'groupId'),
      fc.oneof(fc.jsonValue(), fc.constant({ me: 1 }), fc.integer()),
    )
    fc.assert(
      fc.property(damage, ([stored, pick, field, junk]) => {
        const list = stored.data.entries as Record<string, unknown>[]
        fc.pre(list.length > 0)
        list[pick % list.length]![field] = junk
        const result = ok(parseStore(stored))
        expect(result.data.entries.length + result.quarantine.length).toBe(list.length)
        expect(() => deriveEverything(result.data)).not.toThrow()
      }),
      { numRuns: 500 },
    )
  })

  it('starts empty with only me', () => {
    expect(emptyData().people).toEqual([{ id: 'me', name: 'เรา', isMe: true }])
  })
})
