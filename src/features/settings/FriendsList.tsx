import { Pencil, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Person, PersonId } from '../../domain/types'
import type { SaveResult } from '../../storage/repository'
import { PersonChip } from '../../ui/PersonChip'
import { duplicateName, friendsToList } from './history'

interface Props {
  people: Person[]
  onRename: (id: PersonId, name: string) => SaveResult<Person>
  onGoToBill: () => void
}

export function FriendsList({ people, onRename, onGoToBill }: Props) {
  const [editingId, setEditingId] = useState<PersonId | null>(null)
  const friends = friendsToList(people)

  if (friends.length === 0) {
    return (
      <div className="space-y-3 py-4">
        <p>ยังไม่มีเพื่อน เพิ่มได้ตอนหารบิล</p>
        <button type="button" className="btn" onClick={onGoToBill}>
          ไปหารบิล
        </button>
      </div>
    )
  }

  return (
    <ul>
      {friends.map((person) =>
        editingId === person.id ? (
          <RenameRow
            key={person.id}
            person={person}
            people={people}
            onRename={onRename}
            onDone={() => {
              setEditingId(null)
              // Wait for the row to come back, then put focus where it was.
              requestAnimationFrame(() => document.getElementById(`rename-${person.id}`)?.focus())
            }}
          />
        ) : (
          <li key={person.id} className="flex min-h-14 flex-wrap items-center gap-x-3 border-b border-line py-1.5">
            <span className="min-w-0 flex-1">
              <PersonChip person={person} />
              {person.needsName && (
                <span className="attention mt-1 text-sm">
                  <TriangleAlert aria-hidden size={16} />
                  ยังไม่มีชื่อ
                </span>
              )}
            </span>
            <button
              id={`rename-${person.id}`}
              type="button"
              className="btn btn-quiet"
              aria-label={`แก้ชื่อ ${person.name}`}
              onClick={() => setEditingId(person.id)}
            >
              <Pencil aria-hidden size={18} />
              แก้ชื่อ
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

function RenameRow({
  person,
  people,
  onRename,
  onDone,
}: {
  person: Person
  people: Person[]
  onRename: Props['onRename']
  onDone: () => void
}) {
  const [name, setName] = useState(person.needsName ? '' : person.name)
  const [error, setError] = useState<string | null>(null)
  const inputId = `name-of-${person.id}`
  const duplicate = duplicateName(people, person.id, name)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') return setError('ใส่ชื่อก่อน')
    const result = onRename(person.id, name)
    if (!result.ok) return setError('บันทึกชื่อไม่ได้ ลองใหม่อีกที')
    onDone()
  }

  return (
    <li className="border-b border-line py-2">
      <form className="space-y-2" onSubmit={submit}>
        <label htmlFor={inputId} className="block text-sm">
          ชื่อใหม่ของ {person.name}
        </label>
        <input
          id={inputId}
          className="field"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus
          value={name}
          aria-invalid={error !== null}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onDone()
          }}
        />
        {error ? (
          <p className="attention text-sm" role="alert">
            <TriangleAlert aria-hidden size={16} />
            <span>{error}</span>
          </p>
        ) : (
          duplicate && (
            <p className="attention text-sm" role="status">
              <TriangleAlert aria-hidden size={16} />
              <span>มีคนใช้ชื่อนี้อยู่แล้ว บันทึกได้ แต่อาจสับสน</span>
            </p>
          )
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">
            บันทึก
          </button>
          <button type="button" className="btn btn-quiet" onClick={onDone}>
            ยกเลิก
          </button>
        </div>
      </form>
    </li>
  )
}
