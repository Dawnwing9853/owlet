// สรุปเดือน: what happened to my money in one month.
import { entriesByGroup } from './ledger'
import type { Entry, PersonId, Satang } from './types'

export interface MonthFigures {
  /** ส่วนที่เรากินจริง: my `owed` in bills. */
  myShare: Satang
  /** เงินที่ควักออกไป: what I paid in bills, plus money I lent. */
  cashOut: Satang
  /** ให้ยืม */
  lent: Satang
  /** ได้คืน: repayments made to me. */
  repaidToMe: Satang
}

export interface MonthSummary {
  month: string
  totals: MonthFigures
  /** Only groups with a non-zero figure. null = ไม่มีกลุ่ม, listed last. */
  byGroup: ({ groupId: string | null } & MonthFigures)[]
}

function figuresFor(entries: readonly Entry[], meId: PersonId): MonthFigures {
  const figures: MonthFigures = { myShare: 0, cashOut: 0, lent: 0, repaidToMe: 0 }
  for (const entry of entries) {
    switch (entry.kind) {
      case 'bill':
        figures.myShare += entry.owed[meId] ?? 0
        figures.cashOut += entry.payers[meId] ?? 0
        break
      case 'loan':
        if (entry.lenderId === meId && entry.borrowerId !== meId) {
          figures.lent += entry.amount
          figures.cashOut += entry.amount
        }
        break
      case 'repay':
        if (entry.toId === meId && entry.fromId !== meId) figures.repaidToMe += entry.amount
        break
    }
  }
  return figures
}

/** `month` is `YYYY-MM`. */
export function monthSummary(entries: readonly Entry[], meId: PersonId, month: string): MonthSummary {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError(`invalid month: ${month}`)
  const inMonth = entries.filter((e) => e.date.startsWith(`${month}-`))
  return {
    month,
    totals: figuresFor(inMonth, meId),
    byGroup: entriesByGroup(inMonth)
      .map(({ groupId, entries: list }) => ({ groupId, ...figuresFor(list, meId) }))
      .filter((g) => g.myShare || g.cashOut || g.lent || g.repaidToMe),
  }
}
