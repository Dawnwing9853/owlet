// PromptPay QR payload (EMVCo merchant-presented mode).
import { isAmount, toDecimalString } from './money'
import type { Satang } from './types'

export type PromptPayIdType = 'phone' | 'nationalId' | 'ewallet'

export interface PromptPayId {
  type: PromptPayIdType
  /** Digits only. */
  value: string
}

const PROMPTPAY_AID = 'A000000677010111'
const ID_TAG: Record<PromptPayIdType, string> = { phone: '01', nationalId: '02', ewallet: '03' }

/** Thai national ID: the 13th digit is a mod-11 check of the first 12. */
function hasValidCheckDigit(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (13 - i)
  return (11 - (sum % 11)) % 10 === Number(digits[12])
}

/** Accepts spaces and hyphens. Returns null if the ID isn't valid. */
export function parsePromptPayId(input: string): PromptPayId | null {
  const value = input.replace(/[\s-]/g, '')
  if (/^0\d{9}$/.test(value)) return { type: 'phone', value }
  if (/^\d{13}$/.test(value) && hasValidCheckDigit(value)) return { type: 'nationalId', value }
  if (/^\d{15}$/.test(value)) return { type: 'ewallet', value }
  return null
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) of an ASCII string, as uppercase hex. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Tag, 2-digit length, value. */
function field(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`
}

export function buildPromptPayPayload(id: string, amount?: Satang): string {
  const parsed = parsePromptPayId(id)
  if (!parsed) throw new RangeError('invalid PromptPay ID')
  if (amount !== undefined && !(isAmount(amount) && amount > 0)) {
    throw new RangeError(`invalid PromptPay amount: ${amount}`)
  }

  const target = parsed.type === 'phone' ? `0066${parsed.value.slice(1)}` : parsed.value
  const body = [
    field('00', '01'),
    field('01', amount === undefined ? '11' : '12'),
    field('29', field('00', PROMPTPAY_AID) + field(ID_TAG[parsed.type], target)),
    field('58', 'TH'),
    field('53', '764'),
    amount === undefined ? '' : field('54', toDecimalString(amount)),
    '6304', // the CRC covers its own tag and length
  ].join('')
  return body + crc16(body)
}
