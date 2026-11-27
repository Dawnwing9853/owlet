// Thai text for records that were set aside.
import type { Collection, Quarantined } from './parse'
import type { Problem } from './schema'

const PROBLEM_TEXT: Record<Problem, string> = {
  unbalanced: 'ยอดคนจ่ายกับยอดที่หารไม่เท่ากัน',
  date: 'วันที่ไม่ถูกต้อง',
  amount: 'จำนวนเงินไม่ถูกต้อง',
  shape: 'ข้อมูลไม่ครบหรือผิดรูปแบบ',
  'duplicate-id': 'ซ้ำกับรายการอื่น',
  me: 'ข้อมูลของเราไม่ถูกต้อง',
}

const COLLECTION_TEXT: Record<Collection, string> = {
  entries: 'รายการ',
  people: 'เพื่อน',
  groups: 'กลุ่ม',
  settings: 'การตั้งค่า',
}

const KIND_TEXT: Record<string, string> = { bill: 'บิล', loan: 'รายการยืม', repay: 'รายการคืนเงิน' }

function field(raw: unknown, key: string): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = (raw as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export interface QuarantineNotice {
  message: string
  details: string[]
}

/** What the permanent banner says, wherever money is shown. Null means no banner. */
export function quarantineNotice(quarantine: readonly Quarantined[]): QuarantineNotice | null {
  if (quarantine.length === 0) return null
  return {
    message: `มี ${quarantine.length} รายการที่อ่านไม่ได้ ยอดอาจไม่ครบ`,
    details: quarantine.map(describeQuarantined),
  }
}

/** One line naming the record and what is wrong with it. */
export function describeQuarantined({ collection, raw, problems }: Quarantined): string {
  const kind = KIND_TEXT[field(raw, 'kind') ?? ''] ?? COLLECTION_TEXT[collection]
  const name = field(raw, 'title') ?? field(raw, 'name')
  const date = field(raw, 'date')
  const label = [kind, name ? `“${name}”` : undefined, date].filter(Boolean).join(' ')
  const reasons = (problems.length > 0 ? problems : (['shape'] as const)).map((p) => PROBLEM_TEXT[p])
  return `${label}: ${reasons.join(', ')}`
}
