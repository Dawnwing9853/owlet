import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isCalendarDate, toLocalDate } from './date'

describe('isCalendarDate', () => {
  it.each(['2026-11-27', '2024-02-29', '2000-02-29', '2026-12-31', '2026-01-01', '0099-03-01'])(
    'accepts %s',
    (text) => expect(isCalendarDate(text)).toBe(true),
  )

  it.each([
    '2026-02-29',
    '2026-02-30',
    '1900-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-11-00',
    '2026-1-05',
    '26-01-05',
    '2026/01/05',
    '2026-01-05T00:00:00',
    ' 2026-01-05',
    '12026-01-05',
    '',
  ])('rejects %j', (text) => expect(isCalendarDate(text)).toBe(false))
})

describe('toLocalDate', () => {
  it('uses the local calendar, not UTC', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 0, 5))).toBe('2026-01-05')
    expect(toLocalDate(new Date(2026, 11, 31, 23, 55))).toBe('2026-12-31')
  })

  it('always produces a real calendar date', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2000, 0, 1), max: new Date(2100, 0, 1), noInvalidDate: true }),
        (date) => isCalendarDate(toLocalDate(date)),
      ),
    )
  })
})
