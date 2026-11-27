import { Circle, CircleCheck } from 'lucide-react'
import { colorSlotOf } from '../domain/colors'
import type { Person } from '../domain/types'

/** Soft chips get a darker rim of their own hue; solid chips and mine need none. */
function colorsOf(person: Person) {
  if (person.isMe) {
    return { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
  }
  const slot = colorSlotOf(person)
  const background = `var(--person-${slot}-bg)`
  const color = `var(--person-${slot}-fg)`
  return { background, color, borderColor: `color-mix(in srgb, ${color} 45%, ${background})` }
}

export function PersonChip({ person }: { person: Person }) {
  return (
    <span className="chip" style={colorsOf(person)}>
      <span>{person.name}</span>
    </span>
  )
}

export function PersonToggle({
  person,
  selected,
  onToggle,
}: {
  person: Person
  selected: boolean
  onToggle: () => void
}) {
  // Both icons are the same size, so nothing moves when the state changes.
  const Icon = selected ? CircleCheck : Circle
  return (
    <button
      type="button"
      className="chip chip-toggle"
      style={colorsOf(person)}
      aria-pressed={selected}
      onClick={onToggle}
    >
      <Icon aria-hidden size={18} strokeWidth={2.25} />
      <span>{person.name}</span>
    </button>
  )
}
