import { ChevronDown, Pencil, Trash2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { formatBaht } from '../../domain/money'
import type { Bill, Person } from '../../domain/types'
import { ME_ID } from '../../storage/schema'
import { formatThaiDate } from '../../ui/format'
import { Receipt } from '../../ui/Receipt'
import { billHistory, billTotal, savedReceipt } from './history'
import type { AppData } from '../../storage/parse'

export interface HistoryActions {
  /** The saved bill currently open for editing, if any. */
  editing: { id: string; title: string } | null
  /** True if editing this bill would drop unsaved changes to another one. */
  needsDiscard: (billId: string) => boolean
  onEdit: (bill: Bill) => void
  /** Returns false if it couldn't be deleted. */
  onDelete: (bill: Bill) => boolean
  onGoToBill: () => void
}

const nameOf = (bill: Bill) => bill.title || 'บิลไม่มีชื่อ'

export function HistoryList({ data, ...actions }: { data: AppData } & HistoryActions) {
  const [openId, setOpenId] = useState<string | null>(null)
  const bills = billHistory(data.entries)

  if (bills.length === 0) {
    return (
      <div className="space-y-3 py-4">
        <p>บิลที่บันทึกจะมาอยู่ตรงนี้</p>
        <button type="button" className="btn" onClick={actions.onGoToBill}>
          ไปหารบิล
        </button>
      </div>
    )
  }

  return (
    <ul>
      {bills.map((bill) => (
        <HistoryRow
          key={bill.id}
          bill={bill}
          people={data.people}
          open={openId === bill.id}
          onToggle={() => setOpenId(openId === bill.id ? null : bill.id)}
          {...actions}
        />
      ))}
    </ul>
  )
}

function HistoryRow({
  bill,
  people,
  open,
  onToggle,
  editing,
  needsDiscard,
  onEdit,
  onDelete,
}: Omit<HistoryActions, 'onGoToBill'> & {
  bill: Bill
  people: Person[]
  open: boolean
  onToggle: () => void
}) {
  const [asking, setAsking] = useState<'delete' | 'discard' | null>(null)
  const [failed, setFailed] = useState(false)
  const total = billTotal(bill)
  const headCount = Object.keys(bill.owed).length
  const beingEdited = editing?.id === bill.id
  const panelId = `history-${bill.id}-panel`

  return (
    <li className="border-b border-line">
      <button
        type="button"
        className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setAsking(null)
          onToggle()
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium wrap-anywhere">{nameOf(bill)}</span>
          <span className="block text-sm">
            {formatThaiDate(bill.date)} · {headCount} คน{beingEdited && ' · กำลังแก้อยู่'}
          </span>
        </span>
        <span className="money">{formatBaht(total)}</span>
        <ChevronDown aria-hidden size={18} className={`flex-none ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <OpenBill bill={bill} people={people} panelId={panelId} />}

      {open && (
        <div className="pb-4">
          {asking === 'delete' ? (
            <div className="rounded-xl border-2 border-gold-text bg-paper p-3" role="alert">
              <p className="wrap-anywhere">
                ลบบิล “{nameOf(bill)}” <span className="money">{formatBaht(total)}</span>?
                ยอดค้างของคนในบิลจะเปลี่ยน และย้อนกลับไม่ได้
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!onDelete(bill)) setFailed(true)
                  }}
                >
                  ลบบิล
                </button>
                {/* The safe choice gets focus. */}
                <button type="button" className="btn btn-quiet" autoFocus onClick={() => setAsking(null)}>
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : asking === 'discard' ? (
            <div className="rounded-xl border-2 border-gold-text bg-paper p-3" role="alert">
              <p className="wrap-anywhere">ที่แก้ใน “{editing?.title}” ยังไม่ได้บันทึก จะทิ้งไหม?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => onEdit(bill)}>
                  ทิ้งแล้วแก้บิลนี้
                </button>
                <button type="button" className="btn btn-quiet" autoFocus onClick={() => setAsking(null)}>
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => (needsDiscard(bill.id) ? setAsking('discard') : onEdit(bill))}
              >
                <Pencil aria-hidden size={18} />
                {beingEdited ? 'แก้ต่อ' : 'แก้'}
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setAsking('delete')}>
                <Trash2 aria-hidden size={18} />
                ลบ
              </button>
            </div>
          )}
          {failed && (
            <p className="attention mt-2" role="alert">
              <TriangleAlert aria-hidden size={16} />
              <span>ลบไม่ได้ ลองใหม่อีกที</span>
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** Worked out only while a row is open: a long history stays quick. */
function OpenBill({ bill, people, panelId }: { bill: Bill; people: Person[]; panelId: string }) {
  const { breakdown, summaryOnly } = savedReceipt(bill)
  const listed = people.filter((p) => bill.owed[p.id] !== undefined || bill.payers[p.id] !== undefined || p.id === ME_ID)
  return (
    <div id={panelId} className="pb-3 drop-shadow-sm">
      <Receipt
        title={bill.title}
        date={bill.date}
        draft={bill}
        breakdown={breakdown}
        people={listed}
        summaryOnly={summaryOnly}
      />
    </div>
  )
}
