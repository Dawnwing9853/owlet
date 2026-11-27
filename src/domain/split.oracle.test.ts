// An independent check of each person's amount. The other bill properties mostly
// show that parts add up, which largest remainder guarantees whatever the
// proportions are. This compares against exact rational arithmetic instead.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeBill, type BillDraft } from './split'
import { validBillDraft } from './testing/arbitraries'

interface Fraction {
  num: bigint
  den: bigint
}

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b))

/** What each person owes with no rounding anywhere. Uses no domain helpers. */
function exactOwed(draft: BillDraft): Map<string, Fraction> {
  // Common denominator for the equal splits of every item.
  const scale = draft.items.reduce((l, item) => {
    const k = BigInt(item.sharedBy.length)
    return (l * k) / gcd(l, k)
  }, 1n)

  const scaledSubtotals = new Map<string, bigint>()
  for (const item of draft.items) {
    const part = (BigInt(item.price) * scale) / BigInt(item.sharedBy.length)
    for (const id of item.sharedBy) scaledSubtotals.set(id, (scaledSubtotals.get(id) ?? 0n) + part)
  }

  const subtotal = draft.items.reduce((a, item) => a + BigInt(item.price), 0n)
  const afterDiscount = subtotal - BigInt(draft.discount)
  const serviceFactor = 10_000n + BigInt(Math.round(draft.servicePct * 100))
  const vatFactor = draft.vat ? 107n : 100n

  return new Map(
    [...scaledSubtotals].map(([id, scaled]) => [
      id,
      subtotal === 0n
        ? { num: 0n, den: 1n }
        : { num: scaled * afterDiscount * serviceFactor * vatFactor, den: scale * subtotal * 10_000n * 100n },
    ]),
  )
}

/**
 * Largest allowed gap in satang: ceil(v·(1+s)·(n+1)) + 4.
 *
 * Why it holds: each of the n item splits is off by less than 1 satang, and the
 * discount split adds less than 1, so the amount after discount is off by less
 * than n+1. Service multiplies that by (1+s) and adds less than 1.5 of its own
 * rounding. VAT multiplies by v = 1.07 and adds less than 1.5. The total is less
 * than v·(1+s)·(n+1) + 3.105.
 */
function tolerance(draft: BillDraft): bigint {
  const v = draft.vat ? 107n : 100n
  const s = 10_000n + BigInt(Math.round(draft.servicePct * 100))
  const scaled = v * s * BigInt(draft.items.length + 1)
  const den = 100n * 10_000n
  return (scaled + den - 1n) / den + 4n
}

/** |owed − exact| for each person, as an exact fraction. */
function gaps(draft: BillDraft): Fraction[] {
  const { people } = computeBill(draft)
  const exact = exactOwed(draft)
  expect(Object.keys(people).sort()).toEqual([...exact.keys()].sort())
  return [...exact].map(([id, { num, den }]) => {
    const diff = BigInt(people[id]!.owed) * den - num
    return { num: diff < 0n ? -diff : diff, den }
  })
}

const within = (gap: Fraction, satang: bigint) => gap.num <= satang * gap.den

describe('each owed amount against exact arithmetic', () => {
  it('stays within the rounding tolerance for any valid bill', () => {
    fc.assert(
      fc.property(validBillDraft, (draft) => {
        const limit = tolerance(draft)
        for (const gap of gaps(draft)) expect(within(gap, limit)).toBe(true)
      }),
      { numRuns: 2000 },
    )
  })

  // The common case, held much tighter. With no service or VAT, each of the n item
  // splits is off by less than 1 satang and the discount split by less than 1
  // more, so the gap is less than n+1.
  it('is within items+1 satang when there is no service charge or VAT', () => {
    const plain = validBillDraft.map((draft) => ({ ...draft, servicePct: 0, vat: false }))
    fc.assert(
      fc.property(plain, (draft) => {
        const limit = BigInt(draft.items.length + 1)
        for (const gap of gaps(draft)) expect(within(gap, limit)).toBe(true)
      }),
      { numRuns: 2000 },
    )
  })

  // Worst cases: 1 satang is left over on every item, always for the same person.
  // They show why a tolerance of "items + 4" would be too tight.
  it.each([
    { items: 8, sharers: 6, servicePct: 100 },
    { items: 40, sharers: 20, servicePct: 10 },
  ])('$items items, $sharers sharers, $servicePct% service drifts past items+4', (c) => {
    const ids = Array.from({ length: c.sharers }, (_, i) => `p${String(i).padStart(2, '0')}`)
    const draft: BillDraft = {
      items: Array.from({ length: c.items }, (_, i) => ({
        id: `i${i}`,
        name: 'item',
        price: c.sharers * 100 + 1,
        sharedBy: ids,
      })),
      payers: {},
      servicePct: c.servicePct,
      vat: true,
      discount: 0,
    }
    const all = gaps(draft)
    expect(all.some((gap) => !within(gap, BigInt(c.items + 4)))).toBe(true)
    expect(all.every((gap) => within(gap, tolerance(draft)))).toBe(true)
  })
})
