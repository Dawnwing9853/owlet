// Balances are never stored. Everything here is derived from entries.
import { distribute } from './money'
import type { Entry, Group, PersonId, Satang } from './types'

/** `from` owes `to`. `amount` is always positive. */
export interface Debt {
  from: PersonId
  to: PersonId
  amount: Satang
}

/** Positive: this person is owed money. Zero balances are left out. */
export type Nets = Record<PersonId, Satang>

type Change = readonly [PersonId, Satang]

function sumChanges(changes: Iterable<Change>): Nets {
  const nets = new Map<PersonId, Satang>()
  for (const [id, amount] of changes) nets.set(id, (nets.get(id) ?? 0) + amount)
  return Object.fromEntries([...nets].filter(([, amount]) => amount !== 0).sort(([a], [b]) => compare(a, b)))
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function changesOf(entry: Entry): Change[] {
  switch (entry.kind) {
    case 'bill':
      return [
        ...Object.entries(entry.payers),
        ...Object.entries(entry.owed).map(([id, owed]): Change => [id, -owed]),
      ]
    case 'loan':
      return [
        [entry.lenderId, entry.amount],
        [entry.borrowerId, -entry.amount],
      ]
    case 'repay':
      return [
        [entry.fromId, entry.amount],
        [entry.toId, -entry.amount],
      ]
  }
}

/** Everyone an entry points at, including people who end up owing nothing. */
export function entryPersonIds(entry: Entry): PersonId[] {
  const ids =
    entry.kind === 'bill'
      ? [
          ...entry.items.flatMap((item) => item.sharedBy),
          ...Object.keys(entry.payers),
          ...Object.keys(entry.owed),
        ]
      : entry.kind === 'loan'
        ? [entry.lenderId, entry.borrowerId]
        : [entry.fromId, entry.toId]
  return [...new Set(ids)]
}

/** Paid minus owed, per person. */
export function entryNets(entry: Entry): Nets {
  return sumChanges(changesOf(entry))
}

export function netBalances(entries: readonly Entry[]): Nets {
  return sumChanges(entries.flatMap(changesOf))
}

export function netsFromDebts(debts: readonly Debt[]): Nets {
  return sumChanges(
    debts.flatMap(({ from, to, amount }): Change[] => [
      [to, amount],
      [from, -amount],
    ]),
  )
}

/**
 * Within one entry, each debtor owes the creditors in proportion to what each is
 * *still* owed, one debtor at a time in id order. Splitting every debtor against
 * the original amounts instead can hand all the leftover satang to one creditor.
 */
export function entryDebts(entry: Entry): Debt[] {
  const nets = Object.entries(entryNets(entry))
  if (nets.reduce((sum, [, net]) => sum + net, 0) !== 0) {
    throw new RangeError(`entry ${entry.id} does not balance`)
  }

  const creditors = nets.filter(([, net]) => net > 0).map(([id, net]) => ({ id, remaining: net }))
  const debts: Debt[] = []
  for (const [from, net] of nets) {
    if (net > 0) continue
    const shares = distribute(
      -net,
      creditors.map((c) => c.remaining),
    )
    creditors.forEach((creditor, i) => {
      const amount = shares[i]!
      creditor.remaining -= amount
      if (amount > 0) debts.push({ from, to: creditor.id, amount })
    })
  }
  return debts
}

function sortDebts(debts: Debt[]): Debt[] {
  return debts.sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to))
}

/** One debt per pair of people at most, in a stable order. */
export function netDebts(debts: readonly Debt[]): Debt[] {
  // Per pair [a, b] with a < b: positive means a owes b.
  const pairs = new Map<string, { a: PersonId; b: PersonId; amount: Satang }>()
  for (const { from, to, amount } of debts) {
    const forward = from < to
    const [a, b] = forward ? [from, to] : [to, from]
    const key = JSON.stringify([a, b])
    const pair = pairs.get(key) ?? { a, b, amount: 0 }
    pair.amount += forward ? amount : -amount
    pairs.set(key, pair)
  }
  return sortDebts(
    [...pairs.values()]
      .filter((p) => p.amount !== 0)
      .map(({ a, b, amount }) =>
        amount > 0 ? { from: a, to: b, amount } : { from: b, to: a, amount: -amount },
      ),
  )
}

export function pairwiseDebts(entries: readonly Entry[]): Debt[] {
  return netDebts(entries.flatMap(entryDebts))
}

/** Greedy: the biggest debtor pays the biggest creditor. Ties go to the smaller id. */
export function simplifyDebts(debts: readonly Debt[]): Debt[] {
  const open = Object.entries(netsFromDebts(debts)).map(([id, net]) => ({ id, net }))
  const result: Debt[] = []
  for (;;) {
    // Stable sorts over an id-ordered list keep ties in id order.
    const creditor = open.filter((p) => p.net > 0).sort((a, b) => b.net - a.net)[0]
    const debtor = open.filter((p) => p.net < 0).sort((a, b) => a.net - b.net)[0]
    if (!creditor || !debtor) return sortDebts(result)
    const amount = Math.min(creditor.net, -debtor.net)
    creditor.net -= amount
    debtor.net += amount
    result.push({ from: debtor.id, to: creditor.id, amount })
  }
}

export interface GroupEntries {
  /** null = ไม่มีกลุ่ม */
  groupId: string | null
  entries: Entry[]
}

/**
 * Entries bucketed by group, in id order, ungrouped last. A groupId that matches
 * no group counts as ungrouped. The entry itself is left as it is.
 */
export function entriesByGroup(entries: readonly Entry[], groups: readonly Group[]): GroupEntries[] {
  const known = new Set(groups.map((g) => g.id))
  const buckets = new Map<string | null, Entry[]>()
  for (const entry of entries) {
    const groupId = entry.groupId !== undefined && known.has(entry.groupId) ? entry.groupId : null
    const bucket = buckets.get(groupId)
    if (bucket) bucket.push(entry)
    else buckets.set(groupId, [entry])
  }
  return [...buckets]
    .map(([groupId, list]) => ({ groupId, entries: list }))
    .sort((a, b) => {
      if (a.groupId === null) return 1
      if (b.groupId === null) return -1
      return compare(a.groupId, b.groupId)
    })
}

/** The one place that decides whether a bucket is simplified. */
function bucketDebts(entries: readonly Entry[], group: Group | undefined): Debt[] {
  const debts = pairwiseDebts(entries)
  return group?.simplify ? simplifyDebts(debts) : debts
}

/** The debts shown on a group's screen. */
export function groupDebts(entries: readonly Entry[], group: Group): Debt[] {
  return bucketDebts(
    entries.filter((e) => e.groupId === group.id),
    group,
  )
}

export function debtsByGroup(
  entries: readonly Entry[],
  groups: readonly Group[],
): { groupId: string | null; debts: Debt[] }[] {
  return entriesByGroup(entries, groups).map(({ groupId, entries: list }) => ({
    groupId,
    debts: bucketDebts(
      list,
      groups.find((g) => g.id === groupId),
    ),
  }))
}

/** All group views added together, netted per pair. */
export function overallDebts(entries: readonly Entry[], groups: readonly Group[]): Debt[] {
  return netDebts(debtsByGroup(entries, groups).flatMap((g) => g.debts))
}

export interface PersonBalance {
  personId: PersonId
  /** Positive: they owe me. Negative: I owe them. */
  net: Satang
  byGroup: { groupId: string | null; net: Satang }[]
}

export interface MyBalances {
  owedToMe: Satang
  iOwe: Satang
  /** Everyone with something open with me, even if it nets to 0 across groups. */
  people: PersonBalance[]
}

export function myBalances(entries: readonly Entry[], groups: readonly Group[], meId: PersonId): MyBalances {
  const people = new Map<PersonId, PersonBalance>()
  for (const { groupId, debts } of debtsByGroup(entries, groups)) {
    for (const { from, to, amount } of debts) {
      if (from !== meId && to !== meId) continue
      const personId = to === meId ? from : to
      const net = to === meId ? amount : -amount
      const person = people.get(personId) ?? { personId, net: 0, byGroup: [] }
      person.net += net
      person.byGroup.push({ groupId, net })
      people.set(personId, person)
    }
  }

  const list = [...people.values()].sort((a, b) => compare(a.personId, b.personId))
  return {
    owedToMe: list.reduce((sum, p) => sum + Math.max(p.net, 0), 0),
    iOwe: list.reduce((sum, p) => sum + Math.max(-p.net, 0), 0),
    people: list,
  }
}
