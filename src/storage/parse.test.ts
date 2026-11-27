import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  entryPersonIds,
  groupDebts,
  myBalances,
  netBalances,
  overallDebts,
  pairwiseDebts,
} from '../domain/ledger'
import { monthSummary } from '../domain/summary'
import { MONTHS, PEOPLE, entries, groups } from '../domain/testing/arbitraries'
import { describeQuarantined, quarantineNotice } from './messages'
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
  for (const month of MONTHS) monthSummary(data.entries, data.groups, 'me', month)
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
    const friend = { id: 'p1', name: 'p1', isMe: false }
    const result = ok(parseStore(store([goodBill], { people: [damaged, friend] })))
    expect(result.data.people).toEqual([{ id: 'me', name: 'เรา', isMe: true }, friend])
    expect(result.data.entries).toEqual([goodBill])
    expect(result.quarantine).toHaveLength(1)
  })

  it('never quarantines a person over a decorative field', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (colorSlot, needsName) => {
        const friend = { id: 'p1', name: 'ต้น', isMe: false, colorSlot, needsName }
        const result = ok(parseStore(store([], { people: [people[0], friend] })))
        expect(result.quarantine).toEqual([])
        const kept = result.data.people[1]!
        expect(kept.name).toBe('ต้น')
        const validSlot = Number.isInteger(colorSlot) && Number(colorSlot) >= 0 && Number(colorSlot) < 30
        expect(kept.colorSlot).toBe(typeof colorSlot === 'number' && validSlot ? colorSlot : undefined)
        expect(kept.needsName).toBe(typeof needsName === 'boolean' ? needsName : undefined)
      }),
      { numRuns: 300 },
    )
  })

  it.each([0, 14, 15, 29])('keeps the valid colour slot %i', (colorSlot) => {
    const friend = { id: 'p1', name: 'ต้น', isMe: false, colorSlot }
    expect(ok(parseStore(store([], { people: [people[0], friend] }))).data.people[1]).toEqual(friend)
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

  it.each([[null], [7], ['junk'], [{ collection: 'people', note: 'no raw field' }]])(
    'keeps the whole of a quarantine item without a raw value: %j',
    (item) => {
      const [kept] = ok(parseStore({ ...store([]), quarantine: [item] })).quarantine
      expect(kept).toEqual({ collection: 'entries', raw: item, problems: ['shape'] })
    },
  )

  it('keeps a valid PromptPay ID in the settings', () => {
    const settings = { schemaVersion: SCHEMA_VERSION, myPromptPayId: '0801234567', lastBackupAt: 5 }
    const result = ok(parseStore(store([], { settings })))
    expect(result.data.settings).toEqual(settings)
    expect(result.quarantine).toEqual([])
  })

  // These strings are what the owner reads on the banner.
  it.each([
    ['entries', { kind: 'bill', title: 'ชาบู', date: 'd' }, ['unbalanced'], 'บิล “ชาบู” d: ยอดคนจ่ายกับยอดที่หารไม่เท่ากัน'],
    ['entries', { kind: 'loan' }, ['date', 'amount'], 'รายการยืม: วันที่ไม่ถูกต้อง, จำนวนเงินไม่ถูกต้อง'],
    ['entries', { kind: 'repay' }, ['duplicate-id'], 'รายการคืนเงิน: ซ้ำกับรายการอื่น'],
    ['entries', { kind: 'other', title: 5, name: 'ชื่อ' }, ['shape'], 'รายการ “ชื่อ”: ข้อมูลไม่ครบหรือผิดรูปแบบ'],
    ['entries', { title: '', date: 7 }, ['shape'], 'รายการ: ข้อมูลไม่ครบหรือผิดรูปแบบ'],
    ['people', { name: 'ต้น' }, ['me'], 'เพื่อน “ต้น”: ข้อมูลของเราไม่ถูกต้อง'],
    ['groups', 'not an object', ['shape'], 'กลุ่ม: ข้อมูลไม่ครบหรือผิดรูปแบบ'],
  ] as const)('describes a %s record %j', (collection, raw, problems, text) => {
    expect(describeQuarantined({ collection, raw, problems: [...problems] })).toBe(text)
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

describe('references to people and groups that are missing', () => {
  const me = { id: 'me', name: 'เรา', isMe: true }
  const toGhost = { kind: 'loan', id: 'l', date: '2026-11-27', lenderId: 'me', borrowerId: 'ghost', amount: 570 }
  const unknown = (id: string) => ({ id, name: '(ไม่ทราบชื่อ)', isMe: false, needsName: true })

  it('recreates a missing person under the same id and keeps the money', () => {
    const result = ok(parseStore(store([toGhost], { people: [me] })))
    expect(result.data.people).toEqual([me, unknown('ghost')])
    expect(result.data.entries).toEqual([toGhost])
    expect(result.quarantine).toEqual([])
    expect(netBalances(result.data.entries)).toEqual({ ghost: -570, me: 570 })
  })

  it('finds missing people in every place a bill or a group can name them', () => {
    const bill = {
      ...goodBill,
      items: [{ id: 'i1', name: 'x', price: 100, sharedBy: ['in-items'] }],
      payers: { 'in-payers': 100 },
      owed: { 'in-owed': 100 },
    }
    const back = { kind: 'repay', id: 'r', date: '2026-11-27', fromId: 'from', toId: 'to', amount: 1 }
    const group = { id: 'g', name: 'g', memberIds: ['member'], createdAt: 0 }
    const result = ok(parseStore(store([bill, back], { people: [me], groups: [group] })))
    expect(result.data.people.slice(1)).toEqual(
      ['from', 'in-items', 'in-owed', 'in-payers', 'member', 'to'].map(unknown),
    )
  })

  it('reuses the name from a quarantined record of that person', () => {
    const damaged = { id: 'ghost', name: '  ต้น  ' } // no isMe, so it is quarantined
    const result = ok(parseStore(store([toGhost], { people: [me, damaged] })))
    expect(result.data.people).toEqual([me, { id: 'ghost', name: 'ต้น', isMe: false }])
    expect(result.quarantine).toEqual([{ collection: 'people', raw: damaged, problems: ['shape'] }])
  })

  it('reuses a name quarantined by an earlier load', () => {
    const earlier = { collection: 'people', raw: { id: 'ghost', name: 'มิว' }, problems: ['shape'] }
    const result = ok(parseStore({ ...store([toGhost], { people: [me] }), quarantine: [earlier] }))
    expect(result.data.people[1]).toEqual({ id: 'ghost', name: 'มิว', isMe: false })
  })

  it.each([
    [{ id: 'ghost' }],
    [{ id: 'ghost', name: '   ' }],
    [{ id: 'ghost', name: 5 }],
    [{ id: 'someone else', name: 'ต้น' }],
  ])('asks for a name when the quarantined record %j has no usable one', (damaged) => {
    const result = ok(parseStore(store([toGhost], { people: [me, damaged] })))
    expect(result.data.people[1]).toEqual(unknown('ghost'))
  })

  it('takes a name only from a quarantined person, never from another kind of record', () => {
    // A damaged group and a damaged entry that happen to share the id.
    const group = { id: 'ghost', name: 'ทริป' }
    const entry = { id: 'ghost', name: 'ไม่ใช่คน', kind: 'loan' }
    const result = ok(parseStore(store([toGhost, entry], { people: [me], groups: [group] })))
    expect(result.quarantine).toHaveLength(2)
    expect(result.data.people[1]).toEqual(unknown('ghost'))
  })

  it('copes with a quarantined person that is not even an object', () => {
    const earlier = [
      { collection: 'people', raw: null, problems: ['shape'] },
      { collection: 'people', raw: 'ghost', problems: ['shape'] },
    ]
    const result = ok(parseStore({ ...store([toGhost], { people: [me] }), quarantine: earlier }))
    expect(result.data.people[1]).toEqual(unknown('ghost'))
  })

  it('keeps an unknown groupId exactly as stored', () => {
    const lost = { ...toGhost, groupId: 'gone' }
    const result = ok(parseStore(store([lost], { people: [me] })))
    expect(result.data.entries).toEqual([lost])
    expect(result.data.groups).toEqual([])
  })

  it('does not invent people for entries that are quarantined', () => {
    const broken = { ...toGhost, date: 'nope' }
    expect(ok(parseStore(store([broken], { people: [me] }))).data.people).toEqual([me])
  })

  it('gives every id the ledger can return a person record, and loses no money', () => {
    const damaged = fc.record({
      list: entries,
      groupList: groups,
      keep: fc.array(fc.constantFrom('good', 'missing', 'broken', 'broken-with-name'), {
        minLength: PEOPLE.length,
        maxLength: PEOPLE.length,
      }),
      dropGroups: fc.boolean(),
    })
    fc.assert(
      fc.property(damaged, ({ list, groupList, keep, dropGroups }) => {
        const storedPeople = people.flatMap((person, i): unknown[] => {
          if (keep[i] === 'missing') return []
          if (keep[i] === 'broken') return [{ id: person.id }]
          if (keep[i] === 'broken-with-name') return [{ id: person.id, name: person.name }]
          return [person]
        })
        const stored = JSON.parse(
          JSON.stringify(store(list, { people: storedPeople, groups: dropGroups ? [] : groupList })),
        ) as unknown
        const { data } = ok(parseStore(stored))
        const ids = new Set(data.people.map((p) => p.id))

        const returned = [
          ...Object.keys(netBalances(data.entries)),
          ...[...overallDebts(data.entries, data.groups), ...pairwiseDebts(data.entries)].flatMap((d) => [d.from, d.to]),
          ...data.groups.flatMap((g) => groupDebts(data.entries, g).flatMap((d) => [d.from, d.to])),
          ...myBalances(data.entries, data.groups, 'me').people.map((p) => p.personId),
          ...data.entries.flatMap(entryPersonIds),
          ...data.groups.flatMap((g) => g.memberIds),
        ]
        expect(returned.filter((id) => !ids.has(id))).toEqual([])
        expect(ids.size).toBe(data.people.length)
        expect(netBalances(data.entries)).toEqual(netBalances(list))
      }),
      { numRuns: 300 },
    )
  })
})

describe('the banner for unreadable records', () => {
  it('is not shown when everything loaded', () => {
    expect(quarantineNotice([])).toBeNull()
  })

  it('counts every quarantined record and describes each one', () => {
    const bad = { ...goodBill, id: 'bad', title: 'ชาบู', date: 'x' }
    const result = ok(parseStore(store([bad, goodBill], { groups: [{ id: 'g' }] })))
    expect(result.quarantine).toHaveLength(2)
    expect(quarantineNotice(result.quarantine)).toEqual({
      message: 'มี 2 รายการที่อ่านไม่ได้ ยอดอาจไม่ครบ',
      details: result.quarantine.map(describeQuarantined),
    })
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
    { data: { people: [], groups: [], entries: [], settings: { schemaVersion: 1.5 } } },
    { data: { people: [], groups: [], entries: [], settings: { schemaVersion: '1' } } },
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
    expect(emptyData()).toEqual({
      people: [{ id: 'me', name: 'เรา', isMe: true }],
      groups: [],
      entries: [],
      settings: { schemaVersion: SCHEMA_VERSION },
    })
  })
})
