import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MAX_SATANG,
  distribute,
  distributeById,
  formatBaht,
  isAmount,
  parseBaht,
  percentOf,
  toDecimalString,
} from './money'

describe('parseBaht', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['1.05', 105],
    ['100.', 10000],
    ['.5', 50],
    ['  240  ', 24000],
    ['1,234.50', 123450],
    ['1,234,567', 123456700],
    ['0.29', 29],
    ['1.15', 115],
    ['999999999.99', MAX_SATANG],
  ])('reads %j as %i satang', (text, satang) => {
    expect(parseBaht(text)).toBe(satang)
  })

  it.each([
    '',
    '   ',
    '.',
    '-1',
    '+1',
    'abc',
    '1.234',
    '1..2',
    '1,5',
    '12,34',
    ',100',
    '1e3',
    '฿100',
    '1 000',
    '1000000000',
    '9'.repeat(30),
  ])('rejects %j', (text) => {
    expect(parseBaht(text)).toBeNull()
  })

  it('round-trips every formatted amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SATANG }), (satang) => {
        expect(parseBaht(formatBaht(satang).slice(1))).toBe(satang)
      }),
    )
  })
})

describe('formatBaht', () => {
  it.each([
    [0, '฿0.00'],
    [5, '฿0.05'],
    [100, '฿1.00'],
    [123400, '฿1,234.00'],
    [123450, '฿1,234.50'],
    [123456789, '฿1,234,567.89'],
    [-5000, '-฿50.00'],
    [-1, '-฿0.01'],
  ])('shows %i as %s with 2 decimals', (satang, text) => {
    expect(formatBaht(satang)).toBe(text)
  })

  it('shows negative zero without a minus sign', () => {
    expect(formatBaht(-0)).toBe('฿0.00')
  })

  it('refuses non-integer satang', () => {
    expect(() => formatBaht(1.5)).toThrow(RangeError)
    expect(() => formatBaht(Number.NaN)).toThrow(RangeError)
  })
})

describe('toDecimalString', () => {
  it('has 2 decimals and no separators', () => {
    expect(toDecimalString(422)).toBe('4.22')
    expect(toDecimalString(123456700)).toBe('1234567.00')
  })
})

describe('isAmount', () => {
  it('accepts integers from 0 to the maximum', () => {
    expect(isAmount(0)).toBe(true)
    expect(isAmount(MAX_SATANG)).toBe(true)
  })

  it.each([-1, 0.5, MAX_SATANG + 1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %d', (value) => {
    expect(isAmount(value)).toBe(false)
  })
})

describe('percentOf', () => {
  it('rounds half up to the satang', () => {
    expect(percentOf(5, 1000)).toBe(1) // 0.5 → 1
    expect(percentOf(4, 1000)).toBe(0) // 0.4 → 0
    expect(percentOf(49500, 700)).toBe(3465)
    expect(percentOf(11055, 700)).toBe(774) // 773.85 → 774
  })

  it('stays exact when the product is beyond float precision', () => {
    expect(percentOf(MAX_SATANG, 9999)).toBe(Number((BigInt(MAX_SATANG) * 9999n + 5000n) / 10000n))
  })

  it('refuses non-integer or negative input', () => {
    expect(() => percentOf(1.5, 100)).toThrow(RangeError)
    expect(() => percentOf(100, -1)).toThrow(RangeError)
  })
})

describe('distribute', () => {
  it('gives leftover satang to the largest remainders', () => {
    expect(distribute(10, [1, 2, 3])).toEqual([2, 3, 5]) // exact 1.67, 3.33, 5
  })

  it('breaks ties by position', () => {
    expect(distribute(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(distribute(2, [1, 1, 1])).toEqual([1, 1, 0])
  })

  it('never gives anything to a zero weight', () => {
    expect(distribute(100, [0, 1, 1, 1])).toEqual([0, 34, 33, 33])
  })

  it('handles nothing to split', () => {
    expect(distribute(0, [])).toEqual([])
    expect(distribute(0, [0, 0])).toEqual([0, 0])
  })

  it('refuses to split money over zero total weight', () => {
    expect(() => distribute(1, [])).toThrow(RangeError)
    expect(() => distribute(1, [0, 0])).toThrow(RangeError)
  })

  it('refuses invalid input', () => {
    expect(() => distribute(-1, [1])).toThrow(RangeError)
    expect(() => distribute(1.5, [1])).toThrow(RangeError)
    expect(() => distribute(1, [-1, 2])).toThrow(RangeError)
    expect(() => distribute(1, [0.5])).toThrow(RangeError)
    // Integers too big to be exact.
    expect(() => distribute(2 ** 53, [1])).toThrow(RangeError)
    expect(() => distribute(1, [2 ** 53])).toThrow(RangeError)
  })

  it('always sums exactly, each part within 1 satang of its exact share', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_SATANG }),
        fc.array(fc.integer({ min: 0, max: MAX_SATANG }), { minLength: 1, maxLength: 20 }),
        (total, weights) => {
          const sum = weights.reduce((a, w) => a + BigInt(w), 0n)
          fc.pre(sum > 0n)
          const parts = distribute(total, weights)
          expect(parts.reduce((a, p) => a + p, 0)).toBe(total)
          parts.forEach((part, i) => {
            const floor = (BigInt(total) * BigInt(weights[i]!)) / sum
            expect(BigInt(part) - floor === 0n || BigInt(part) - floor === 1n).toBe(true)
          })
        },
      ),
    )
  })
})

describe('distributeById', () => {
  it('breaks ties by the smaller id, whatever the key order', () => {
    expect(distributeById(100, { c: 1, a: 1, b: 1 })).toEqual({ a: 34, b: 33, c: 33 })
    expect(distributeById(100, { b: 1, c: 1, a: 1 })).toEqual({ a: 34, b: 33, c: 33 })
  })
})
