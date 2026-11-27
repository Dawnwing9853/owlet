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
    '0123456789012345', // 16 digits
    '+66801234567',
    '080123456a',
    '080.123.4567',
  ])('rejects %j', (input) => {
    expect(parsePromptPayId(input)).toBeNull()
  })

  // The check digit is a typo filter, not a guarantee. It misses about 9% of
  // single-digit typos, so the payee name in the bank app is still the real check.
  describe('check digit limits', () => {
    const typosAt = (position: number) =>
      [...'0123456789']
        .filter((digit) => digit !== VALID_NATIONAL_ID[position])
        .map((digit) => VALID_NATIONAL_ID.slice(0, position) + digit + VALID_NATIONAL_ID.slice(position + 1))
    const accepted = (ids: string[]) => ids.filter((id) => parsePromptPayId(id) !== null)

    it('catches every wrong check digit', () => {
      expect(accepted(typosAt(12))).toEqual([])
    })

    it('cannot catch any typo in the 3rd digit, whose weight is 11', () => {
      expect(accepted(typosAt(2))).toHaveLength(9)
    })

    it('catches all but these other typos of the sample ID', () => {
      const positions = Array.from({ length: 13 }, (_, i) => i).filter((i) => i !== 2)
      expect(accepted(positions.flatMap(typosAt))).toHaveLength(9)
    })
  })
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
