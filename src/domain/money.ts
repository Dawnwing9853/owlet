// All money is integer satang. Convert only at input and display.
import type { PersonId, Satang } from './types'

/** ฿999,999,999.99. Keeps sums of many amounts well inside safe integers. */
export const MAX_SATANG: Satang = 99_999_999_999

export function isAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SATANG
}

// Digits, optionally grouped by commas in threes, with up to 2 decimals.
const BAHT_INPUT = /^(?=\.?\d)(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/

/** User input in baht → satang, or null if it isn't a valid non-negative amount. */
export function parseBaht(text: string): Satang | null {
  const match = BAHT_INPUT.exec(text.trim())
  if (!match) return null
  const baht = Number(match[1]!.replaceAll(',', ''))
  const satang = baht * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return isAmount(satang) ? satang : null
}

function assertInteger(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be a safe integer, got ${value}`)
}

function assertNonNegativeInteger(value: number, what: string): void {
  assertInteger(value, what)
  if (value < 0) throw new RangeError(`${what} must not be negative, got ${value}`)
}

/** `1234.50`: 2 decimals, no separators, no sign. */
export function toDecimalString(satang: Satang): string {
  assertInteger(satang, 'amount')
  const abs = Math.abs(satang)
  const fraction = abs % 100
  return `${(abs - fraction) / 100}.${String(fraction).padStart(2, '0')}`
}

/** `฿1,234.50`, or `-฿1,234.50`. */
export function formatBaht(satang: Satang): string {
  const grouped = toDecimalString(satang).replace(/\B(?=(\d{3})+\.)/g, ',')
  return `${satang < 0 ? '-' : ''}฿${grouped}`
}

/** `amount × basisPoints / 10000`, rounded half up to the satang. */
export function percentOf(amount: Satang, basisPoints: number): Satang {
  assertNonNegativeInteger(amount, 'amount')
  assertNonNegativeInteger(basisPoints, 'basis points')
  return Number((BigInt(amount) * BigInt(basisPoints) + 5000n) / 10000n)
}

/**
 * Largest-remainder split of `total` in proportion to `weights`.
 * The parts always sum to `total`. Ties go to the earlier position.
 */
export function distribute(total: Satang, weights: readonly number[]): Satang[] {
  assertNonNegativeInteger(total, 'total')
  for (const weight of weights) assertNonNegativeInteger(weight, 'weight')

  const weightSum = weights.reduce((sum, w) => sum + BigInt(w), 0n)
  if (weightSum === 0n) {
    if (total !== 0) throw new RangeError('cannot split money over zero total weight')
    return weights.map(() => 0)
  }

  // BigInt keeps total × weight exact however large the amounts are.
  const shares = weights.map((weight, index) => {
    const product = BigInt(total) * BigInt(weight)
    return { index, part: Number(product / weightSum), remainder: product % weightSum }
  })
  const leftover = total - shares.reduce((sum, s) => sum + s.part, 0)
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  )
  for (const share of byRemainder.slice(0, leftover)) share.part += 1

  return shares.map((s) => s.part)
}

/** `distribute` keyed by person. Ties go to the smaller id. */
export function distributeById(
  total: Satang,
  weights: Readonly<Record<PersonId, number>>,
): Record<PersonId, Satang> {
  const ids = Object.keys(weights).sort()
  const parts = distribute(
    total,
    ids.map((id) => weights[id]!),
  )
  return Object.fromEntries(ids.map((id, i) => [id, parts[i]!]))
}
