import { CircleCheck, TriangleAlert, X } from 'lucide-react'
import { useDeferredValue, useEffect, useState, type KeyboardEvent } from 'react'
import { toLocalDate } from '../../domain/date'
import { formatBaht } from '../../domain/money'
import type { Bill, Person, PersonId } from '../../domain/types'
import { newId } from '../../storage/ids'
import type { AppData } from '../../storage/parse'
import type { BillInput, SaveFailure, SaveResult } from '../../storage/repository'
import { AssignDialog } from './AssignDialog'
import { ItemsStep } from './ItemsStep'
import { LiveReceipt } from './LiveReceipt'
import { PeopleSection } from './PeopleSection'
import { ShareStep } from './ShareStep'
import { nameFieldId, priceFieldId, shareRowId } from './fieldIds'
import {
  emptyForm,
  evaluate,
  firstProblem,
  isBlankRow,
  setSharers,
  toBillInput,
  type BillForm,
  type Problem,
} from './billForm'

type Step = 'items' | 'share'

const STEPS: [Step, string][] = [
  ['items', '1 รายการ'],
  ['share', '2 ใครหาร'],
]

const SAVE_FAILURE: Record<SaveFailure['reason'], string> = {
  'write-failed': 'บันทึกไม่ได้ พื้นที่ในเครื่องอาจเต็ม ที่กรอกไว้ยังอยู่',
  'store-unavailable': 'เปิดข้อมูลในเครื่องไม่ได้ ที่กรอกไว้ยังอยู่ ลองกดบันทึกอีกที',
  'unknown-person': 'มีคนในบิลที่ไม่อยู่ในรายชื่อแล้ว เอาคนนั้นออกแล้วลองใหม่',
  'invalid-bill': 'บิลนี้ยังบันทึกไม่ได้ เช็กข้อมูลอีกรอบ',
  'invalid-data': 'บิลนี้ยังบันทึกไม่ได้ เช็กข้อมูลอีกรอบ',
}

const newForm = () => emptyForm(toLocalDate(new Date()), newId('i'))

interface Props {
  data: AppData
  onSaveBill: (input: BillInput) => SaveResult<Bill>
  onAddPerson: (name: string) => SaveResult<Person>
  initialForm?: BillForm
}

export function BillScreen({ data, onSaveBill, onAddPerson, initialForm }: Props) {
  const [form, setForm] = useState(() => initialForm ?? newForm())
  const [step, setStep] = useState<Step>('items')
  const [selected, setSelected] = useState<string[]>([])
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [saved, setSaved] = useState<Bill | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ id: string } | null>(null)

  const { draft, breakdown } = evaluate(form)
  const problem = firstProblem(form, breakdown)
  // With 30 people the receipt is the slow part, so typing doesn't wait for it.
  const receiptForm = useDeferredValue(form)

  const pickable = data.people.filter((p) => !p.archived || form.peopleIds.includes(p.id))
  const inBill = data.people.filter((p) => form.peopleIds.includes(p.id))
  const ticked = selected.filter((id) => form.items.some((row) => row.id === id && !isBlankRow(row)))

  useEffect(() => {
    if (!focusTarget) return
    const element = document.getElementById(focusTarget.id)
    if (!element) return
    element.focus({ preventScroll: true })
    // An open row with 30 people is taller than the screen: keep its title in view.
    const tall = element.offsetHeight > window.innerHeight / 2
    element.scrollIntoView({ block: tall ? 'start' : 'center' })
  }, [focusTarget])

  const focusLater = (id: string) => setFocusTarget({ id })

  function change(next: BillForm) {
    setForm(next)
    setSaved(null)
    setFailure(null)
  }

  function goTo({ step: target, rowId }: Problem) {
    setStep(target)
    if (target === 'share') {
      if (rowId) setOpenRow(rowId)
      focusLater(rowId ? shareRowId(rowId) : 'payers')
      return
    }
    if (rowId) {
      const row = form.items.find((r) => r.id === rowId)
      focusLater(row && row.name.trim() === '' && row.priceText.trim() === '' ? nameFieldId(rowId) : priceFieldId(rowId))
    } else if (breakdown.issues.some((i) => i.type === 'no-items')) {
      focusLater(nameFieldId(form.items[0]!.id))
    } else if (breakdown.issues.some((i) => i.type === 'invalid-service-pct')) {
      focusLater('service-pct')
    } else if (breakdown.issues.some((i) => i.type.includes('discount'))) {
      focusLater('discount')
    } else {
      focusLater('bill-date')
    }
  }

  function save() {
    if (problem) {
      setShowErrors(true)
      goTo(problem)
      return
    }
    const result = onSaveBill(toBillInput(form, draft))
    if (!result.ok) {
      setFailure(SAVE_FAILURE[result.reason])
      return
    }
    setSaved(result.value)
    setForm(newForm())
    setStep('items')
    setSelected([])
    setOpenRow(null)
    setShowErrors(false)
    setFailure(null)
    window.scrollTo({ top: 0 })
  }

  function addFriend(name: string): { id: PersonId } | { error: string } {
    const result = onAddPerson(name)
    return result.ok ? { id: result.value.id } : { error: 'เพิ่มเพื่อนไม่ได้ พื้นที่ในเครื่องอาจเต็ม' }
  }

  function onTabKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    const next = step === 'items' ? 'share' : 'items'
    setStep(next)
    focusLater(`tab-${next}`)
  }

  const savedTotal = saved ? Object.values(saved.owed).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10">
      <div className="min-w-0">
        <h1 className="sr-only">{form.id ? 'แก้บิล' : 'หารบิลใหม่'}</h1>

        <div className="mb-4 grid grid-cols-2 border-b border-line" role="tablist" aria-label="ขั้นตอน">
          {STEPS.map(([key, label]) => (
            <button
              key={key}
              id={`tab-${key}`}
              type="button"
              role="tab"
              aria-selected={step === key}
              aria-controls="step-panel"
              tabIndex={step === key ? 0 : -1}
              className={`min-h-12 border-b-4 text-lg ${
                step === key ? 'border-gold font-medium' : 'border-transparent text-primary'
              }`}
              onClick={() => setStep(key)}
              onKeyDown={onTabKey}
            >
              {label}
            </button>
          ))}
        </div>

        {saved && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-line bg-paper py-1 pl-3" role="status">
            <CircleCheck aria-hidden size={20} className="flex-none text-paid" />
            <p className="min-w-0 flex-1 wrap-anywhere">
              บันทึก {saved.title || 'บิล'} แล้ว <span className="money">{formatBaht(savedTotal)}</span>
            </p>
            <button type="button" className="btn btn-quiet btn-icon" aria-label="ปิด" onClick={() => setSaved(null)}>
              <X aria-hidden size={18} />
            </button>
          </div>
        )}

        <div id="step-panel" role="tabpanel" aria-labelledby={`tab-${step}`} className="pb-6">
          {step === 'items' ? (
            <ItemsStep
              form={form}
              onChange={change}
              onFocusLater={focusLater}
              showErrors={showErrors}
              people={
                <PeopleSection form={form} people={pickable} onChange={change} onAddFriend={addFriend} />
              }
            />
          ) : (
            <ShareStep
              form={form}
              breakdown={breakdown}
              people={inBill}
              onChange={change}
              selected={ticked}
              onSelect={setSelected}
              openRow={openRow}
              onOpenRow={setOpenRow}
              showErrors={showErrors}
              onGoToItems={() => setStep('items')}
            />
          )}
        </div>
      </div>

      {/* One receipt: below step 2 on a phone, always beside the form when wide. */}
      <aside
        className={`pb-6 drop-shadow-sm lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto ${
          step === 'share' ? '' : 'hidden'
        }`}
      >
        <LiveReceipt form={receiptForm} people={data.people} />
      </aside>

      <div className="sticky bottom-0 z-10 -mx-4 border-t-2 border-line bg-bg px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:col-span-2">
        {step === 'share' && ticked.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-line pb-2">
            <button
              type="button"
              className="btn btn-quiet btn-icon -ml-2"
              aria-label="เลิกติ๊กทั้งหมด"
              onClick={() => setSelected([])}
            >
              <X aria-hidden size={18} />
            </button>
            <span className="mr-auto whitespace-nowrap">ติ๊ก {ticked.length}</span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                change(setSharers(form, ticked, form.peopleIds))
                setSelected([])
              }}
            >
              ทุกคน
            </button>
            <button type="button" className="btn" onClick={() => setAssigning(true)}>
              เลือกคน…
            </button>
          </div>
        )}

        {failure && (
          <p className="attention mb-2" role="alert">
            <TriangleAlert aria-hidden size={16} />
            <span>{failure}</span>
          </p>
        )}

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span>ยอดสุทธิ</span>
              <span className="money text-[1.75rem] leading-9 font-semibold" data-testid="grand-total">
                {formatBaht(breakdown.totals.total)}
              </span>
            </p>
            <div id="save-status" className="text-sm" aria-live="polite">
              {problem ? (
                <p className="attention">
                  <TriangleAlert aria-hidden size={16} />
                  <span>{problem.message}</span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5">
                  <CircleCheck aria-hidden size={16} />
                  พร้อมบันทึก
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary min-h-13 flex-none px-6 text-lg"
            // Not aria-disabled: while blocked it still works, by going to the problem.
            data-blocked={problem !== null}
            aria-describedby="save-status"
            onClick={save}
          >
            บันทึก
          </button>
        </div>
      </div>

      {assigning && (
        <AssignDialog
          count={ticked.length}
          people={inBill}
          onClose={() => setAssigning(false)}
          onApply={(personIds) => {
            change(setSharers(form, ticked, personIds))
            setSelected([])
            setAssigning(false)
          }}
        />
      )}
    </div>
  )
}
