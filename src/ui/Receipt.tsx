// The bill as a thermal receipt. Black and white on purpose: no person colours.
import { ChevronDown } from 'lucide-react'
import { formatBaht } from '../domain/money'
import type { BillBreakdown, BillDraft } from '../domain/split'
import type { Person, PersonId, Satang } from '../domain/types'
import { formatThaiDate } from './format'

interface Props {
  title: string
  date: string
  draft: BillDraft
  breakdown: BillBreakdown
  /** In the order they should be listed. */
  people: Person[]
  /** Show only saved totals and amounts, with no worked-out details. */
  summaryOnly?: boolean
}

function Line({ label, amount, strong }: { label: string; amount: Satang; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'text-lg font-medium' : ''}`}>
      <span className="min-w-0 wrap-anywhere">{label}</span>
      <span className="money">{formatBaht(amount)}</span>
    </div>
  )
}

export function Receipt({ title, date, draft, breakdown, people, summaryOnly }: Props) {
  const nameOf = (id: PersonId) => people.find((p) => p.id === id)?.name ?? '(ไม่ทราบชื่อ)'
  const { totals, unassigned } = breakdown
  const priced = draft.items.filter((item) => Number.isFinite(item.price))
  const sharers = people.filter((p) => breakdown.people[p.id])
  const payers = Object.entries(draft.payers).filter(([, paid]) => Number.isFinite(paid) && paid > 0)
  const itemName = (id: string) => {
    const index = draft.items.findIndex((item) => item.id === id)
    return draft.items[index]?.name || `รายการ ${index + 1}`
  }

  return (
    <article className="receipt" aria-label="ใบเสร็จ">
      <header className="pb-2 text-center">
        <h2 className="text-lg font-medium wrap-anywhere">{title.trim() || 'บิลไม่มีชื่อ'}</h2>
        <p className="text-sm">{formatThaiDate(date)}</p>
      </header>

      {priced.length === 0 ? (
        <p className="receipt-rule py-3 text-center text-sm">พิมพ์รายการแล้วยอดจะขึ้นตรงนี้</p>
      ) : (
        <>
          <ul className="receipt-rule space-y-1 py-3">
            {priced.map((item) => (
              <li key={item.id}>
                <Line label={itemName(item.id)} amount={item.price} />
                <p className="text-sm">
                  {item.sharedBy.length === 0
                    ? 'ยังไม่มีคนหาร'
                    : item.sharedBy.length > 4
                      ? `หาร ${item.sharedBy.length} คน`
                      : `หาร: ${item.sharedBy.map(nameOf).join(', ')}`}
                </p>
              </li>
            ))}
          </ul>

          <div className="receipt-rule space-y-1 py-3">
            {!summaryOnly && <Line label="ค่าของ" amount={totals.subtotal} />}
            {totals.discount > 0 && <Line label="ส่วนลด" amount={-totals.discount} />}
            {totals.service > 0 && <Line label={`เซอร์วิส ${draft.servicePct}%`} amount={totals.service} />}
            {totals.vat > 0 && <Line label="VAT 7%" amount={totals.vat} />}
            <Line label="ยอดสุทธิ" amount={totals.total} strong />
          </div>
        </>
      )}

      {(sharers.length > 0 || (unassigned > 0 && priced.length > 0)) && (
        <section className="receipt-rule py-3">
          <h3 className="pb-1 font-medium">คนละเท่าไร</h3>
          {summaryOnly && <p className="pb-1 text-sm">ยอดตามตอนที่บันทึก</p>}
          <ul>
            {sharers.map((person) => {
              const share = breakdown.people[person.id]!
              if (summaryOnly) {
                return (
                  <li key={person.id}>
                    <Line label={person.name} amount={share.owed} />
                  </li>
                )
              }
              return (
                <li key={person.id}>
                  <details className="group">
                    <summary className="flex min-h-11 items-center gap-2">
                      <ChevronDown aria-hidden size={16} className="flex-none group-open:rotate-180" />
                      <span className="min-w-0 flex-1 wrap-anywhere">{person.name}</span>
                      <span className="money">{formatBaht(share.owed)}</span>
                    </summary>
                    <div className="space-y-0.5 pb-2 pl-6 text-sm">
                      {breakdown.items
                        .filter((item) => item.shares[person.id] !== undefined)
                        .map((item) => (
                          <Line key={item.itemId} label={itemName(item.itemId)} amount={item.shares[person.id]!} />
                        ))}
                      {share.discount > 0 && <Line label="ส่วนลด" amount={-share.discount} />}
                      {share.service > 0 && <Line label="เซอร์วิส" amount={share.service} />}
                      {share.vat > 0 && <Line label="VAT" amount={share.vat} />}
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
          {unassigned > 0 && <Line label="ยังไม่มีคนหาร" amount={unassigned} />}
        </section>
      )}

      {payers.length > 0 && totals.total > 0 && (
        <section className="receipt-rule space-y-1 pt-3">
          <h3 className="font-medium">ใครจ่าย</h3>
          {payers.map(([id, paid]) => (
            <Line key={id} label={nameOf(id)} amount={paid} />
          ))}
        </section>
      )}
    </article>
  )
}
