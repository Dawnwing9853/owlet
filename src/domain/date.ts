// Dates are local calendar dates, YYYY-MM-DD, with no time or timezone.

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a date that exists on the calendar, so not 2026-02-30. */
export function isCalendarDate(text: string): boolean {
  const match = DATE_PATTERN.exec(text)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const pad = (value: number, length: number) => String(value).padStart(length, '0')

/** The date on the phone's own calendar. */
export function toLocalDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`
}
