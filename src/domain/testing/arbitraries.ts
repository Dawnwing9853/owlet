// fast-check generators shared by the domain property tests.
import fc from 'fast-check'
import { distribute } from '../money'
import { computeBill, type BillDraft } from '../split'
import type { Bill, Entry, Group, Loan, Repay } from '../types'

export const PEOPLE = ['me', 'p1', 'p2', 'p3', 'p4', 'p5']
const GROUP_IDS = [undefined, 'g1', 'g2']

const person = fc.constantFrom(...PEOPLE)
const sharers = fc.shuffledSubarray(PEOPLE, { minLength: 1 })
const price = fc.oneof(
  fc.integer({ min: 0, max: 500 }),
  fc.integer({ min: 0, max: 1_000_000 }),
  // Large, but 8 of these plus 100% service and VAT stay under the bill limit.
  fc.integer({ min: 0, max: 5_000_000_000 }),
)
/** Every month a generated entry can fall in. */
export const MONTHS = ['2026-01', '2026-02', '2026-03']

const date = fc
  .tuple(fc.constantFrom(...MONTHS), fc.integer({ min: 1, max: 28 }))
  .map(([month, d]) => `${month}-${String(d).padStart(2, '0')}`)

const items = fc
  .array(fc.record({ price, sharedBy: sharers }), { minLength: 1, maxLength: 8 })
  .map((list) => list.map((item, i) => ({ id: `i${i}`, name: `item ${i}`, ...item })))

/** A draft that always passes validation, including payers that sum to the total. */
export const validBillDraft: fc.Arbitrary<BillDraft> = items.chain((list) => {
  const subtotal = list.reduce((a, item) => a + item.price, 0)
  return fc
    .record({
      discount: fc.integer({ min: 0, max: subtotal }),
      servicePct: fc.oneof(fc.constantFrom(0, 10), fc.integer({ min: 0, max: 10000 }).map((bp) => bp / 100)),
      vat: fc.boolean(),
      payerIds: sharers,
      payerWeights: fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 6, maxLength: 6 }),
    })
    .map(({ discount, servicePct, vat, payerIds, payerWeights }) => {
      const draft: BillDraft = { items: list, discount, servicePct, vat, payers: {} }
      const { total } = computeBill(draft).totals
      const parts = distribute(total, payerWeights.slice(0, payerIds.length))
      return { ...draft, payers: Object.fromEntries(payerIds.map((id, i) => [id, parts[i]!])) }
    })
})

const meta = { date, groupId: fc.constantFrom(...GROUP_IDS) }
const amount = fc.integer({ min: 1, max: 1_000_000 })

const bill: fc.Arbitrary<Bill> = fc.record({ draft: validBillDraft, ...meta }).map(({ draft, date, groupId }) => ({
  kind: 'bill',
  id: '',
  title: 'bill',
  date,
  groupId,
  ...draft,
  owed: Object.fromEntries(Object.entries(computeBill(draft).people).map(([id, p]) => [id, p.owed])),
}))

const loan: fc.Arbitrary<Loan> = fc.record({
  kind: fc.constant('loan' as const),
  id: fc.constant(''),
  lenderId: person,
  borrowerId: person,
  amount,
  ...meta,
})

const repay: fc.Arbitrary<Repay> = fc.record({
  kind: fc.constant('repay' as const),
  id: fc.constant(''),
  fromId: person,
  toId: person,
  amount,
  ...meta,
})

export const entry: fc.Arbitrary<Entry> = fc.oneof(bill, loan, repay)

export const entries: fc.Arbitrary<Entry[]> = fc
  .array(entry, { maxLength: 12 })
  .map((list) => list.map((e, i) => ({ ...e, id: `e${i}` })))

export const groups: fc.Arbitrary<Group[]> = fc.tuple(fc.boolean(), fc.boolean()).map((flags) =>
  flags.map((simplify, i) => ({
    id: `g${i + 1}`,
    name: `group ${i + 1}`,
    memberIds: PEOPLE,
    createdAt: 0,
    simplify,
  })),
)
