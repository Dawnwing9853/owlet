// The bill screen works on a new bill, or on a saved one being edited. A
// half-typed new bill is set aside during an edit. Pure, kept in memory only.
import type { Bill } from '../../domain/types'
import { emptyForm, evaluate, fromBill, isBlankRow, toBillInput, type BillForm } from './billForm'

export interface Workspace {
  draft: BillForm
  edit: { form: BillForm; original: BillForm } | null
}

export const newWorkspace = (today: string, rowId: string): Workspace => ({
  draft: emptyForm(today, rowId),
  edit: null,
})

export const currentForm = (ws: Workspace): BillForm => ws.edit?.form ?? ws.draft

export const changeForm = (ws: Workspace, form: BillForm): Workspace =>
  ws.edit ? { ...ws, edit: { ...ws.edit, form } } : { ...ws, draft: form }

/**
 * What saving would store, in a fixed order, so that only real differences
 * count. Text that can't be read is kept as typed.
 */
function fingerprint(form: BillForm): string {
  const input = toBillInput(form, evaluate(form).draft)
  const rows = form.items.filter((row) => !isBlankRow(row))
  return JSON.stringify([
    input.title,
    input.date,
    input.items.map((item, i) => [
      item.name,
      Number.isNaN(item.price) ? rows[i]!.priceText : item.price,
      [...item.sharedBy].sort(),
    ]),
    Object.entries(input.payers)
      .map(([id, paid]) => [id, Number.isNaN(paid) ? form.payerTexts[id] : paid])
      .sort(),
    Number.isNaN(input.servicePct) ? form.servicePctText : input.servicePct,
    input.vat,
    Number.isNaN(input.discount) ? form.discountText : input.discount,
  ])
}

export const hasUnsavedChanges = (ws: Workspace): boolean =>
  ws.edit !== null && fingerprint(ws.edit.form) !== fingerprint(ws.edit.original)

/** True if editing `billId` now would throw away changes to a different bill. */
export const needsDiscard = (ws: Workspace, billId: string): boolean =>
  ws.edit !== null && ws.edit.form.id !== billId && hasUnsavedChanges(ws)

/** The caller must ask first when `needsDiscard` says so. */
export function startEdit(ws: Workspace, bill: Bill, spareRowId: string): Workspace {
  if (ws.edit?.form.id === bill.id) return ws
  const form = fromBill(bill, spareRowId)
  return { ...ws, edit: { form, original: form } }
}

export const stopEdit = (ws: Workspace): Workspace => ({ ...ws, edit: null })

/** After an edit the draft comes back. After a new bill, a fresh one starts. */
export const afterSave = (ws: Workspace, freshDraft: BillForm): Workspace =>
  ws.edit ? stopEdit(ws) : { draft: freshDraft, edit: null }

export const afterDelete = (ws: Workspace, billId: string): Workspace =>
  ws.edit?.form.id === billId ? stopEdit(ws) : ws
