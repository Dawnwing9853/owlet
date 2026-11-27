import { ChevronDown, CircleCheck, TriangleAlert } from 'lucide-react'
import { formatBaht, parseBaht } from '../../domain/money'
import type { BillBreakdown } from '../../domain/split'
import type { Person } from '../../domain/types'
import { ME_ID } from '../../storage/schema'
import { MoneyInput } from '../../ui/MoneyInput'
import { PersonChip, PersonToggle } from '../../ui/PersonChip'
import {
  amountError,
  isBlankRow,
  setPayerMode,
  setSharers,
  sharerSummary,
  toggleSharer,
  type BillForm,
  type ItemRow,
} from './billForm'
import { shareRowId } from './fieldIds'

/** Beyond this many chips a row shows a count instead, to stay scannable. */
const CHIPS_PER_ROW = 6

interface Props {
  form: BillForm
  breakdown: BillBreakdown
  /** The people in this bill. */
  people: Person[]
  onChange: (form: BillForm) => void
  selected: string[]
  onSelect: (rowIds: string[]) => void
  openRow: string | null
  onOpenRow: (rowId: string | null) => void
  showErrors: boolean
  onGoToItems: () => void
}

export function ShareStep(props: Props) {
  const { form, people, selected, onSelect } = props
  const rows = form.items.filter((row) => !isBlankRow(row))

  if (rows.length === 0) {
    return (
      <div className="space-y-3 py-4">
        <p>ยังไม่มีรายการ พิมพ์รายการก่อน แล้วค่อยมาเลือกคนหาร</p>
        <button type="button" className="btn" onClick={props.onGoToItems}>
          ไปพิมพ์รายการ
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2" aria-labelledby="share-heading">
        <h2 id="share-heading" className="text-lg font-medium">
          ใครหารอะไร
        </h2>
        <p className="text-sm">
          แตะรายการเพื่อเลือกคน หรือติ๊กหลายรายการแล้วเลือกพร้อมกัน
          {people.length < 2 && ' ถ้ายังไม่ได้เพิ่มเพื่อน ให้เพิ่มในแท็บรายการ'}
        </p>
        <ul>
          {rows.map((row) => (
            <ShareRow
              key={row.id}
              {...props}
              row={row}
              name={row.name.trim() || `รายการ ${form.items.indexOf(row) + 1}`}
              ticked={selected.includes(row.id)}
              onTick={(ticked) =>
                onSelect(ticked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
              }
            />
          ))}
        </ul>
      </section>

      <Payers {...props} />
    </div>
  )
}

function ShareRow({
  row,
  name,
  ticked,
  onTick,
  form,
  people,
  onChange,
  openRow,
  onOpenRow,
}: Props & { row: ItemRow; name: string; ticked: boolean; onTick: (ticked: boolean) => void }) {
  const open = openRow === row.id
  const price = parseBaht(row.priceText)
  const summary = sharerSummary(row.sharedBy, form.peopleIds)
  const sharers = people.filter((p) => row.sharedBy.includes(p.id))
  const panelId = `${shareRowId(row.id)}-people`

  return (
    // tabIndex -1: pressing save moves focus here when this row needs people.
    <li id={shareRowId(row.id)} tabIndex={-1} className="border-t border-line py-1">
      <div className="flex items-start">
        <label className="flex size-11 flex-none items-center justify-center">
          <input
            type="checkbox"
            className="size-5"
            checked={ticked}
            onChange={(event) => onTick(event.target.checked)}
          />
          <span className="sr-only">ติ๊ก {name}</span>
        </label>
        <button
          type="button"
          className="min-h-11 min-w-0 flex-1 py-1.5 text-left"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onOpenRow(open ? null : row.id)}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 wrap-anywhere">{name}</span>
            <span className="flex flex-none items-center gap-1.5">
              {price === null ? (
                <span className="text-sm text-gold-text">ราคายังไม่ถูก</span>
              ) : (
                <span className="money">{formatBaht(price)}</span>
              )}
              <ChevronDown aria-hidden size={18} className={open ? 'rotate-180' : ''} />
            </span>
          </span>
          {summary.kind === 'none' ? (
            <span className="attention text-sm">
              <TriangleAlert aria-hidden size={16} />
              {summary.text}
            </span>
          ) : (
            <span className="block text-sm">{summary.text}</span>
          )}
          {!open && summary.kind === 'some' && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {sharers.slice(0, CHIPS_PER_ROW).map((person) => (
                <PersonChip key={person.id} person={person} />
              ))}
              {sharers.length > CHIPS_PER_ROW && <span>+{sharers.length - CHIPS_PER_ROW}</span>}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div id={panelId} className="space-y-3 pt-1 pb-3 pl-11">
          <div className="flex flex-wrap gap-2.5">
            {people.map((person) => (
              <PersonToggle
                key={person.id}
                person={person}
                selected={row.sharedBy.includes(person.id)}
                onToggle={() => onChange(toggleSharer(form, row.id, person.id))}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => onChange(setSharers(form, [row.id], form.peopleIds))}>
              ทุกคน
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => onChange(setSharers(form, [row.id], []))}>
              ล้าง
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

function Payers({ form, breakdown, people, onChange, showErrors }: Props) {
  const total = breakdown.totals.total
  const mismatch = breakdown.issues.find((issue) => issue.type === 'payer-mismatch')
  const badPayment = breakdown.issues.some((issue) => issue.type === 'invalid-payment')

  return (
    <section id="payers" tabIndex={-1} className="section space-y-3" aria-labelledby="payers-heading">
      <h2 id="payers-heading" className="text-lg font-medium">
        ใครจ่าย
      </h2>

      <div className="flex flex-wrap gap-x-5" role="radiogroup" aria-labelledby="payers-heading">
        {(
          [
            ['me', 'เราจ่ายหมด'],
            ['many', 'หลายคนจ่าย หรือคนอื่นจ่าย'],
          ] as const
        ).map(([mode, label]) => (
          <label key={mode} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="payer-mode"
              className="size-5"
              checked={form.payerMode === mode}
              onChange={() => onChange(setPayerMode(form, mode, total))}
            />
            {label}
          </label>
        ))}
      </div>

      {form.payerMode === 'me' ? (
        <p className="flex items-baseline justify-between gap-3">
          <span>เราจ่าย</span>
          <span className="money">{formatBaht(total)}</span>
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {people.map((person) => {
              const text = form.payerTexts[person.id] ?? ''
              return (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <label htmlFor={`paid-${person.id}`} className="min-w-0 flex-1">
                    <PersonChip person={person} />
                  </label>
                  <div className="contents [&>input]:w-32">
                    <MoneyInput
                      id={`paid-${person.id}`}
                      aria-label={`${person.id === ME_ID ? 'เรา' : person.name} จ่ายไปเท่าไร`}
                      placeholder="ไม่ได้จ่าย"
                      value={text}
                      error={amountError(text)}
                      showError={showErrors}
                      onChange={(value) =>
                        onChange({ ...form, payerTexts: { ...form.payerTexts, [person.id]: value } })
                      }
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          <div aria-live="polite">
            {mismatch?.type === 'payer-mismatch' ? (
              <p className="attention">
                <TriangleAlert aria-hidden size={16} />
                <span>
                  {mismatch.difference > 0 ? 'ยังขาด ' : 'เกินมา '}
                  <span className="money">{formatBaht(Math.abs(mismatch.difference))}</span>
                </span>
              </p>
            ) : (
              !badPayment && (
                <p className="flex items-center gap-1.5">
                  <CircleCheck aria-hidden size={18} />
                  ยอดคนจ่ายครบพอดี
                </p>
              )
            )}
          </div>
        </>
      )}
    </section>
  )
}
