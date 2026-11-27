import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { monthSummary } from './summary'
import { MONTHS, entries } from './testing/arbitraries'
import type { Bill, Entry, Loan, Repay } from './types'

const bill = (date: string, payers: Bill['payers'], owed: Bill['owed'], groupId?: string): Bill => ({
  kind: 'bill',
  id: `bill-${date}`,
  title: 'bill',
  date,
  groupId,
  items: [],
  payers,
  owed,
  servicePct: 0,
  vat: false,
  discount: 0,
})

const loan = (date: string, lenderId: string, borrowerId: string, amount: number, groupId?: string): Loan => ({
  kind: 'loan',
  id: `loan-${date}-${amount}`,
  date,
  lenderId,
  borrowerId,
  amount,
  groupId,
})

const repay = (date: string, fromId: string, toId: string, amount: number, groupId?: string): Repay => ({
  kind: 'repay',
  id: `repay-${date}-${amount}`,
  date,
  fromId,
  toId,
  amount,
  groupId,
})

const GROUPS = ['trip', 'other', 'g1', 'g2'].map((id) => ({ id, name: id, memberIds: [], createdAt: 0 }))

const ZERO = { myShare: 0, cashOut: 0, lent: 0, repaidToMe: 0 }

describe('monthSummary', () => {
  const list: Entry[] = [
    // ฿100.50 split in two, paid by me: cash out is exactly what I paid.
    bill('2026-11-01', { me: 10050 }, { me: 5025, ton: 5025 }, 'trip'),
    bill('2026-11-30', { ton: 8000 }, { me: 3000, ton: 5000 }),
    loan('2026-11-15', 'me', 'ton', 2000, 'trip'),
    loan('2026-11-16', 'ton', 'me', 999), // borrowing is not my cash out
    repay('2026-11-20', 'ton', 'me', 1500),
    repay('2026-11-21', 'me', 'ton', 700), // paying back is not listed
    bill('2026-10-31', { me: 100 }, { me: 100 }),
    loan('2026-12-01', 'me', 'ton', 100),
  ]

  it('totals the month and breaks it down by group, ungrouped last', () => {
    expect(monthSummary(list, GROUPS, 'me', '2026-11')).toEqual({
      month: '2026-11',
      totals: { myShare: 8025, cashOut: 12050, lent: 2000, repaidToMe: 1500 },
      byGroup: [
        { groupId: 'trip', myShare: 5025, cashOut: 12050, lent: 2000, repaidToMe: 0 },
        { groupId: null, myShare: 3000, cashOut: 0, lent: 0, repaidToMe: 1500 },
      ],
    })
  })

  it('leaves out groups with nothing of mine', () => {
    const others = [
      bill('2026-11-05', { ton: 100 }, { mew: 100 }, 'other'),
      loan('2026-11-05', 'me', 'me', 50),
      repay('2026-11-05', 'me', 'me', 60),
    ]
    expect(monthSummary(others, GROUPS, 'me', '2026-11')).toEqual({ month: '2026-11', totals: ZERO, byGroup: [] })
  })

  it('counts a group that does not exist as no group', () => {
    const orphan = [loan('2026-11-05', 'me', 'ton', 300, 'gone'), loan('2026-11-06', 'me', 'ton', 200)]
    expect(monthSummary(orphan, GROUPS, 'me', '2026-11').byGroup).toEqual([
      { groupId: null, myShare: 0, cashOut: 500, lent: 500, repaidToMe: 0 },
    ])
  })

  it.each(['2026-13', '2026-00', '2026-1', '2026', '2026-11-01', '12026-11', ''])('refuses the month %j', (month) => {
    expect(() => monthSummary([], GROUPS, 'me', month)).toThrow(RangeError)
  })

})

describe('monthSummary properties', () => {
  const month = fc.constantFrom(...MONTHS)
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

  /** Recomputed straight from the definitions in the spec, one filter per figure. */
  function naive(list: Entry[], monthKey: string) {
    const inMonth = list.filter((e) => e.date.slice(0, 7) === monthKey)
    const bills = inMonth.filter((e) => e.kind === 'bill')
    const lent = sum(
      inMonth
        .filter((e) => e.kind === 'loan')
        .filter((e) => e.lenderId === 'me' && e.borrowerId !== 'me')
        .map((e) => e.amount),
    )
    return {
      myShare: sum(bills.map((b) => b.owed.me ?? 0)),
      cashOut: sum(bills.map((b) => b.payers.me ?? 0)) + lent,
      lent,
      repaidToMe: sum(
        inMonth
          .filter((e) => e.kind === 'repay')
          .filter((e) => e.toId === 'me' && e.fromId !== 'me')
          .map((e) => e.amount),
      ),
    }
  }

  it('totals match a naive recomputation, in every month', () => {
    fc.assert(
      fc.property(entries, (list) => {
        for (const m of MONTHS) {
          expect(monthSummary(list, GROUPS, 'me', m).totals).toEqual(naive(list, m))
        }
      }),
    )
  })

  it('groups add up to the totals, in every month', () => {
    fc.assert(
      fc.property(entries, (list) => {
        for (const m of MONTHS) {
          const { totals, byGroup } = monthSummary(list, GROUPS, 'me', m)
          for (const key of Object.keys(ZERO) as (keyof typeof ZERO)[]) {
            expect(sum(byGroup.map((g) => g[key]))).toBe(totals[key])
          }
        }
      }),
    )
  })

  it('entries outside the month never change the result', () => {
    // The same month last year and next year, and months no list uses.
    const otherPrefix = fc.constantFrom('2025', '2027')
    fc.assert(
      fc.property(entries, entries, month, otherPrefix, (list, others, m, year) => {
        const outside = others.flatMap((e): Entry[] => [
          { ...e, id: `y-${e.id}`, date: `${year}${e.date.slice(4)}` },
          { ...e, id: `m-${e.id}`, date: `2026-11${e.date.slice(7)}` },
          ...(e.date.startsWith(m) ? [] : [{ ...e, id: `o-${e.id}` }]),
        ])
        expect(monthSummary([...outside, ...list], GROUPS, 'me', m)).toEqual(monthSummary(list, GROUPS, 'me', m))
      }),
    )
  })
})
