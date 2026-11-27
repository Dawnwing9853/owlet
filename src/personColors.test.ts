// The person chip colours in index.css must stay readable.
import { describe, expect, it } from 'vitest'
import { PERSON_COLOR_SLOTS } from './domain/colors'
import css from './index.css?raw'

function variable(name: string): string {
  const found = [...css.matchAll(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`, 'g'))]
  if (found.length !== 1) throw new Error(`expected one ${name} in index.css, found ${found.length}`)
  return found[0]![1]!
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

const slots = Array.from({ length: PERSON_COLOR_SLOTS }, (_, slot) => slot)

describe('person colours', () => {
  it('measures contrast the WCAG way', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
  })

  it.each(slots)('slot %i has text at 6:1 or better on its background', (slot) => {
    expect(contrast(variable(`--person-${slot}-fg`), variable(`--person-${slot}-bg`))).toBeGreaterThanOrEqual(6)
  })

  it('has a different background in every slot, and no extra slots', () => {
    const backgrounds = slots.map((slot) => variable(`--person-${slot}-bg`).toUpperCase())
    expect(new Set(backgrounds).size).toBe(PERSON_COLOR_SLOTS)
    expect(css).not.toContain(`--person-${PERSON_COLOR_SLOTS}-bg`)
  })

  it('never reuses the debt or paid colours for a person', () => {
    const personColours = slots.flatMap((slot) => [variable(`--person-${slot}-bg`), variable(`--person-${slot}-fg`)])
    for (const status of ['#B23A1E', '#4F6B2E', '#6B4A2F']) {
      expect(personColours.map((c) => c.toUpperCase())).not.toContain(status)
    }
  })
})
