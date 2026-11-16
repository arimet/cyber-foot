import { describe, expect, it } from 'vitest'
import { MASS, MAX_PULL, MIN_PULL } from '../src/game/constants'
import { aimFromDrag, arrowLength } from '../src/game/aim'

const o = { x: 0, z: 0 }

describe('aim', () => {
  it('dragging back toward -x aims toward +x', () => {
    const a = aimFromDrag(o, { x: -2, z: 0 })!
    expect(a.dirX).toBeCloseTo(1)
    expect(a.dirZ).toBeCloseTo(0)
  })

  it('power grows with pull and caps at 1', () => {
    expect(aimFromDrag(o, { x: 0, z: MAX_PULL / 2 })!.power).toBeCloseTo(0.5)
    expect(aimFromDrag(o, { x: 0, z: 2 * MAX_PULL })!.power).toBe(1)
  })

  it('a tiny drag or a click does not shoot', () => {
    expect(aimFromDrag(o, { x: MIN_PULL * 0.9, z: 0 })).toBe(null)
    expect(aimFromDrag(o, o)).toBe(null)
  })

  it("a light piece's arrow is longer than a heavy one's at equal power", () => {
    expect(arrowLength(0.5, 'light') / arrowLength(0.5, 'heavy')).toBeCloseTo(MASS.heavy / MASS.light)
  })
})
