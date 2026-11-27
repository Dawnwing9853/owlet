import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { PERSON_COLOR_SLOTS, SOFT_COLOR_SLOTS, colorSlotOf, pickColorSlot } from './colors'
import type { Person } from './types'

const me: Person = { id: 'me', name: 'เรา', isMe: true }
const friend = (id: string, over: Partial<Person> = {}): Person => ({ id, name: id, isMe: false, ...over })

/** Adds friends one at a time, as the app does. */
function addFriends(count: number, random: () => number, start: Person[] = [me]): Person[] {
  const people = [...start]
  for (let i = 0; i < count; i += 1) {
    people.push(friend(`f${i}`, { colorSlot: pickColorSlot(people, random) }))
  }
  return people
}

const slotsOf = (people: Person[]) => people.filter((p) => !p.isMe).map(colorSlotOf)
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)
const ascending = (values: number[]) => [...values].sort((a, b) => a - b)
const anyRandom = fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), {
  minLength: 70,
  maxLength: 70,
})
const from = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('colorSlotOf', () => {
  it('uses a stored slot', () => {
    expect(colorSlotOf({ id: 'x', colorSlot: 0 })).toBe(0)
    expect(colorSlotOf({ id: 'x', colorSlot: 29 })).toBe(29)
  })

  // Known FNV-1a values. If the hash changed, people without a stored slot
  // would all change colour.
  it.each([
    ['', 1],
    ['a', 10],
  ])('falls back to FNV-1a of the id %j', (id, slot) => {
    expect(colorSlotOf({ id })).toBe(slot)
  })

  it.each([-1, 30, 1.5, Number.NaN])('ignores the invalid stored slot %d', (colorSlot) => {
    expect(colorSlotOf({ id: 'a', colorSlot })).toBe(10)
  })

  it('always returns a slot that exists', () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        const slot = colorSlotOf({ id })
        return Number.isInteger(slot) && slot >= 0 && slot < PERSON_COLOR_SLOTS
      }),
    )
  })
})

describe('pickColorSlot', () => {
  it('gives the first 15 friends 15 different soft colours, then 15 solid ones', () => {
    fc.assert(
      fc.property(anyRandom, (values) => {
        const slots = slotsOf(addFriends(30, from(values)))
        expect(ascending(slots.slice(0, 15))).toEqual(range(0, SOFT_COLOR_SLOTS))
        expect(ascending(slots.slice(15))).toEqual(range(SOFT_COLOR_SLOTS, PERSON_COLOR_SLOTS))
      }),
    )
  })

  it('repeats a colour only after all 30 are used, and again evenly', () => {
    fc.assert(
      fc.property(anyRandom, fc.integer({ min: 0, max: 70 }), (values, count) => {
        const uses = new Array<number>(PERSON_COLOR_SLOTS).fill(0)
        for (const slot of slotsOf(addFriends(count, from(values)))) uses[slot]! += 1
        expect(Math.max(...uses) - Math.min(...uses)).toBeLessThanOrEqual(1)
      }),
    )
  })

  it('chooses at random among the tied slots', () => {
    expect(pickColorSlot([me], () => 0)).toBe(0)
    expect(pickColorSlot([me], () => 0.999999)).toBe(14)
  })

  it('takes the slot used least', () => {
    const everySlotButOne = range(0, PERSON_COLOR_SLOTS)
      .filter((slot) => slot !== 22)
      .map((slot) => friend(`s${slot}`, { colorSlot: slot }))
    expect(pickColorSlot([me, ...everySlotButOne], () => 0.5)).toBe(22)
  })

  it('does not count me or archived friends', () => {
    const people = [
      { ...me, colorSlot: 0 },
      friend('gone', { colorSlot: 0, archived: true }),
    ]
    expect(pickColorSlot(people, () => 0)).toBe(0)
  })

  it('counts the colour a friend without a stored slot is shown in', () => {
    // "a" is displayed in slot 10, so slot 10 is taken.
    const taken = new Set(Array.from({ length: 200 }, (_, i) => pickColorSlot([me, friend('a')], () => i / 200)))
    expect(taken.has(10)).toBe(false)
    expect(taken.size).toBe(SOFT_COLOR_SLOTS - 1)
  })
})
