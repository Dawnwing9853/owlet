import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { monthSummary } from './summary'
import { entries } from './testing/arbitraries'
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
    expect(monthSummary(list, 'me', '2026-11')).toEqual({
      month: '2026-11',
      totals: { myShare: 8025, cashOut: 12050, lent: 2000, repaidToMe: 1500 },
      byGroup: [
        { groupId: 'trip', myShare: 5025, cashOut: 12050, lent: 2000, repaidToMe: 0 },
        { groupId: null, myShare: 3000, cashOut: 0, lent: 0, repaidToMe: 1500 },
      ],
    })
  })

  it('leaves out groups with nothing of mine', () => {
    const others = [bill('2026-11-05', { ton: 100 }, { mew: 100 }, 'other'), loan('2026-11-05', 'me', 'me', 50)]
    expect(monthSummary(others, 'me', '2026-11')).toEqual({ month: '2026-11', totals: ZERO, byGroup: [] })
  })

  it.each(['2026-13', '2026-00', '2026-1', '2026', '2026-11-01', ''])('refuses the month %j', (month) => {
    expect(() => monthSummary([], 'me', month)).toThrow(RangeError)
  })

  it('groups always add up to the totals', () => {
    fc.assert(
      fc.property(entries, (generated) => {
        const { totals, byGroup } = monthSummary(generated, 'me', '2026-01')
        for (const key of Object.keys(ZERO) as (keyof typeof ZERO)[]) {
          expect(byGroup.reduce((a, g) => a + g[key], 0)).toBe(totals[key])
        }
      }),
    )
  })
})
