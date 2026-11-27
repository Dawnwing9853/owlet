import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { finalizeBill } from '../../domain/split'
import { validBillDraft } from '../../domain/testing/arbitraries'
import type { Bill } from '../../domain/types'
import {
  addPerson,
  addRow,
  emptyForm,
  evaluate,
  firstProblem,
  fromBill,
  parseServicePct,
  personUsage,
  priceError,
  quickName,
  removePerson,
  removeRow,
  setPayerMode,
  setSharers,
  sharerSummary,
  splitWholeBill,
  toBillInput,
  toggleSharer,
  updateRow,
  type BillForm,
} from './billForm'

let counter = 0
const nextId = () => `i-${(counter += 1)}`

const start = (over: Partial<BillForm> = {}): BillForm => ({ ...emptyForm('2026-11-27', 'first'), ...over })

/** A form with two friends and these rows already typed. */
function typed(...rows: [name: string, price: string, sharedBy?: string[]][]): BillForm {
  return start({
    peopleIds: ['me', 'ton', 'mew'],
    items: rows.map(([name, priceText, sharedBy = []], i) => ({ id: `r${i}`, name, priceText, sharedBy })),
  })
}

const problem = (form: BillForm) => firstProblem(form, evaluate(form).breakdown)

describe('a new bill', () => {
  it('starts today with me in it, one empty row, service 10% on and VAT off', () => {
    expect(start()).toMatchObject({
      date: '2026-11-27',
      peopleIds: ['me'],
      items: [{ id: 'first', name: '', priceText: '', sharedBy: [] }],
      serviceOn: true,
      servicePctText: '10',
      vat: false,
      discountText: '',
      payerMode: 'me',
    })
  })

  it('ignores completely empty rows, and asks for items', () => {
    expect(evaluate(start()).draft.items).toEqual([])
    expect(problem(start())).toMatchObject({ message: 'ใส่รายการก่อน', step: 'items' })
  })
})

describe('the total while typing', () => {
  it('counts every priced row before anyone is chosen, and I pay it all', () => {
    const { breakdown, draft } = evaluate(typed(['หมู', '1,200'], ['เบียร์', '540.50']))
    expect(breakdown.totals.total).toBe(191455) // 1,740.50 + 10%
    expect(draft.payers).toEqual({ me: 191455 })
  })

  it.each(['1,5', '12.345', 'abc', '-5', '1 000', '.'])(
    'never reads the price %j as zero: it is flagged and left out',
    (priceText) => {
      const form = typed(['ok', '100', ['me']], ['bad', priceText, ['me']])
      expect(form.items[1]!.priceText).toBe(priceText)
      expect(priceError(form.items[1]!)).toBe('ใส่ตัวเลข เช่น 1500 หรือ 0.50')
      expect(evaluate(form).breakdown.totals.subtotal).toBe(10000)
      expect(problem(form)).toMatchObject({
        message: 'ราคาผิด 1 รายการ · ยอดยังไม่รวม',
        step: 'items',
        rowId: 'r1',
        totalIncomplete: true,
      })
      expect(finalizeBill(evaluate(form).draft).ok).toBe(false)
    },
  )

  it('treats a named row without a price as missing, not free', () => {
    const form = typed(['น้ำแข็ง', '', ['me']])
    expect(priceError(form.items[0]!)).toBe('ยังไม่ได้ใส่ราคา')
    expect(problem(form)).toMatchObject({ message: 'ยังไม่ได้ใส่ราคา 1 รายการ · ยอดยังไม่รวม', rowId: 'r0' })
    expect(finalizeBill(evaluate(form).draft).ok).toBe(false)
  })

  it('accepts a real 0-baht item typed as 0', () => {
    const form = typed(['แถม', '0', ['me']])
    expect(priceError(form.items[0]!)).toBeNull()
    expect(problem(form)).toBeNull()
  })

  it.each([
    ['', 'ใส่วันที่ก่อน'],
    ['2026-02-30', 'ใส่วันที่ก่อน'],
  ])('needs a real date, not %j', (date, message) => {
    expect(problem({ ...typed(['a', '1', ['me']]), date })).toMatchObject({ message, step: 'items' })
  })
})

describe('service charge and discount', () => {
  it.each([
    ['10', 10],
    ['7.5', 7.5],
    ['7.35', 7.35],
    ['0', 0],
    ['100', 100],
    [' 5 ', 5],
  ])('reads the service charge %j', (text, value) => {
    expect(parseServicePct(text)).toBe(value)
  })

  it.each(['', '101', '-1', '7,5', '1.234', 'x', '.'])('rejects the service charge %j', (text) => {
    expect(parseServicePct(text)).toBeNaN()
  })

  it('flags a bad percentage rather than charging nothing', () => {
    const form = { ...typed(['a', '100', ['me']]), servicePctText: '' }
    expect(problem(form)).toMatchObject({ message: '% เซอร์วิสไม่ถูกต้อง · ยอดยังไม่รวม' })
  })

  it('ignores the percentage while service is switched off', () => {
    const form = { ...typed(['a', '100', ['me']]), serviceOn: false, servicePctText: 'junk' }
    expect(evaluate(form).draft.servicePct).toBe(0)
    expect(problem(form)).toBeNull()
  })

  it('treats an empty discount as none, and flags a bad one', () => {
    const form = typed(['a', '100', ['me']])
    expect(evaluate(form).draft.discount).toBe(0)
    expect(problem({ ...form, discountText: '1,5' })).toMatchObject({
      message: 'ส่วนลดไม่ถูกต้อง · ยอดยังไม่หัก',
    })
    expect(problem({ ...form, discountText: '100.01' })).toMatchObject({ message: 'ส่วนลดมากกว่าค่าของ' })
  })

  it('says when the total is over the limit', () => {
    const form = typed(['a', '999999999.99', ['me']])
    expect(problem(form)).toMatchObject({ message: 'ยอดเกิน ฿999,999,999.99' })
  })
})

describe('who shares', () => {
  it('blocks saving until every item has someone, and goes to that row', () => {
    const form = typed(['a', '10', ['me']], ['b', '20'], ['c', '30'])
    expect(problem(form)).toMatchObject({
      message: 'ยังไม่มีคนหาร 2 รายการ',
      step: 'share',
      rowId: 'r1',
      totalIncomplete: false,
    })
  })

  it('toggles one person on one item', () => {
    let form = typed(['a', '10'])
    form = toggleSharer(form, 'r0', 'ton')
    form = toggleSharer(form, 'r0', 'me')
    form = toggleSharer(form, 'r0', 'ton')
    expect(form.items[0]!.sharedBy).toEqual(['me'])
  })

  it('assigning several items at once replaces who shared them, and only them', () => {
    const form = setSharers(typed(['a', '1', ['mew']], ['b', '2'], ['c', '3', ['mew']]), ['r0', 'r1'], ['me', 'ton'])
    expect(form.items.map((i) => i.sharedBy)).toEqual([['me', 'ton'], ['me', 'ton'], ['mew']])
  })

  it('labels none, everyone and some', () => {
    const people = ['me', 'ton', 'mew']
    expect(sharerSummary([], people)).toEqual({ kind: 'none', text: 'ยังไม่มีคนหาร' })
    expect(sharerSummary(['mew', 'me', 'ton'], people)).toEqual({ kind: 'all', text: 'ทุกคน (3)' })
    expect(sharerSummary(['me'], people)).toEqual({ kind: 'some', text: '1 จาก 3 คน' })
  })

  it('does not add a later person to items that were "everyone"', () => {
    const everyone = setSharers(typed(['a', '30']), ['r0'], ['me', 'ton', 'mew'])
    const later = addPerson(everyone, 'kai')
    expect(later.items[0]!.sharedBy).toEqual(['me', 'ton', 'mew'])
    expect(sharerSummary(later.items[0]!.sharedBy, later.peopleIds).text).toBe('3 จาก 4 คน')
  })

  it('does not add the same person twice', () => {
    expect(addPerson(typed(['a', '1']), 'ton').peopleIds).toEqual(['me', 'ton', 'mew'])
  })
})

describe('removing a person', () => {
  const used: BillForm = {
    ...typed(['a', '10', ['me', 'ton']], ['b', '20', ['ton']], ['c', '30', ['me']]),
    payerMode: 'many',
    payerTexts: { me: '50', ton: '16' },
  }

  it('reports where they are used, so the app can ask first', () => {
    expect(personUsage(used, 'ton')).toEqual({ items: 2, paid: true })
    expect(personUsage(used, 'mew')).toEqual({ items: 0, paid: false })
    // A payer amount left over from "many" mode doesn't count while I pay it all.
    expect(personUsage({ ...used, payerMode: 'me' }, 'ton')).toEqual({ items: 2, paid: false })
  })

  it('takes them out of every item and the payers', () => {
    const after = removePerson(used, 'ton')
    expect(after.peopleIds).toEqual(['me', 'mew'])
    expect(after.items.map((i) => i.sharedBy)).toEqual([['me'], [], ['me']])
    expect(after.payerTexts).toEqual({ me: '50' })
  })
})

describe('rows', () => {
  it('adds, edits and removes rows, always leaving one to type in', () => {
    let form = start()
    form = updateRow(form, 'first', { name: 'หมู', priceText: '10' })
    form = addRow(form, 'second')
    expect(form.items.map((i) => i.id)).toEqual(['first', 'second'])
    form = removeRow(form, 'first', 'unused')
    expect(form.items.map((i) => i.id)).toEqual(['second'])
    form = removeRow(form, 'second', 'fresh')
    expect(form.items).toEqual([{ id: 'fresh', name: '', priceText: '', sharedBy: [] }])
  })

  it('"split the whole bill" makes one item shared by everyone, reusing the empty row', () => {
    const form = splitWholeBill({ ...start(), peopleIds: ['me', 'ton'] }, 'whole')
    expect(form.items).toEqual([{ id: 'whole', name: 'หารเท่าทั้งบิล', priceText: '', sharedBy: ['me', 'ton'] }])
    expect(splitWholeBill(typed(['a', '1']), 'whole').items.map((i) => i.id)).toEqual(['r0', 'whole'])
  })

  it('a quick name fills the row being edited if it has no name', () => {
    const form = typed(['', '10'], ['', ''])
    const result = quickName(form, 'เบียร์', 'r0', 'new')
    expect(result.form.items[0]!.name).toBe('เบียร์')
    expect(result.rowId).toBe('r0')
  })

  it('a quick name otherwise fills the empty last row, or adds one', () => {
    const intoLast = quickName(typed(['a', '10'], ['', '']), 'เหล้า', 'r0', 'new')
    expect(intoLast.rowId).toBe('r1')
    expect(intoLast.form.items.map((i) => i.name)).toEqual(['a', 'เหล้า'])
    const added = quickName(typed(['a', '10']), 'เหล้า', undefined, 'new')
    expect(added.rowId).toBe('new')
    expect(added.form.items.map((i) => i.name)).toEqual(['a', 'เหล้า'])
  })
})

describe('payers', () => {
  const form = { ...typed(['a', '100', ['me', 'ton']]), serviceOn: false }

  it('"I paid it all" follows the total', () => {
    expect(evaluate(form).draft.payers).toEqual({ me: 10000 })
    expect(evaluate(updateRow(form, 'r0', { priceText: '250' })).draft.payers).toEqual({ me: 25000 })
  })

  it('switching to several payers starts with me paying the current total', () => {
    const many = setPayerMode(form, 'many', 10000)
    expect(many.payerTexts).toEqual({ me: '100.00' })
    expect(problem(many)).toBeNull()
    expect(setPayerMode(form, 'many', 0).payerTexts).toEqual({})
  })

  it('keeps what was typed when switching back and forth', () => {
    const typedAmounts = { ...setPayerMode(form, 'many', 10000), payerTexts: { me: '60', ton: '40' } }
    const back = setPayerMode(setPayerMode(typedAmounts, 'me', 10000), 'many', 10000)
    expect(back.payerTexts).toEqual({ me: '60', ton: '40' })
  })

  it('says how much is missing or extra', () => {
    const many: BillForm = { ...form, payerMode: 'many', payerTexts: { me: '60', ton: '' } }
    expect(problem(many)).toMatchObject({ message: 'คนจ่ายยังขาด ฿40.00', step: 'share' })
    expect(problem({ ...many, payerTexts: { me: '60', ton: '45.50' } })).toMatchObject({
      message: 'คนจ่ายเกินมา ฿5.50',
    })
  })

  it('flags a bad payment instead of reading it as zero', () => {
    const many: BillForm = { ...form, payerMode: 'many', payerTexts: { me: '100', ton: '1,5' } }
    expect(problem(many)).toMatchObject({ message: 'ยอดคนจ่ายไม่ถูกต้อง', step: 'share' })
  })

  it('drops empty and zero payments', () => {
    const many: BillForm = { ...form, payerMode: 'many', payerTexts: { me: '100', ton: '0', mew: '  ' } }
    expect(evaluate(many).draft.payers).toEqual({ me: 10000 })
  })
})

describe('editing a saved bill', () => {
  const saved: Bill = {
    kind: 'bill',
    id: 'b-1',
    title: 'ชาบู',
    date: '2026-11-01',
    groupId: 'gone',
    note: 'kept',
    items: [{ id: 'x', name: 'ชุด', price: 20000, sharedBy: ['ton', 'mew'] }],
    payers: { ton: 21400 },
    servicePct: 0,
    vat: true,
    discount: 0,
    owed: { mew: 10700, ton: 10700 },
  }

  it('fills the form, and keeps the group and note it cannot show', () => {
    const form = fromBill(saved, 'blank')
    expect(form).toMatchObject({
      id: 'b-1',
      groupId: 'gone',
      note: 'kept',
      peopleIds: ['ton', 'mew'],
      serviceOn: false,
      servicePctText: '10',
      discountText: '',
      payerMode: 'many',
      payerTexts: { ton: '214.00' },
    })
    expect(toBillInput(form, evaluate(form).draft)).toEqual({
      id: 'b-1',
      title: 'ชาบู',
      date: '2026-11-01',
      groupId: 'gone',
      note: 'kept',
      items: saved.items,
      payers: saved.payers,
      servicePct: 0,
      vat: true,
      discount: 0,
    })
  })

  it('reopens as "I paid it all" when that is what happened, with me listed first', () => {
    const mine: Bill = { ...saved, payers: { me: 21400 }, owed: { mew: 10700, me: 10700 }, items: [{ ...saved.items[0]!, sharedBy: ['mew', 'me'] }] }
    expect(fromBill(mine, 'blank')).toMatchObject({ payerMode: 'me', peopleIds: ['me', 'mew'] })
  })

  it('gives back the same owed amounts for any valid bill', () => {
    fc.assert(
      fc.property(validBillDraft, (draft) => {
        const first = finalizeBill(draft)
        if (!first.ok) throw new Error('generator made an invalid bill')
        const bill: Bill = { kind: 'bill', id: 'b', title: 't', date: '2026-01-01', ...draft, owed: first.owed }
        const again = finalizeBill(evaluate(fromBill(bill, 'blank')).draft)
        expect(again).toEqual(first)
      }),
      { numRuns: 500 },
    )
  })

  it('trims the title and item names when saving', () => {
    const form = { ...typed([' หมู ', '1', ['me']]), title: '  ทริป  ' }
    const input = toBillInput(form, evaluate(form).draft)
    expect(input.title).toBe('ทริป')
    expect(input.items[0]!.name).toBe('หมู')
    expect(Object.keys(input)).not.toContain('id')
  })

  it('works with ids from any source', () => {
    expect(addRow(start(), nextId()).items).toHaveLength(2)
  })
})
