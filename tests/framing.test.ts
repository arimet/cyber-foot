import { describe, expect, it } from 'vitest'
import { GOAL_DEPTH, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH } from '../src/game/constants'
import { framedFocus } from '../src/render/framing'

const HALF_X = TABLE_HALF_LENGTH + GOAL_DEPTH

describe('framedFocus', () => {
  it('the wide view always centres the table', () => {
    expect(framedFocus(8, -5, 1)).toEqual({ x: 0, z: 0 })
  })

  it('the close view centres on the ball in midfield', () => {
    expect(framedFocus(1.5, -0.5, 1.7)).toEqual({ x: 1.5, z: -0.5 })
  })

  it('the close view stops at the table edges', () => {
    const f = framedFocus(10, 6.5, 1.7)
    expect(f.x).toBeCloseTo(HALF_X * (1 - 1 / 1.7))
    expect(f.z).toBeCloseTo(TABLE_HALF_WIDTH * (1 - 1 / 1.7))
    const g = framedFocus(-10, -6.5, 1.7)
    expect(g.x).toBeCloseTo(-HALF_X * (1 - 1 / 1.7))
  })
})
