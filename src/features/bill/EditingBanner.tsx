import { Pencil } from 'lucide-react'
import { useState } from 'react'

/** Says which saved bill is open, and lets the owner stop without saving. */
export function EditingBanner({
  title,
  changed,
  onStop,
}: {
  title: string
  changed: boolean
  onStop: () => void
}) {
  const [asking, setAsking] = useState(false)

  return (
    <div className="mb-3 rounded-xl border-2 border-primary bg-paper py-1 pr-1 pl-3">
      <div className="flex items-center gap-2">
        <Pencil aria-hidden size={18} className="flex-none" />
        <p className="min-w-0 flex-1 wrap-anywhere">กำลังแก้ “{title}”</p>
        {!asking && (
          <button type="button" className="btn btn-quiet" onClick={() => (changed ? setAsking(true) : onStop())}>
            เลิกแก้
          </button>
        )}
      </div>
      {asking && (
        <div className="pb-2" role="alert">
          <p>ทิ้งที่แก้ไว้โดยไม่บันทึก?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn" onClick={onStop}>
              ทิ้งที่แก้
            </button>
            <button type="button" className="btn btn-quiet" autoFocus onClick={() => setAsking(false)}>
              แก้ต่อ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
