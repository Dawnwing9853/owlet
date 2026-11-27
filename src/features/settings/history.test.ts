import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { finalizeBill } from '../../domain/split'
import { validBillDraft } from '../../domain/testing/arbitraries'
import type { Bill, Entry, Person } from '../../domain/types'
import { billHistory, billTotal, duplicateName, friendsToList, savedReceipt } from './history'

const bill = (id: string, date: string, over: Partial<Bill> = {}): Bill => ({
  kind: 'bill',
  id,
  title: id,
  date,
  items: [{ id: 'x', name: 'ชุด', price: 100, sharedBy: ['me'] }],
  payers: { me: 100 },
  servicePct: 0,
  vat: false,
  discount: 0,
  owed: { me: 100 },
  ...over,
})

describe('billHistory', () => {
  it('lists only bills, newest date first, newest saved first within a day', () => {
    const entries: Entry[] = [
      bill('old', '2026-10-01'),
      bill('today-first', '2026-11-27'),
      { kind: 'loan', id: 'l', date: '2026-12-01', lenderId: 'me', borrowerId: 'x', amount: 1 },
      bill('middle', '2026-11-01'),
      bill('today-second', '2026-11-27'),
    ]
    expect(billHistory(entries).map((b) => b.id)).toEqual(['today-second', 'today-first', 'middle', 'old'])
  })

  it('does not reorder the stored entries', () => {
    const entries = [bill('a', '2026-01-01'), bill('b', '2026-02-01')]
    billHistory(entries)
    expect(entries.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('savedReceipt', () => {
  it('shows the full breakdown when it matches what was saved', () => {
    const saved = bill('a', '2026-11-01')
    const receipt = savedReceipt(saved)
    expect(receipt.summaryOnly).toBe(false)
    expect(receipt.breakdown.people.me!.owed).toBe(100)
    expect(billTotal(saved)).toBe(100)
  })

  it('shows the saved amounts, without details, if today’s maths would differ', () => {
    // As if an older version of the app had split this differently.
    const historic = bill('a', '2026-11-01', {
      items: [{ id: 'x', name: 'ชุด', price: 100, sharedBy: ['me', 'ton'] }],
      owed: { me: 60, ton: 40 },
    })
    const receipt = savedReceipt(historic)
    expect(receipt.summaryOnly).toBe(true)
    expect(receipt.breakdown.people.me!.owed).toBe(60)
    expect(receipt.breakdown.people.ton!.owed).toBe(40)
    expect(receipt.breakdown.totals.total).toBe(100)
    expect(receipt.breakdown.unassigned).toBe(0)
  })

  it.each([
    ['someone saved who is not in the items', { owed: { me: 100, gone: 0 } }],
    ['someone in the items who was not saved', { items: [{ id: 'x', name: 'a', price: 100, sharedBy: ['me', 'z'] }] }],
    ['items that no longer add up to the saved total', { owed: { me: 90 }, payers: { me: 90 } }],
  ])('never invents a breakdown for %s', (_, over) => {
    const saved = bill('a', '2026-11-01', over)
    const receipt = savedReceipt(saved)
    expect(receipt.summaryOnly).toBe(true)
    expect(Object.fromEntries(Object.entries(receipt.breakdown.people).map(([id, p]) => [id, p.owed]))).toEqual(saved.owed)
    expect(receipt.breakdown.totals.total).toBe(billTotal(saved))
  })

  it('is the full breakdown for any bill the app saves today', () => {
    fc.assert(
      fc.property(validBillDraft, (draft) => {
        const result = finalizeBill(draft)
        if (!result.ok) throw new Error('generator made an invalid bill')
        const saved = bill('b', '2026-01-01', { ...draft, owed: result.owed })
        const receipt = savedReceipt(saved)
        expect(receipt.summaryOnly).toBe(false)
        expect(billTotal(saved)).toBe(result.total)
      }),
    )
  })
})

describe('friends', () => {
  const people: Person[] = [
    { id: 'me', name: 'เรา', isMe: true },
    { id: 'p-1', name: 'ต้น', isMe: false },
    { id: 'p-2', name: '(ไม่ทราบชื่อ)', isMe: false, needsName: true },
    { id: 'p-3', name: 'มิว', isMe: false, archived: true },
    { id: 'p-4', name: 'กาย', isMe: false },
  ]

  it('lists friends who need a name first, without me or archived friends', () => {
    expect(friendsToList(people).map((p) => p.id)).toEqual(['p-2', 'p-1', 'p-4'])
  })

  it('notices a name that someone else already has', () => {
    expect(duplicateName(people, 'p-4', ' ต้น ')).toBe(true)
    expect(duplicateName(people, 'p-1', 'ต้น')).toBe(false)
    expect(duplicateName(people, 'p-4', 'เรา')).toBe(true)
    expect(duplicateName(people, 'p-4', 'ใหม่')).toBe(false)
    expect(duplicateName(people, 'p-4', '   ')).toBe(false)
  })
})
