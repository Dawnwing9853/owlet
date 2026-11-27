import { TriangleAlert, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Person, PersonId } from '../../domain/types'
import { PersonToggle } from '../../ui/PersonChip'
import { personUsage, removePerson, addPerson, type BillForm } from './billForm'

interface Props {
  form: BillForm
  /** Everyone who can be picked, in a fixed order so nothing jumps around. */
  people: Person[]
  onChange: (form: BillForm) => void
  /** Saves a new friend. Returns their id, or a message saying why not. */
  onAddFriend: (name: string) => { id: PersonId } | { error: string }
}

export function PeopleSection({ form, people, onChange, onAddFriend }: Props) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<Person | null>(null)

  function toggle(person: Person) {
    if (!form.peopleIds.includes(person.id)) return onChange(addPerson(form, person.id))
    const usage = personUsage(form, person.id)
    if (usage.items > 0 || usage.paid) return setLeaving(person)
    onChange(removePerson(form, person.id))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (name.trim() === '') return setError('ใส่ชื่อก่อน')
    const result = onAddFriend(name)
    if ('error' in result) return setError(result.error)
    onChange(addPerson(form, result.id))
    setName('')
    setError(null)
  }

  const leavingUsage = leaving ? personUsage(form, leaving.id) : null

  return (
    <section className="section space-y-3" aria-labelledby="people-heading">
      <h2 id="people-heading" className="flex items-baseline justify-between gap-3 text-lg font-medium">
        ใครมาบ้าง
        <span className="text-base font-normal">{form.peopleIds.length} คน</span>
      </h2>

      <div className="flex flex-wrap gap-2.5">
        {people.map((person) => (
          <PersonToggle
            key={person.id}
            person={person}
            selected={form.peopleIds.includes(person.id)}
            onToggle={() => toggle(person)}
          />
        ))}
      </div>

      {leaving && leavingUsage && (
        <div className="rounded-xl border-2 border-gold-text bg-paper p-3" role="alert">
          <p className="wrap-anywhere">
            เอา {leaving.name} ออกจากบิล?
            {leavingUsage.items > 0 && ` ตอนนี้หารอยู่ ${leavingUsage.items} รายการ`}
            {leavingUsage.paid && ' และใส่ยอดจ่ายไว้แล้ว'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => {
                onChange(removePerson(form, leaving.id))
                setLeaving(null)
              }}
            >
              เอาออก
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setLeaving(null)}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <form className="flex flex-wrap items-start gap-2" onSubmit={submit}>
        <label htmlFor="new-friend" className="sr-only">
          ชื่อเพื่อนใหม่
        </label>
        <input
          id="new-friend"
          className="field flex-1 basis-40"
          placeholder="ชื่อเพื่อนใหม่"
          autoComplete="off"
          enterKeyHint="done"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
        <button type="submit" className="btn">
          <UserPlus aria-hidden size={18} />
          เพิ่ม
        </button>
        {error && (
          <p className="attention basis-full text-sm" role="alert">
            <TriangleAlert aria-hidden size={16} />
            <span>{error}</span>
          </p>
        )}
      </form>
    </section>
  )
}
