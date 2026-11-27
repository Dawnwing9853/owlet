// Bill calculation: item shares → discount → service charge → VAT.
import { MAX_SATANG, distributeById, isAmount, percentOf } from './money'
import type { Bill, PersonId, Satang } from './types'

export type BillDraft = Pick<Bill, 'items' | 'payers' | 'servicePct' | 'vat' | 'discount'>

const VAT_BASIS_POINTS = 700
const MAX_SERVICE_PCT = 100

export type BillIssue =
  | { type: 'no-items' }
  | { type: 'invalid-price'; itemId: string }
  | { type: 'unshared-item'; itemId: string }
  | { type: 'duplicate-sharer'; itemId: string }
  | { type: 'invalid-discount' }
  | { type: 'discount-exceeds-subtotal' }
  | { type: 'invalid-service-pct' }
  | { type: 'total-too-large' }
  | { type: 'invalid-payment'; personId: PersonId }
  /** `difference` = bill total − Σpayers. Positive means money is still missing. */
  | { type: 'payer-mismatch'; difference: Satang }

export interface PersonShare {
  subtotal: Satang
  discount: Satang
  service: Satang
  vat: Satang
  owed: Satang
}

export interface BillBreakdown {
  items: { itemId: string; shares: Record<PersonId, Satang> }[]
  people: Record<PersonId, PersonShare>
  totals: { subtotal: Satang; discount: Satang; service: Satang; vat: Satang; total: Satang }
  issues: BillIssue[]
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0)

function mapValues<T>(record: Record<PersonId, T>, fn: (value: T, id: PersonId) => number) {
  return Object.fromEntries(Object.entries(record).map(([id, value]) => [id, fn(value, id)]))
}

/** Service percentage → basis points, or null if invalid. */
function serviceBasisPoints(pct: number): number | null {
  const basisPoints = Math.round(pct * 100)
  const valid = pct >= 0 && pct <= MAX_SERVICE_PCT && basisPoints / 100 === pct
  return valid ? basisPoints : null
}

/**
 * Calculates a bill, valid or not, so the receipt preview can update live.
 * Items and settings that have a problem are left out and listed in `issues`.
 */
export function computeBill(draft: BillDraft): BillBreakdown {
  const issues: BillIssue[] = []
  if (draft.items.length === 0) issues.push({ type: 'no-items' })

  const items: BillBreakdown['items'] = []
  const subtotals: Record<PersonId, Satang> = {}
  let enteredSubtotal = 0
  for (const item of draft.items) {
    if (!isAmount(item.price)) {
      issues.push({ type: 'invalid-price', itemId: item.id })
      continue
    }
    enteredSubtotal += item.price
    if (item.sharedBy.length === 0) {
      issues.push({ type: 'unshared-item', itemId: item.id })
      continue
    }
    if (new Set(item.sharedBy).size !== item.sharedBy.length) {
      issues.push({ type: 'duplicate-sharer', itemId: item.id })
      continue
    }
    const shares = distributeById(item.price, Object.fromEntries(item.sharedBy.map((id) => [id, 1])))
    items.push({ itemId: item.id, shares })
    for (const [id, share] of Object.entries(shares)) subtotals[id] = (subtotals[id] ?? 0) + share
  }
  const subtotal = sum(Object.values(subtotals))

  let discount = 0
  if (!isAmount(draft.discount)) {
    issues.push({ type: 'invalid-discount' })
  } else {
    if (draft.discount > enteredSubtotal) issues.push({ type: 'discount-exceeds-subtotal' })
    discount = Math.min(draft.discount, subtotal)
  }
  const discounts = distributeById(discount, subtotals)

  const serviceBp = serviceBasisPoints(draft.servicePct)
  if (serviceBp === null) issues.push({ type: 'invalid-service-pct' })

  // Service and VAT are rounded once on the whole bill, then split, so the
  // total matches the restaurant's receipt.
  const afterDiscount = mapValues(subtotals, (value, id) => value - discounts[id]!)
  const service = percentOf(subtotal - discount, serviceBp ?? 0)
  const services = distributeById(service, afterDiscount)

  const vatBase = mapValues(afterDiscount, (value, id) => value + services[id]!)
  const vat = draft.vat ? percentOf(subtotal - discount + service, VAT_BASIS_POINTS) : 0
  const vats = distributeById(vat, vatBase)

  const people: Record<PersonId, PersonShare> = {}
  for (const id of Object.keys(subtotals).sort()) {
    people[id] = {
      subtotal: subtotals[id]!,
      discount: discounts[id]!,
      service: services[id]!,
      vat: vats[id]!,
      owed: vatBase[id]! + vats[id]!,
    }
  }
  const total = subtotal - discount + service + vat
  if (total > MAX_SATANG) issues.push({ type: 'total-too-large' })

  const badPayments = Object.entries(draft.payers).filter(([, paid]) => !isAmount(paid))
  for (const [personId] of badPayments) issues.push({ type: 'invalid-payment', personId })

  // The difference only means something once the total itself is right.
  const difference = total - sum(Object.values(draft.payers))
  if (issues.length === 0 && difference !== 0) issues.push({ type: 'payer-mismatch', difference })

  return { items, people, totals: { subtotal, discount, service, vat, total }, issues }
}

export type FinalizeResult =
  | { ok: true; owed: Record<PersonId, Satang>; total: Satang }
  | { ok: false; issues: BillIssue[] }

/** Validates a bill for saving and returns the `owed` snapshot. */
export function finalizeBill(draft: BillDraft): FinalizeResult {
  const { people, totals, issues } = computeBill(draft)
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, owed: mapValues(people, (p) => p.owed), total: totals.total }
}

/** Default payers: me, everything. */
export function defaultPayers(meId: PersonId, total: Satang): Record<PersonId, Satang> {
  return { [meId]: total }
}
