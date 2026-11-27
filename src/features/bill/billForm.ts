// What the bill screen holds while it's being typed. Pure: no React, no storage.
import { isCalendarDate } from '../../domain/date'
import { MAX_SATANG, formatBaht, parseBaht, toDecimalString } from '../../domain/money'
import { computeBill, type BillBreakdown, type BillDraft, type BillIssue } from '../../domain/split'
import type { Bill, PersonId, Satang } from '../../domain/types'
import type { BillInput } from '../../storage/repository'
import { ME_ID } from '../../storage/schema'

export interface ItemRow {
  id: string
  name: string
  /** Exactly what was typed, so bad input is never silently changed. */
  priceText: string
  sharedBy: PersonId[]
}

export interface BillForm {
  /** Set when editing a saved bill. */
  id?: string
  /** Kept as stored: there is no group picker yet. */
  groupId?: string
  note?: string
  title: string
  date: string
  peopleIds: PersonId[]
  items: ItemRow[]
  serviceOn: boolean
  servicePctText: string
  vat: boolean
  discountText: string
  payerMode: 'me' | 'many'
  payerTexts: Record<PersonId, string>
}

export const QUICK_NAMES = ['อาหาร', 'เครื่องดื่ม', 'เบียร์', 'เหล้า', 'มิกเซอร์', 'น้ำแข็ง', 'ของหวาน']
export const WHOLE_BILL_NAME = 'หารเท่าทั้งบิล'
const DEFAULT_SERVICE_PCT = '10'

const blankRow = (id: string): ItemRow => ({ id, name: '', priceText: '', sharedBy: [] })

export const isBlankRow = (row: ItemRow): boolean =>
  row.name.trim() === '' && row.priceText.trim() === '' && row.sharedBy.length === 0

export function emptyForm(today: string, rowId: string): BillForm {
  return {
    title: '',
    date: today,
    peopleIds: [ME_ID],
    items: [blankRow(rowId)],
    serviceOn: true,
    servicePctText: DEFAULT_SERVICE_PCT,
    vat: false,
    discountText: '',
    payerMode: 'me',
    payerTexts: {},
  }
}

// ---- reading what was typed

/** 0–100 with up to 2 decimals, or NaN so the bill reports it. */
export function parseServicePct(text: string): number {
  const trimmed = text.trim()
  if (!/^(?=\.?\d)\d{0,3}(\.\d{0,2})?$/.test(trimmed)) return Number.NaN
  const value = Number(trimmed)
  return value <= 100 ? value : Number.NaN
}

/** Empty means "nothing", anything else unreadable stays invalid. */
const optionalAmount = (text: string): Satang => (text.trim() === '' ? 0 : (parseBaht(text) ?? Number.NaN))

export function priceError(row: ItemRow): string | null {
  if (isBlankRow(row)) return null
  if (row.priceText.trim() === '') return 'ยังไม่ได้ใส่ราคา'
  return parseBaht(row.priceText) === null ? 'ใส่ตัวเลข เช่น 1500 หรือ 0.50' : null
}

export function amountError(text: string): string | null {
  return Number.isNaN(optionalAmount(text)) ? 'ใส่ตัวเลข เช่น 1500 หรือ 0.50' : null
}

/** The bill as the domain sees it, plus the live calculation. */
export function evaluate(form: BillForm): { draft: BillDraft; breakdown: BillBreakdown } {
  const draft: BillDraft = {
    items: form.items
      .filter((row) => !isBlankRow(row))
      .map((row) => ({
        id: row.id,
        name: row.name.trim(),
        price: parseBaht(row.priceText) ?? Number.NaN,
        sharedBy: row.sharedBy,
      })),
    servicePct: form.serviceOn ? parseServicePct(form.servicePctText) : 0,
    vat: form.vat,
    discount: optionalAmount(form.discountText),
    payers: {},
  }
  if (form.payerMode === 'me') {
    draft.payers = { [ME_ID]: computeBill(draft).totals.total }
  } else {
    draft.payers = Object.fromEntries(
      form.peopleIds
        .map((id) => [id, optionalAmount(form.payerTexts[id] ?? '')] as const)
        .filter(([, paid]) => paid !== 0),
    )
  }
  return { draft, breakdown: computeBill(draft) }
}

export interface Problem {
  message: string
  step: 'items' | 'share'
  /** The row to go to, if the problem belongs to one. */
  rowId?: string
  /** True when the shown total leaves something out. */
  totalIncomplete: boolean
}

/** The one thing to say next to the save button. Null means it can be saved. */
export function firstProblem(form: BillForm, breakdown: BillBreakdown): Problem | null {
  const at = (step: Problem['step'], message: string, totalIncomplete = false, rowId?: string): Problem => ({
    message,
    step,
    totalIncomplete,
    ...(rowId === undefined ? {} : { rowId }),
  })
  const has = (type: BillIssue['type']) => breakdown.issues.some((issue) => issue.type === type)

  if (!isCalendarDate(form.date)) return at('items', 'ใส่วันที่ก่อน')
  if (has('no-items')) return at('items', 'ใส่รายการก่อน')

  const filled = form.items.filter((row) => !isBlankRow(row))
  const missing = filled.filter((row) => row.priceText.trim() === '')
  if (missing.length > 0) {
    return at('items', `ยังไม่ได้ใส่ราคา ${missing.length} รายการ · ยอดยังไม่รวม`, true, missing[0]!.id)
  }
  const unreadable = filled.filter((row) => parseBaht(row.priceText) === null)
  if (unreadable.length > 0) {
    return at('items', `ราคาผิด ${unreadable.length} รายการ · ยอดยังไม่รวม`, true, unreadable[0]!.id)
  }
  if (has('invalid-service-pct')) return at('items', '% เซอร์วิสไม่ถูกต้อง · ยอดยังไม่รวม', true)
  if (has('invalid-discount')) return at('items', 'ส่วนลดไม่ถูกต้อง · ยอดยังไม่หัก', true)
  if (has('discount-exceeds-subtotal')) return at('items', 'ส่วนลดมากกว่าค่าของ')
  if (has('total-too-large')) return at('items', `ยอดเกิน ${formatBaht(MAX_SATANG)}`)

  const unshared = breakdown.issues.flatMap((i) => (i.type === 'unshared-item' ? [i.itemId] : []))
  if (unshared.length > 0) {
    return at('share', `ยังไม่มีคนหาร ${unshared.length} รายการ`, false, unshared[0])
  }
  if (has('invalid-payment')) return at('share', 'ยอดคนจ่ายไม่ถูกต้อง')
  for (const issue of breakdown.issues) {
    if (issue.type === 'payer-mismatch') {
      return at(
        'share',
        issue.difference > 0
          ? `คนจ่ายยังขาด ${formatBaht(issue.difference)}`
          : `คนจ่ายเกินมา ${formatBaht(-issue.difference)}`,
      )
    }
  }
  return breakdown.issues.length > 0 ? at('items', 'บิลนี้ยังบันทึกไม่ได้') : null
}

export function sharerSummary(sharedBy: readonly PersonId[], peopleIds: readonly PersonId[]) {
  if (sharedBy.length === 0) return { kind: 'none', text: 'ยังไม่มีคนหาร' } as const
  const everyone = sharedBy.length === peopleIds.length && peopleIds.every((id) => sharedBy.includes(id))
  return everyone
    ? ({ kind: 'all', text: `ทุกคน (${peopleIds.length})` } as const)
    : ({ kind: 'some', text: `${sharedBy.length} จาก ${peopleIds.length} คน` } as const)
}

// ---- changes

const mapRows = (form: BillForm, change: (row: ItemRow) => ItemRow): BillForm => ({
  ...form,
  items: form.items.map(change),
})

export const updateRow = (form: BillForm, rowId: string, patch: Partial<Omit<ItemRow, 'id'>>): BillForm =>
  mapRows(form, (row) => (row.id === rowId ? { ...row, ...patch } : row))

export const addRow = (form: BillForm, rowId: string): BillForm => ({
  ...form,
  items: [...form.items, blankRow(rowId)],
})

/** `spareId` is used if this was the last row, so there is always one to type in. */
export function removeRow(form: BillForm, rowId: string, spareId: string): BillForm {
  const items = form.items.filter((row) => row.id !== rowId)
  return { ...form, items: items.length > 0 ? items : [blankRow(spareId)] }
}

export function splitWholeBill(form: BillForm, rowId: string): BillForm {
  const row: ItemRow = { id: rowId, name: WHOLE_BILL_NAME, priceText: '', sharedBy: [...form.peopleIds] }
  return { ...form, items: [...form.items.filter((r) => !isBlankRow(r)), row] }
}

/** Puts a quick name where it was most likely meant. Returns the row that got it. */
export function quickName(
  form: BillForm,
  name: string,
  activeRowId: string | undefined,
  newRowId: string,
): { form: BillForm; rowId: string } {
  const active = form.items.find((row) => row.id === activeRowId)
  const last = form.items.at(-1)
  const target = [active, last].find((row) => row !== undefined && row.name.trim() === '')
  if (target) return { form: updateRow(form, target.id, { name }), rowId: target.id }
  return { form: updateRow(addRow(form, newRowId), newRowId, { name }), rowId: newRowId }
}

export const addPerson = (form: BillForm, personId: PersonId): BillForm =>
  form.peopleIds.includes(personId) ? form : { ...form, peopleIds: [...form.peopleIds, personId] }

export function personUsage(form: BillForm, personId: PersonId) {
  return {
    items: form.items.filter((row) => row.sharedBy.includes(personId)).length,
    paid: form.payerMode === 'many' && (form.payerTexts[personId] ?? '').trim() !== '',
  }
}

export function removePerson(form: BillForm, personId: PersonId): BillForm {
  const { [personId]: _, ...payerTexts } = form.payerTexts
  return {
    ...mapRows(form, (row) => ({ ...row, sharedBy: row.sharedBy.filter((id) => id !== personId) })),
    peopleIds: form.peopleIds.filter((id) => id !== personId),
    payerTexts,
  }
}

export const toggleSharer = (form: BillForm, rowId: string, personId: PersonId): BillForm =>
  mapRows(form, (row) => {
    if (row.id !== rowId) return row
    const sharedBy = row.sharedBy.includes(personId)
      ? row.sharedBy.filter((id) => id !== personId)
      : [...row.sharedBy, personId]
    return { ...row, sharedBy }
  })

/** Replaces who shares each of these rows. */
export const setSharers = (form: BillForm, rowIds: readonly string[], personIds: readonly PersonId[]): BillForm =>
  mapRows(form, (row) => (rowIds.includes(row.id) ? { ...row, sharedBy: [...personIds] } : row))

export function setPayerMode(form: BillForm, payerMode: BillForm['payerMode'], total: Satang): BillForm {
  const untouched = Object.keys(form.payerTexts).length === 0
  if (payerMode === 'many' && untouched && total > 0) {
    return {
      ...addPerson(form, ME_ID),
      payerMode,
      payerTexts: { [ME_ID]: toDecimalString(total) },
    }
  }
  return { ...form, payerMode }
}

// ---- saved bills

export function fromBill(bill: Bill, spareRowId: string): BillForm {
  const involved = new Set([
    ...bill.items.flatMap((item) => item.sharedBy),
    ...Object.keys(bill.owed),
    ...Object.keys(bill.payers),
  ])
  const peopleIds = [...involved].sort((a, b) => Number(b === ME_ID) - Number(a === ME_ID))
  const payers = Object.entries(bill.payers)
  const iPaidAll = payers.length === 1 && payers[0]![0] === ME_ID
  const rows = bill.items.map((item) => ({
    id: item.id,
    name: item.name,
    priceText: toDecimalString(item.price),
    sharedBy: [...item.sharedBy],
  }))

  return {
    id: bill.id,
    ...(bill.groupId === undefined ? {} : { groupId: bill.groupId }),
    ...(bill.note === undefined ? {} : { note: bill.note }),
    title: bill.title,
    date: bill.date,
    peopleIds,
    items: rows.length > 0 ? rows : [blankRow(spareRowId)],
    serviceOn: bill.servicePct > 0,
    servicePctText: bill.servicePct > 0 ? String(bill.servicePct) : DEFAULT_SERVICE_PCT,
    vat: bill.vat,
    discountText: bill.discount > 0 ? toDecimalString(bill.discount) : '',
    payerMode: iPaidAll ? 'me' : 'many',
    payerTexts: iPaidAll ? {} : Object.fromEntries(payers.map(([id, paid]) => [id, toDecimalString(paid)])),
  }
}

/** What to hand to `repository.saveBill`, which works out `owed` itself. */
export function toBillInput(form: BillForm, draft: BillDraft): BillInput {
  return {
    ...draft,
    ...(form.id === undefined ? {} : { id: form.id }),
    ...(form.groupId === undefined ? {} : { groupId: form.groupId }),
    ...(form.note === undefined ? {} : { note: form.note }),
    title: form.title.trim(),
    date: form.date,
  }
}
