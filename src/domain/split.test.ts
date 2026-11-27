import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_SATANG } from './money'
import { computeBill, defaultPayers, finalizeBill, type BillDraft } from './split'
import { validBillDraft } from './testing/arbitraries'

const item = (id: string, price: number, sharedBy: string[]) => ({ id, name: id, price, sharedBy })

const draft = (over: Partial<BillDraft> = {}): BillDraft => ({
  items: [item('i1', 10000, ['me', 'ton'])],
  payers: { me: 10000 },
  servicePct: 0,
  vat: false,
  discount: 0,
  ...over,
})

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

describe('computeBill', () => {
  it('splits an item equally, extra satang to the smaller id', () => {
    const result = computeBill(draft({ items: [item('i1', 10000, ['c', 'b', 'a'])] }))
    expect(result.items).toEqual([{ itemId: 'i1', shares: { a: 3334, b: 3333, c: 3333 } }])
    expect(result.people.a!.owed).toBe(3334)
    expect(result.totals.total).toBe(10000)
  })

  it('applies discount, then service, then VAT (hand-calculated)', () => {
    const result = computeBill(
      draft({
        items: [item('food', 30000, ['me', 'ton']), item('beer', 20000, ['ton'])],
        discount: 5000,
        servicePct: 10,
        vat: true,
        payers: { me: 52965 },
      }),
    )
    // VAT is 3465: exact shares 1039.5 and 2425.5, so the tie goes to "me".
    expect(result.people).toEqual({
      me: { subtotal: 15000, discount: 1500, service: 1350, vat: 1040, owed: 15890 },
      ton: { subtotal: 35000, discount: 3500, service: 3150, vat: 2425, owed: 37075 },
    })
    expect(result.totals).toEqual({ subtotal: 50000, discount: 5000, service: 4500, vat: 3465, total: 52965 })
    expect(result.issues).toEqual([])
  })

  it('rounds service and VAT once on the whole bill, not per person', () => {
    // 3 people at 0.05 each. Per-person rounding of 10% would charge 3 satang; the bill total gives 2.
    const result = computeBill(
      draft({ items: [item('i1', 15, ['a', 'b', 'c'])], servicePct: 10, payers: { a: 17 } }),
    )
    expect(result.totals).toMatchObject({ service: 2, total: 17 })
    expect(sum(Object.values(result.people).map((p) => p.owed))).toBe(17)
  })

  it('supports a fractional service percentage', () => {
    const result = computeBill(draft({ servicePct: 7.35, payers: { me: 10735 } }))
    expect(result.totals.service).toBe(735)
    expect(result.issues).toEqual([])
  })

  it('allows 0-baht items and a fully discounted bill', () => {
    const free = computeBill(draft({ items: [item('i1', 0, ['me'])], payers: {} }))
    expect(free.issues).toEqual([])
    expect(free.people.me!.owed).toBe(0)

    const discounted = computeBill(draft({ discount: 10000, servicePct: 10, vat: true, payers: { me: 0 } }))
    expect(discounted.issues).toEqual([])
    expect(discounted.totals.total).toBe(0)
  })

  it('reports no items', () => {
    expect(computeBill(draft({ items: [], payers: {} })).issues).toEqual([{ type: 'no-items' }])
  })

  it('reports an item nobody shares and leaves it out of the preview', () => {
    const result = computeBill(draft({ items: [item('i1', 10000, ['me']), item('i2', 5000, [])] }))
    expect(result.issues).toEqual([{ type: 'unshared-item', itemId: 'i2' }])
    expect(result.totals.total).toBe(10000)
  })

  it('reports a person listed twice on one item', () => {
    const result = computeBill(draft({ items: [item('i1', 10000, ['me', 'me'])] }))
    expect(result.issues).toEqual([{ type: 'duplicate-sharer', itemId: 'i1' }])
  })

  it.each([-1, 0.5, MAX_SATANG + 1, Number.NaN])('reports an invalid price %d', (bad) => {
    const result = computeBill(draft({ items: [item('i1', bad, ['me'])] }))
    expect(result.issues).toEqual([{ type: 'invalid-price', itemId: 'i1' }])
  })

  it.each([-1, 0.5, Number.NaN])('reports an invalid discount %d and ignores it', (bad) => {
    const result = computeBill(draft({ discount: bad }))
    expect(result.issues).toEqual([{ type: 'invalid-discount' }])
    expect(result.totals.discount).toBe(0)
  })

  it('reports a discount bigger than the items total', () => {
    const result = computeBill(draft({ discount: 10001 }))
    expect(result.issues).toEqual([{ type: 'discount-exceeds-subtotal' }])
    expect(result.totals.total).toBe(0)
  })

  it('does not call a discount too big just because an item is not shared yet', () => {
    const result = computeBill(
      draft({ items: [item('i1', 1000, ['me']), item('i2', 9000, [])], discount: 5000 }),
    )
    expect(result.issues).toEqual([{ type: 'unshared-item', itemId: 'i2' }])
  })

  it.each([-1, 100.01, 7.001, Number.NaN])('reports an invalid service percentage %d', (bad) => {
    const result = computeBill(draft({ servicePct: bad }))
    expect(result.issues).toEqual([{ type: 'invalid-service-pct' }])
    expect(result.totals.service).toBe(0)
  })

  it('reports a total over the limit even when every price is within it', () => {
    const result = computeBill(
      draft({ items: [item('i1', MAX_SATANG, ['me']), item('i2', 1, ['me'])], payers: {} }),
    )
    expect(result.issues).toEqual([{ type: 'total-too-large' }])
  })

  it('reports how far the payers are from the total', () => {
    expect(computeBill(draft({ payers: { me: 9000 } })).issues).toEqual([
      { type: 'payer-mismatch', difference: 1000 },
    ])
    expect(computeBill(draft({ payers: { me: 9000, ton: 1500 } })).issues).toEqual([
      { type: 'payer-mismatch', difference: -500 },
    ])
  })

  it('reports an invalid payment', () => {
    expect(computeBill(draft({ payers: { me: 11000, ton: -1000 } })).issues).toEqual([
      { type: 'invalid-payment', personId: 'ton' },
    ])
  })
})

describe('finalizeBill', () => {
  it('returns the owed snapshot for a bill with several payers', () => {
    const result = finalizeBill(draft({ payers: { me: 7000, ton: 3000 } }))
    expect(result).toEqual({ ok: true, owed: { me: 5000, ton: 5000 }, total: 10000 })
  })

  it('refuses to save while anything is wrong', () => {
    expect(finalizeBill(draft({ payers: {} }))).toEqual({
      ok: false,
      issues: [{ type: 'payer-mismatch', difference: 10000 }],
    })
  })

  it('keeps Σowed = bill total = Σpayers for any valid bill', () => {
    fc.assert(
      fc.property(validBillDraft, (bill) => {
        const result = finalizeBill(bill)
        if (!result.ok) throw new Error(JSON.stringify(result.issues))
        const breakdown = computeBill(bill)
        expect(sum(Object.values(result.owed))).toBe(result.total)
        expect(sum(Object.values(bill.payers))).toBe(result.total)

        for (const person of Object.values(breakdown.people)) {
          expect(person.owed).toBe(person.subtotal - person.discount + person.service + person.vat)
          for (const part of Object.values(person)) {
            expect(Number.isSafeInteger(part) && part >= 0).toBe(true)
          }
        }
        for (const { itemId, shares } of breakdown.items) {
          expect(sum(Object.values(shares))).toBe(bill.items.find((i) => i.id === itemId)!.price)
        }
        for (const key of ['subtotal', 'discount', 'service', 'vat'] as const) {
          expect(sum(Object.values(breakdown.people).map((p) => p[key]))).toBe(breakdown.totals[key])
        }
      }),
    )
  })
})

describe('defaultPayers', () => {
  it('says I paid everything', () => {
    expect(defaultPayers('me', 12345)).toEqual({ me: 12345 })
  })
})
