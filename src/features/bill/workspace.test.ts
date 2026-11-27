import { describe, expect, it } from 'vitest'
import type { Bill } from '../../domain/types'
import { emptyForm, evaluate, setPayerMode, toggleSharer, updateRow, addRow } from './billForm'
import {
  afterDelete,
  afterSave,
  changeForm,
  currentForm,
  hasUnsavedChanges,
  needsDiscard,
  newWorkspace,
  startEdit,
  stopEdit,
} from './workspace'

const bill = (id: string, title = id): Bill => ({
  kind: 'bill',
  id,
  title,
  date: '2026-11-01',
  items: [{ id: 'x', name: 'ชุด', price: 20000, sharedBy: ['me', 'ton'] }],
  payers: { me: 22000 },
  servicePct: 10,
  vat: false,
  discount: 0,
  owed: { me: 11000, ton: 11000 },
})

const halfTyped = () => {
  const ws = newWorkspace('2026-11-27', 'r1')
  return changeForm(ws, updateRow(currentForm(ws), 'r1', { name: 'น้ำแข็ง', priceText: '4' }))
}

describe('workspace', () => {
  it('starts on a new bill', () => {
    const ws = newWorkspace('2026-11-27', 'r1')
    expect(currentForm(ws)).toEqual(emptyForm('2026-11-27', 'r1'))
    expect(ws.edit).toBeNull()
    expect(hasUnsavedChanges(ws)).toBe(false)
  })

  it('sets a half-typed new bill aside while editing, and brings it back', () => {
    const before = halfTyped()
    const editing = startEdit(before, bill('a'), 'spare')
    expect(currentForm(editing)).toMatchObject({ id: 'a', title: 'a' })
    expect(currentForm(stopEdit(editing))).toEqual(currentForm(before))
  })

  it('keeps changes to the draft and to the edit apart', () => {
    let ws = startEdit(halfTyped(), bill('a'), 'spare')
    ws = changeForm(ws, { ...currentForm(ws), title: 'changed' })
    expect(ws.edit!.form.title).toBe('changed')
    expect(ws.draft.title).toBe('')
  })

  it('brings the draft back after an edit is saved', () => {
    const before = halfTyped()
    const saved = afterSave(startEdit(before, bill('a'), 'spare'), emptyForm('2026-11-27', 'fresh'))
    expect(saved.edit).toBeNull()
    expect(currentForm(saved)).toEqual(currentForm(before))
  })

  it('starts a fresh bill after a new one is saved', () => {
    const saved = afterSave(halfTyped(), emptyForm('2026-11-28', 'fresh'))
    expect(currentForm(saved)).toEqual(emptyForm('2026-11-28', 'fresh'))
  })

  it('ends the edit when the bill being edited is deleted, but not for another one', () => {
    const editing = startEdit(halfTyped(), bill('a'), 'spare')
    expect(afterDelete(editing, 'b')).toBe(editing)
    expect(afterDelete(editing, 'a').edit).toBeNull()
    expect(afterDelete(halfTyped(), 'a')).toEqual(halfTyped())
  })

  it('carries on with the same edit rather than reloading it', () => {
    let ws = startEdit(halfTyped(), bill('a'), 'spare')
    ws = changeForm(ws, { ...currentForm(ws), title: 'changed' })
    expect(startEdit(ws, bill('a'), 'spare')).toBe(ws)
    expect(needsDiscard(ws, 'a')).toBe(false)
  })

  it('asks before dropping unsaved changes for another bill, and only then', () => {
    const untouched = startEdit(halfTyped(), bill('a'), 'spare')
    expect(needsDiscard(untouched, 'b')).toBe(false)
    const changed = changeForm(untouched, { ...currentForm(untouched), title: 'changed' })
    expect(needsDiscard(changed, 'b')).toBe(true)
    // A half-typed new bill is set aside, never dropped, so it needs no question.
    expect(needsDiscard(halfTyped(), 'b')).toBe(false)
  })

  it.each([
    ['a price', (ws: ReturnType<typeof startEdit>) => updateRow(currentForm(ws), 'x', { priceText: '201' })],
    ['an unreadable price', (ws: ReturnType<typeof startEdit>) => updateRow(currentForm(ws), 'x', { priceText: 'abc' })],
    ['an item name', (ws: ReturnType<typeof startEdit>) => updateRow(currentForm(ws), 'x', { name: 'อื่น' })],
    ['who shares', (ws: ReturnType<typeof startEdit>) => toggleSharer(currentForm(ws), 'x', 'ton')],
    ['the date', (ws: ReturnType<typeof startEdit>) => ({ ...currentForm(ws), date: '2026-11-02' })],
    ['service', (ws: ReturnType<typeof startEdit>) => ({ ...currentForm(ws), serviceOn: false })],
    ['VAT', (ws: ReturnType<typeof startEdit>) => ({ ...currentForm(ws), vat: true })],
    ['the discount', (ws: ReturnType<typeof startEdit>) => ({ ...currentForm(ws), discountText: '1' })],
    ['a half-added row', (ws: ReturnType<typeof startEdit>) => updateRow(addRow(currentForm(ws), 'n'), 'n', { name: 'ใหม่' })],
  ])('sees a change to %s', (_, change) => {
    const ws = startEdit(halfTyped(), bill('a'), 'spare')
    expect(hasUnsavedChanges(changeForm(ws, change(ws)))).toBe(true)
  })

  it.each([
    ['an empty extra row', (ws: ReturnType<typeof startEdit>) => addRow(currentForm(ws), 'empty')],
    ['the same price typed differently', (ws: ReturnType<typeof startEdit>) => updateRow(currentForm(ws), 'x', { priceText: '200' })],
    [
      'unticking and re-ticking a person',
      (ws: ReturnType<typeof startEdit>) => toggleSharer(toggleSharer(currentForm(ws), 'x', 'me'), 'x', 'me'),
    ],
    [
      'trying "several payers" and going back',
      (ws: ReturnType<typeof startEdit>) => {
        const form = currentForm(ws)
        const total = evaluate(form).breakdown.totals.total
        return setPayerMode(setPayerMode(form, 'many', total), 'me', total)
      },
    ],
  ])('does not count %s as a change', (_, change) => {
    const ws = startEdit(halfTyped(), bill('a'), 'spare')
    expect(hasUnsavedChanges(changeForm(ws, change(ws)))).toBe(false)
  })
})
