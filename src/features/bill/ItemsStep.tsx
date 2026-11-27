import { Plus, Split, Trash2, TriangleAlert } from 'lucide-react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { newId } from '../../storage/ids'
import { MoneyInput } from '../../ui/MoneyInput'
import {
  QUICK_NAMES,
  addRow,
  amountError,
  parseServicePct,
  priceError,
  quickName,
  removeRow,
  splitWholeBill,
  updateRow,
  type BillForm,
} from './billForm'
import { nameFieldId, priceFieldId } from './fieldIds'

interface Props {
  form: BillForm
  onChange: (form: BillForm) => void
  /** Moves focus once the new field exists. */
  onFocusLater: (elementId: string) => void
  showErrors: boolean
  /** The people section sits between the date and the items. */
  people: ReactNode
}

export function ItemsStep({ form, onChange, onFocusLater, showErrors, people }: Props) {
  const activeRow = useRef<string | undefined>(undefined)

  function goToNext(rowId: string) {
    const next = form.items[form.items.findIndex((row) => row.id === rowId) + 1]
    if (next) return onFocusLater(nameFieldId(next.id))
    const id = newId('i')
    onChange(addRow(form, id))
    onFocusLater(nameFieldId(id))
  }

  const onEnter = (action: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    // While a Thai or other keyboard is still composing, Enter belongs to it.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    action()
  }

  const serviceError = form.serviceOn && Number.isNaN(parseServicePct(form.servicePctText))

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div>
          <label htmlFor="bill-title" className="block">
            ชื่อบิล
          </label>
          <input
            id="bill-title"
            className="field"
            placeholder="เช่น หมูกระทะวันศุกร์"
            autoComplete="off"
            value={form.title}
            onChange={(event) => onChange({ ...form, title: event.target.value })}
          />
        </div>
        <div>
          <label htmlFor="bill-date" className="block">
            วันที่
          </label>
          <input
            id="bill-date"
            className="field max-w-52"
            type="date"
            value={form.date}
            onChange={(event) => onChange({ ...form, date: event.target.value })}
          />
        </div>
      </div>

      {people}

      <section className="section space-y-3" aria-labelledby="items-heading">
        <h2 id="items-heading" className="text-lg font-medium">
          รายการ
        </h2>

        <ol className="space-y-2">
          {form.items.map((row, index) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <input
                id={nameFieldId(row.id)}
                className="field flex-1 basis-0"
                placeholder={`รายการ ${index + 1}`}
                aria-label={`ชื่อรายการ ${index + 1}`}
                autoComplete="off"
                enterKeyHint="next"
                value={row.name}
                onFocus={() => (activeRow.current = row.id)}
                onChange={(event) => onChange(updateRow(form, row.id, { name: event.target.value }))}
                onKeyDown={onEnter(() => onFocusLater(priceFieldId(row.id)))}
              />
              {/* contents: the input and its error join this row's layout */}
              <div className="contents [&>input]:w-28">
                <MoneyInput
                  id={priceFieldId(row.id)}
                  aria-label={`ราคารายการ ${index + 1}`}
                  placeholder="ราคา"
                  enterKeyHint="next"
                  value={row.priceText}
                  error={priceError(row)}
                  showError={showErrors}
                  onFocus={() => (activeRow.current = row.id)}
                  onChange={(priceText) => onChange(updateRow(form, row.id, { priceText }))}
                  onKeyDown={onEnter(() => goToNext(row.id))}
                />
              </div>
              <button
                type="button"
                className="btn btn-quiet btn-icon"
                aria-label={`ลบรายการ ${index + 1} ${row.name}`}
                onClick={() => onChange(removeRow(form, row.id, newId('i')))}
              >
                <Trash2 aria-hidden size={18} />
              </button>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2" role="group" aria-label="ชื่อที่ใช้บ่อย">
          {QUICK_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className="btn font-normal"
              onClick={() => {
                const result = quickName(form, name, activeRow.current, newId('i'))
                onChange(result.form)
                onFocusLater(priceFieldId(result.rowId))
              }}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const id = newId('i')
              onChange(addRow(form, id))
              onFocusLater(nameFieldId(id))
            }}
          >
            <Plus aria-hidden size={18} />
            เพิ่มรายการ
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const id = newId('i')
              onChange(splitWholeBill(form, id))
              onFocusLater(priceFieldId(id))
            }}
          >
            <Split aria-hidden size={18} />
            หารเท่าทั้งบิล
          </button>
        </div>
      </section>

      <section className="section space-y-2" aria-labelledby="extras-heading">
        <h2 id="extras-heading" className="text-lg font-medium">
          ค่าอื่น ๆ
        </h2>

        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5"
              checked={form.serviceOn}
              onChange={(event) => onChange({ ...form, serviceOn: event.target.checked })}
            />
            เซอร์วิสชาร์จ
          </label>
          <div className="flex items-center gap-2">
            <input
              id="service-pct"
              className="field money w-24 text-right disabled:opacity-60"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-label="เซอร์วิสชาร์จกี่เปอร์เซ็นต์"
              aria-invalid={serviceError}
              aria-describedby={serviceError ? 'service-error' : undefined}
              disabled={!form.serviceOn}
              value={form.servicePctText}
              onChange={(event) => onChange({ ...form, servicePctText: event.target.value })}
            />
            <span aria-hidden>%</span>
          </div>
          {serviceError && (
            <p id="service-error" className="attention basis-full justify-end text-sm">
              <TriangleAlert aria-hidden size={16} />
              <span>ใส่ 0 ถึง 100</span>
            </p>
          )}
        </div>

        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={form.vat}
            onChange={(event) => onChange({ ...form, vat: event.target.checked })}
          />
          บวก VAT 7%
        </label>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <label htmlFor="discount" className="flex min-h-11 items-center">
            ส่วนลด (บาท)
          </label>
          <div className="contents [&>input]:w-32">
            <MoneyInput
              id="discount"
              placeholder="ไม่มี"
              value={form.discountText}
              error={amountError(form.discountText)}
              showError={showErrors}
              onChange={(discountText) => onChange({ ...form, discountText })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
