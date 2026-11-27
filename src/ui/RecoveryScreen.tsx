// Shown instead of a blank page when the data can't be used or the app crashes.
import { Download, RotateCw, Trash2 } from 'lucide-react'
import { useState } from 'react'

const TEXT = {
  unreadable: {
    title: 'อ่านข้อมูลในเครื่องไม่ได้',
    body: 'แอปยังไม่ได้เขียนทับอะไร บันทึกข้อมูลดิบเก็บไว้ก่อน',
  },
  'newer-version': {
    title: 'ข้อมูลมาจากแอปเวอร์ชันใหม่กว่า',
    body: 'รีโหลดเพื่ออัปเดตแอป ข้อมูลยังอยู่ครบ',
  },
  crash: {
    title: 'แอปพังกลางทาง',
    body: 'ข้อมูลที่บันทึกแล้วยังอยู่ ลองรีโหลดก่อน',
  },
}

export function RecoveryScreen({
  reason,
  onExport,
  onReset,
}: {
  reason: keyof typeof TEXT
  onExport: () => void
  onReset: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10">
      <div>
        <h1 className="text-xl font-medium">{TEXT[reason].title}</h1>
        <p>{TEXT[reason].body}</p>
      </div>
      <div className="flex flex-col gap-2">
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          <RotateCw aria-hidden size={18} />
          รีโหลด
        </button>
        <button type="button" className="btn" onClick={onExport}>
          <Download aria-hidden size={18} />
          บันทึกข้อมูลดิบ
        </button>
      </div>

      <div className="section">
        {confirming ? (
          <div className="space-y-2" role="alert">
            <p className="font-medium">ลบข้อมูลทั้งหมดในเครื่องนี้? ย้อนกลับไม่ได้</p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={onReset}>
                ลบทั้งหมด
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
            <Trash2 aria-hidden size={18} />
            รีเซ็ตแอป
          </button>
        )}
      </div>
    </main>
  )
}
