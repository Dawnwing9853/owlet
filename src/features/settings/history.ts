// What the settings screen lists. Pure.
import { computeBill, type BillBreakdown } from '../../domain/split'
import type { Bill, Entry, Person, PersonId, Satang } from '../../domain/types'

/** Newest date first; within a day, the one saved last first. */
export function billHistory(entries: readonly Entry[]): Bill[] {
  return entries
    .filter((entry) => entry.kind === 'bill')
    .toReversed()
    .sort((a, b) => b.date.localeCompare(a.date))
}

const sum = (values: Satang[]) => values.reduce((a, b) => a + b, 0)

export const billTotal = (bill: Bill): Satang => sum(Object.values(bill.owed))

/**
 * The receipt for a saved bill. `owed` is history and is never recalculated.
 * The per-item details are worked out again, so they are only shown while they
 * agree with what was saved; otherwise just the saved amounts are.
 */
export function savedReceipt(bill: Bill): { breakdown: BillBreakdown; summaryOnly: boolean } {
  const computed = computeBill(bill)
  const ids = new Set([...Object.keys(bill.owed), ...Object.keys(computed.people)])
  const agrees =
    computed.totals.total === billTotal(bill) &&
    [...ids].every((id) => bill.owed[id] !== undefined && computed.people[id]?.owed === bill.owed[id])
  if (agrees) return { breakdown: computed, summaryOnly: false }

  const people = Object.fromEntries(
    Object.entries(bill.owed).map(([id, owed]) => [id, { subtotal: 0, discount: 0, service: 0, vat: 0, owed }]),
  )
  return {
    breakdown: {
      ...computed,
      people,
      totals: { subtotal: 0, discount: 0, service: 0, vat: 0, total: billTotal(bill) },
      unassigned: 0,
    },
    summaryOnly: true,
  }
}

/** Friends who can be renamed, those still needing a name first. */
export function friendsToList(people: readonly Person[]): Person[] {
  return people
    .filter((p) => !p.isMe && !p.archived)
    .sort((a, b) => Number(b.needsName === true) - Number(a.needsName === true))
}

export function duplicateName(people: readonly Person[], personId: PersonId, name: string): boolean {
  const wanted = name.trim()
  return wanted !== '' && people.some((p) => p.id !== personId && p.name === wanted)
}
