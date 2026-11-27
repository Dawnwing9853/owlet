import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { MAX_SATANG } from './money'
import { buildPromptPayPayload, crc16, parsePromptPayId } from './promptpay'

// Expected payloads are the published test vectors of dtinth/promptpay-qr (MIT),
// index.test.js. All IDs here are made up.
const PHONE_PAYLOAD = '00020101021129370016A000000677010111011300668012345675802TH530376463046197'
const EWALLET_PAYLOAD = '00020101021129390016A00000067701011103150123456789012345802TH530376463049781'
const AMOUNT_PAYLOAD = '00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469'
// These two use IDs that fail the Thai check digit, so only their CRC is checked.
const ID_PAYLOAD_BAD_CHECK_DIGIT =
  '00020101021129370016A000000677010111021311111111111115802TH530376463047B5A'
const TAX_PAYLOAD_BAD_CHECK_DIGIT =
  '00020101021129370016A000000677010111021301234567890125802TH530376463040CBD'

const VALID_NATIONAL_ID = '1234567890121'

describe('crc16', () => {
  it('matches the CRC16-CCITT check value', () => {
    expect(crc16('123456789')).toBe('29B1')
  })

  it('pads to 4 hex digits', () => {
    expect(crc16('')).toBe('FFFF')
    expect(crc16('6')).toMatch(/^[0-9A-F]{4}$/)
    for (let i = 0; i < 200; i += 1) expect(crc16(String(i))).toHaveLength(4)
  })

  it.each([
    PHONE_PAYLOAD,
    EWALLET_PAYLOAD,
    AMOUNT_PAYLOAD,
    ID_PAYLOAD_BAD_CHECK_DIGIT,
    TAX_PAYLOAD_BAD_CHECK_DIGIT,
  ])('agrees with the published payload %s', (payload) => {
    expect(crc16(payload.slice(0, -4))).toBe(payload.slice(-4))
  })
})

describe('parsePromptPayId', () => {
  it.each([
    ['0801234567', 'phone', '0801234567'],
    ['080-123-4567', 'phone', '0801234567'],
    [' 080 123 4567 ', 'phone', '0801234567'],
    [VALID_NATIONAL_ID, 'nationalId', VALID_NATIONAL_ID],
    ['1-2345-67890-12-1', 'nationalId', VALID_NATIONAL_ID],
    ['012345678901234', 'ewallet', '012345678901234'],
  ])('accepts %j as %s', (input, type, value) => {
    expect(parsePromptPayId(input)).toEqual({ type, value })
  })

  it.each([
    '',
    '801234567', // 9 digits
    '1801234567', // phone not starting with 0
    '08012345678', // 11 digits
    '123456789012', // 12 digits
    '1234567890122', // wrong check digit
    '1111111111111', // wrong check digit
    '12345678901234', // 14 digits
    '12345678901215', // 14 digits: a valid national ID plus one more
    '1234567890121x', // a valid national ID plus a letter
    '91234567890121', // one digit before a valid national ID
    '0123456789012345', // 16 digits
    '+66801234567',
    '080123456a',
    '080.123.4567',
  ])('rejects %j', (input) => {
    expect(parsePromptPayId(input)).toBeNull()
  })

})

// The check digit is a typo filter, not a guarantee. The payee name shown by the
// bank app is still the real check.
describe('national ID check digit limits', () => {
  /** Mod-11 sum of the first 12 digits, weights 13 down to 2. */
  const residue = (digits: string) =>
    [...digits.slice(0, 12)].reduce((sum, digit, i) => sum + Number(digit) * (13 - i), 0) % 11
  const withCheckDigit = (first12: string) => first12 + ((11 - residue(first12)) % 10)

  const validId = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 12, maxLength: 12 })
    .map((digits) => withCheckDigit(digits.join('')))

  const replaceDigit = (id: string, position: number, digit: number) =>
    id.slice(0, position) + digit + id.slice(position + 1)

  /** A generated valid ID with one digit at `position` changed. */
  const typo = (position: fc.Arbitrary<number>) =>
    fc
      .tuple(validId, position, fc.integer({ min: 1, max: 9 }))
      .map(([id, at, shift]) => ({ id, at, typed: replaceDigit(id, at, (Number(id[at]) + shift) % 10) }))

  const accepts = (id: string) => parsePromptPayId(id) !== null

  it('accepts every correctly built ID', () => {
    fc.assert(fc.property(validId, (id) => accepts(id)))
  })

  it('always rejects a wrong 13th digit', () => {
    fc.assert(fc.property(typo(fc.constant(12)), ({ typed }) => !accepts(typed)))
  })

  it('always accepts a wrong 3rd digit, because its weight is 11', () => {
    fc.assert(fc.property(typo(fc.constant(2)), ({ typed }) => accepts(typed)))
  })

  it('lets any other typo through only between residues 0 and 10, which share check digit 1', () => {
    const otherPosition = fc.integer({ min: 0, max: 11 }).filter((at) => at !== 2)
    fc.assert(
      fc.property(typo(otherPosition), ({ id, typed }) => {
        const pair = [residue(id), residue(typed)].sort((a, b) => a - b)
        expect(accepts(typed)).toBe(pair[0] === 0 && pair[1] === 10)
      }),
      { numRuns: 2000 },
    )
  })

  it('accepts about 9% of all single-digit typos', () => {
    let accepted = 0
    let tried = 0
    for (const id of fc.sample(validId, { numRuns: 20_000, seed: 1 })) {
      for (let at = 0; at < 13; at += 1) {
        for (let digit = 0; digit < 10; digit += 1) {
          if (id[at] === String(digit)) continue
          tried += 1
          if (accepts(replaceDigit(id, at, digit))) accepted += 1
        }
      }
    }
    const percent = (100 * accepted) / tried
    console.info(`check digit accepts ${percent.toFixed(2)}% of ${tried} single-digit typos`)
    expect(percent).toBeGreaterThan(8.8)
    expect(percent).toBeLessThan(9.6)
  }, 60_000)
})

describe('buildPromptPayPayload', () => {
  it('builds a phone payload without an amount', () => {
    expect(buildPromptPayPayload('0801234567')).toBe(PHONE_PAYLOAD)
    expect(buildPromptPayPayload('080-123-4567')).toBe(PHONE_PAYLOAD)
  })

  it('builds an e-wallet payload', () => {
    expect(buildPromptPayPayload('012345678901234')).toBe(EWALLET_PAYLOAD)
  })

  it('builds a payload with an amount', () => {
    expect(buildPromptPayPayload('000-000-0000', 422)).toBe(AMOUNT_PAYLOAD)
  })

  it('builds a national ID payload with the same layout as the published one', () => {
    const payload = buildPromptPayPayload(VALID_NATIONAL_ID)
    const body = ID_PAYLOAD_BAD_CHECK_DIGIT.slice(0, -4).replace('1111111111111', VALID_NATIONAL_ID)
    expect(payload).toBe(body + crc16(body))
  })

  it('writes whole and large amounts with 2 decimals and no separators', () => {
    expect(buildPromptPayPayload('0801234567', 24000)).toContain('5406240.00')
    expect(buildPromptPayPayload('0801234567', MAX_SATANG)).toContain('5412999999999.99')
  })

  it('refuses an invalid ID', () => {
    expect(() => buildPromptPayPayload('1234567890122')).toThrow(RangeError)
  })

  it.each([0, -100, 1.5, MAX_SATANG + 1])('refuses the amount %d', (amount) => {
    expect(() => buildPromptPayPayload('0801234567', amount)).toThrow(RangeError)
  })
})
