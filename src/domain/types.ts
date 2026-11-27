// Data model. See docs/SPEC.md.

/** Money is always an integer number of satang. Never a float. */
export type Satang = number

export type PersonId = string

export interface Person {
  id: PersonId
  name: string
  isMe: boolean
  archived?: boolean
}

export interface Group {
  id: string
  name: string
  memberIds: PersonId[]
  /** Epoch milliseconds. */
  createdAt: number
  archived?: boolean
  /** "ลดจำนวนการโอน". Applies to this group's debts, here and on home. */
  simplify?: boolean
}

export interface BillItem {
  id: string
  name: string
  price: Satang
  sharedBy: PersonId[]
}

export interface Bill {
  kind: 'bill'
  id: string
  title: string
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  groupId?: string
  items: BillItem[]
  /** What each payer actually paid. Sums to the bill total. */
  payers: Record<PersonId, Satang>
  /** Up to 2 decimal places. 0 means off. */
  servicePct: number
  /** VAT 7%. */
  vat: boolean
  discount: Satang
  note?: string
  /** Snapshot taken at save time, so history never changes if the algorithm does. */
  owed: Record<PersonId, Satang>
}

export interface Loan {
  kind: 'loan'
  id: string
  date: string
  lenderId: PersonId
  borrowerId: PersonId
  amount: Satang
  groupId?: string
  note?: string
}

export interface Repay {
  kind: 'repay'
  id: string
  date: string
  fromId: PersonId
  toId: PersonId
  amount: Satang
  groupId?: string
  note?: string
}

export type Entry = Bill | Loan | Repay

export interface Settings {
  myPromptPayId?: string
  lastBackupAt?: number
  schemaVersion: number
}
