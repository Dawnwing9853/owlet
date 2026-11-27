// Which chip colour each friend gets. The colours themselves live in index.css.
import type { Person } from './types'

export const PERSON_COLOR_SLOTS = 30
/** Slots below this are soft chips; the rest are solid chips of the same hues. */
export const SOFT_COLOR_SLOTS = 15

const isSlot = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value >= 0 && value < PERSON_COLOR_SLOTS

/** 32-bit FNV-1a. Must never change: it colours people with no stored slot. */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value = Math.imul(value ^ text.charCodeAt(i), 0x01000193) >>> 0
  }
  return value
}

/** The slot a person is shown in. */
export function colorSlotOf(person: Pick<Person, 'id' | 'colorSlot'>): number {
  return isSlot(person.colorSlot) ? person.colorSlot : hash(person.id) % PERSON_COLOR_SLOTS
}

/**
 * The slot for a new friend: the one used least among friends who aren't
 * archived. Ties prefer soft slots, then `random` (0 ≤ r < 1) decides.
 */
export function pickColorSlot(people: readonly Person[], random: () => number): number {
  const uses = new Array<number>(PERSON_COLOR_SLOTS).fill(0)
  for (const person of people) {
    if (!person.isMe && !person.archived) uses[colorSlotOf(person)]! += 1
  }

  const fewest = Math.min(...uses)
  const tied = uses.flatMap((count, slot) => (count === fewest ? [slot] : []))
  const soft = tied.filter((slot) => slot < SOFT_COLOR_SLOTS)
  const choices = soft.length > 0 ? soft : tied
  return choices[Math.floor(random() * choices.length)]!
}
