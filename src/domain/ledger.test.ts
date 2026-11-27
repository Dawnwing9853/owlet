import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  debtsByGroup,
  entryDebts,
  entryNets,
  groupDebts,
  myBalances,
  netBalances,
  netDebts,
  netsFromDebts,
  overallDebts,
  pairwiseDebts,
  simplifyDebts,
  type Debt,
} from './ledger'
import { entries, entry, groups } from './testing/arbitraries'
import type { Bill, Entry, Group, Loan, Repay } from './types'

const bill = (payers: Bill['payers'], owed: Bill['owed'], groupId?: string): Bill => ({
  kind: 'bill',
  id: 'bill',
  title: 'bill',
  date: '2026-11-01',
  groupId,
  items: [],
  payers,
  owed,
  servicePct: 0,
  vat: false,
  discount: 0,
})

const loan = (lenderId: string, borrowerId: string, amount: number, groupId?: string): Loan => ({
  kind: 'loan',
  id: `loan-${lenderId}-${borrowerId}-${amount}`,
  date: '2026-11-01',
  lenderId,
  borrowerId,
  amount,
  groupId,
})

const repay = (fromId: string, toId: string, amount: number, groupId?: string): Repay => ({
  kind: 'repay',
  id: `repay-${fromId}-${toId}-${amount}`,
  date: '2026-11-02',
  fromId,
  toId,
  amount,
  groupId,
})

const debt = (from: string, to: string, amount: number): Debt => ({ from, to, amount })

const group = (simplify: boolean): Group => ({
  id: 'trip',
  name: 'trip',
  memberIds: ['me', 'ton', 'mew'],
  createdAt: 0,
  simplify,
})

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

describe('one entry', () => {
  it('nets a bill as paid minus owed, leaving out people who are square', () => {
    const entry = bill({ a: 9000, b: 3000 }, { a: 3000, b: 3000, c: 6000 })
    expect(entryNets(entry)).toEqual({ a: 6000, c: -6000 })
    expect(entryDebts(entry)).toEqual([debt('c', 'a', 6000)])
  })

  it('splits a debtor across creditors in proportion to what they are owed', () => {
    const entry = bill({ a: 9000, b: 6000 }, { a: 3000, b: 3000, c: 9000 })
    expect(entryDebts(entry)).toEqual([debt('c', 'a', 6000), debt('c', 'b', 3000)])
  })

  it('does not leak satang when every split is a tie', () => {
    // Splitting c and d independently would send both satang to a.
    const entry = bill({ a: 1, b: 1 }, { c: 1, d: 1 })
    expect(entryDebts(entry)).toEqual([debt('c', 'a', 1), debt('d', 'b', 1)])
  })

  it('treats a loan as the borrower owing the lender', () => {
    expect(entryDebts(loan('me', 'ton', 500))).toEqual([debt('ton', 'me', 500)])
  })

  it('treats a repayment as reducing what the payer owes', () => {
    expect(entryDebts(repay('ton', 'me', 200))).toEqual([debt('me', 'ton', 200)])
    expect(pairwiseDebts([loan('me', 'ton', 500), repay('ton', 'me', 200)])).toEqual([debt('ton', 'me', 300)])
  })

  it('ignores a loan to yourself', () => {
    expect(entryNets(loan('me', 'me', 500))).toEqual({})
    expect(entryDebts(loan('me', 'me', 500))).toEqual([])
  })

  it('refuses a bill snapshot that does not balance', () => {
    expect(() => entryDebts(bill({ a: 100 }, { b: 99 }))).toThrow(RangeError)
  })
})

describe('netDebts', () => {
  it('nets opposite debts between a pair and drops settled pairs', () => {
    expect(netDebts([debt('b', 'a', 500), debt('a', 'b', 700), debt('c', 'a', 100), debt('a', 'c', 100)])).toEqual([
      debt('a', 'b', 200),
    ])
  })
})

describe('simplify', () => {
  // ต้น owes me ฿100 and I owe มิว ฿100.
  const trip = [loan('me', 'ton', 10000, 'trip'), loan('mew', 'me', 10000, 'trip')]

  it('turns a chain into one transfer', () => {
    expect(groupDebts(trip, group(true))).toEqual([debt('ton', 'mew', 10000)])
    expect(groupDebts(trip, group(false))).toEqual([debt('me', 'mew', 10000), debt('ton', 'me', 10000)])
  })

  it('home uses the same simplified debts as the group', () => {
    expect(overallDebts(trip, [group(true)])).toEqual([debt('ton', 'mew', 10000)])
    expect(myBalances(trip, [group(true)], 'me')).toEqual({ owedToMe: 0, iOwe: 0, people: [] })
  })

  it('settles both views after repaying along the simplified route', () => {
    const settled = [...trip, repay('ton', 'mew', 10000, 'trip')]
    expect(groupDebts(settled, group(true))).toEqual([])
    expect(overallDebts(settled, [group(true)])).toEqual([])
  })

  it('shows cancelling debts again if simplify is turned off afterwards (open question for P4)', () => {
    const settled = [...trip, repay('ton', 'mew', 10000, 'trip')]
    expect(netBalances(settled)).toEqual({})
    expect(overallDebts(settled, [group(false)])).toHaveLength(3)
  })

  it('only counts the group it is asked about', () => {
    expect(groupDebts([...trip, loan('me', 'ton', 999)], group(false))).toEqual(groupDebts(trip, group(false)))
  })

  it('never simplifies entries without a group, or across groups', () => {
    const loose = [loan('me', 'ton', 10000), loan('mew', 'me', 10000)]
    expect(overallDebts(loose, [group(true)])).toHaveLength(2)
    const split = [loan('me', 'ton', 10000, 'trip'), loan('mew', 'me', 10000)]
    expect(overallDebts(split, [group(true)])).toHaveLength(2)
  })

  it('leaves a group it does not know unsimplified', () => {
    expect(overallDebts(trip, [])).toHaveLength(2)
  })
})

describe('debtsByGroup', () => {
  it('lists groups in id order with ungrouped entries last', () => {
    const list = [loan('me', 'ton', 1), loan('me', 'ton', 2, 'b'), loan('me', 'ton', 3, 'a'), loan('me', 'ton', 4)]
    expect(debtsByGroup(list, []).map((g) => g.groupId)).toEqual(['a', 'b', null])
  })
})

describe('myBalances', () => {
  it('totals each person across groups and keeps the per-group breakdown', () => {
    const list = [
      loan('me', 'ton', 20000, 'trip'),
      loan('me', 'ton', 10000),
      loan('mew', 'me', 4000),
      loan('ton', 'mew', 777), // not about me
    ]
    expect(myBalances(list, [], 'me')).toEqual({
      owedToMe: 30000,
      iOwe: 4000,
      people: [
        { personId: 'mew', net: -4000, byGroup: [{ groupId: null, net: -4000 }] },
        {
          personId: 'ton',
          net: 30000,
          byGroup: [
            { groupId: 'trip', net: 20000 },
            { groupId: null, net: 10000 },
          ],
        },
      ],
    })
  })

  it('keeps a person who nets to zero overall but not within each group', () => {
    const result = myBalances([loan('me', 'ton', 500, 'trip'), loan('ton', 'me', 500)], [], 'me')
    expect(result).toMatchObject({ owedToMe: 0, iOwe: 0 })
    expect(result.people).toEqual([
      {
        personId: 'ton',
        net: 0,
        byGroup: [
          { groupId: 'trip', net: 500 },
          { groupId: null, net: -500 },
        ],
      },
    ])
  })
})

describe('ledger properties', () => {
  const add = (a: Record<string, number>, b: Record<string, number>) => {
    const out = { ...a }
    for (const [id, value] of Object.entries(b)) out[id] = (out[id] ?? 0) + value
    return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== 0))
  }

  it('Σ net is 0 for every entry and overall', () => {
    fc.assert(
      fc.property(entries, (list) => {
        for (const e of list) expect(sum(Object.values(entryNets(e)))).toBe(0)
        expect(sum(Object.values(netBalances(list)))).toBe(0)
      }),
    )
  })

  it("every entry's debts reproduce its nets exactly", () => {
    fc.assert(
      fc.property(entry, (e) => {
        expect(netsFromDebts(entryDebts(e))).toEqual(entryNets(e))
        for (const d of entryDebts(e)) expect(Number.isSafeInteger(d.amount) && d.amount > 0).toBe(true)
      }),
    )
  })

  it('pairwise and overall debts reproduce everyone’s net', () => {
    fc.assert(
      fc.property(entries, groups, (list, groupList) => {
        expect(netsFromDebts(pairwiseDebts(list))).toEqual(netBalances(list))
        expect(netsFromDebts(overallDebts(list, groupList))).toEqual(netBalances(list))
      }),
    )
  })

  it('netted debts list each pair once', () => {
    fc.assert(
      fc.property(entries, (list) => {
        const debts = pairwiseDebts(list)
        const pairs = debts.map((d) => JSON.stringify([d.from, d.to].sort()))
        expect(new Set(pairs).size).toBe(debts.length)
        expect(debts.every((d) => d.amount > 0 && d.from !== d.to)).toBe(true)
      }),
    )
  })

  it('simplify keeps every net, uses at most n−1 transfers, and nobody both pays and receives', () => {
    fc.assert(
      fc.property(entries, (list) => {
        const before = pairwiseDebts(list)
        const after = simplifyDebts(before)
        expect(netsFromDebts(after)).toEqual(netsFromDebts(before))
        const people = Object.keys(netsFromDebts(before)).length
        expect(after.length).toBeLessThanOrEqual(Math.max(people - 1, 0))
        const payers = new Set(after.map((d) => d.from))
        expect(after.some((d) => payers.has(d.to))).toBe(false)
      }),
    )
  })

  it('home is the sum of the group views', () => {
    fc.assert(
      fc.property(entries, groups, (list, groupList) => {
        const views = [
          ...groupList.flatMap((g) => groupDebts(list, g)),
          ...pairwiseDebts(list.filter((e) => e.groupId === undefined)),
        ]
        expect(overallDebts(list, groupList)).toEqual(netDebts(views))
      }),
    )
  })

  it('home totals match the overall debts', () => {
    fc.assert(
      fc.property(entries, groups, (list, groupList) => {
        const debts = overallDebts(list, groupList)
        const { owedToMe, iOwe, people } = myBalances(list, groupList, 'me')
        expect(owedToMe).toBe(sum(debts.filter((d) => d.to === 'me').map((d) => d.amount)))
        expect(iOwe).toBe(sum(debts.filter((d) => d.from === 'me').map((d) => d.amount)))
        for (const p of people) expect(sum(p.byGroup.map((g) => g.net))).toBe(p.net)
      }),
    )
  })

  it('deleting an entry fully reverts its effect', () => {
    fc.assert(
      fc.property(entries, entry, groups, (list, extra, groupList) => {
        const added: Entry = { ...extra, id: 'extra' }
        const withExtra = [...list, added]
        expect(netBalances(withExtra)).toEqual(add(netBalances(list), entryNets(added)))
        const deleted = withExtra.filter((e) => e.id !== 'extra')
        expect(overallDebts(deleted, groupList)).toEqual(overallDebts(list, groupList))
        expect(myBalances(deleted, groupList, 'me')).toEqual(myBalances(list, groupList, 'me'))
      }),
    )
  })

  it('does not depend on the order of entries', () => {
    const shuffled = entries.chain((list) =>
      fc.tuple(fc.constant(list), fc.shuffledSubarray(list, { minLength: list.length })),
    )
    fc.assert(
      fc.property(shuffled, groups, ([list, other], groupList) => {
        expect(overallDebts(other, groupList)).toEqual(overallDebts(list, groupList))
      }),
    )
  })
})
