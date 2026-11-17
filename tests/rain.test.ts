import { describe, expect, it } from 'vitest'
import { FLOOR_Y, groundAt } from '../src/render/rain'

describe('rain', () => {
  it('lands on the table top over the table', () => {
    expect(groundAt(0, 0)).toBe(0)
    expect(groundAt(-11.5, 6.9)).toBe(0) // behind a goal, still on the table
  })

  it('falls through to the roof beside the table', () => {
    expect(groundAt(14, 0)).toBe(FLOOR_Y)
    expect(groundAt(0, -9)).toBe(FLOOR_Y)
  })
})
