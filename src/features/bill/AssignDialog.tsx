import { useEffect, useRef, useState } from 'react'
import type { Person, PersonId } from '../../domain/types'
import { PersonToggle } from '../../ui/PersonChip'

/** Picks the people for several ticked items at once. Replaces who shared them. */
export function AssignDialog({
  count,
  people,
  onApply,
  onClose,
}: {
  count: number
  people: Person[]
  onApply: (personIds: PersonId[]) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [picked, setPicked] = useState<PersonId[]>([])

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  const everyone = picked.length === people.length

  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="assign-title" onClose={onClose}>
      <h2 id="assign-title" className="text-lg font-medium">
        ใครหาร {count} รายการนี้?
      </h2>
      <p className="text-sm">คนที่เลือกจะแทนคนหารเดิมของรายการที่ติ๊กไว้</p>

      <div className="my-4 flex flex-wrap gap-2.5">
        {people.map((person) => (
          <PersonToggle
            key={person.id}
            person={person}
            selected={picked.includes(person.id)}
            onToggle={() =>
              setPicked(
                picked.includes(person.id) ? picked.filter((id) => id !== person.id) : [...picked, person.id],
              )
            }
          />
        ))}
      </div>

      {/* Stays in reach however many people there are. */}
      <div className="sticky -bottom-4 flex flex-wrap gap-2 border-t border-line bg-bg py-3">
        <button
          type="button"
          className="btn"
          onClick={() => setPicked(everyone ? [] : people.map((p) => p.id))}
        >
          {everyone ? 'ไม่เลือกใคร' : 'เลือกทุกคน'}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="btn btn-primary ml-auto"
          aria-disabled={picked.length === 0}
          onClick={() => {
            if (picked.length === 0) return
            // Keep the bill's order, not the order they were tapped in.
            onApply(people.map((p) => p.id).filter((id) => picked.includes(id)))
          }}
        >
          {picked.length === 0 ? 'เลือกคนก่อน' : `ใช้ ${picked.length} คนนี้`}
        </button>
      </div>
    </dialog>
  )
}
