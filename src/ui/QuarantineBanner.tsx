// Permanent while anything is quarantined: balances may be missing money.
import { ChevronDown, Download, TriangleAlert } from 'lucide-react'
import type { QuarantineNotice } from '../storage/messages'

export function QuarantineBanner({
  notice,
  onExport,
}: {
  notice: QuarantineNotice
  onExport: () => void
}) {
  return (
    <section className="mb-4 rounded-xl border-2 border-gold-text bg-paper p-3" aria-label="ข้อมูลอ่านไม่ได้">
      <p className="attention">
        <TriangleAlert aria-hidden size={18} />
        <span>{notice.message}</span>
      </p>
      <details className="group">
        <summary className="flex min-h-11 items-center gap-2">
          <ChevronDown aria-hidden size={16} className="group-open:rotate-180" />
          ดูรายละเอียด
        </summary>
        <ul className="list-disc space-y-1 pb-2 pl-6 text-sm wrap-anywhere">
          {notice.details.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </details>
      <button type="button" className="btn" onClick={onExport}>
        <Download aria-hidden size={18} />
        บันทึกข้อมูลดิบ
      </button>
    </section>
  )
}
