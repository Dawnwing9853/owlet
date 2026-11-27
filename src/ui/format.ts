import { isCalendarDate } from '../domain/date'

const THAI_DATE = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

/** `2026-11-27` → `27 พ.ย. 2569`. Anything else is returned unchanged. */
export function formatThaiDate(date: string): string {
  if (!isCalendarDate(date)) return date
  const [year, month, day] = date.split('-').map(Number)
  return THAI_DATE.format(new Date(year!, month! - 1, day))
}
