import { describe, expect, it } from 'vitest'
import { MAX_LEAN, MAX_YAW, Sway, headYaw } from '../src/render/rig'

const DT = 1 / 60

describe('sway', () => {
  it('a base launched forward leaves the top behind', () => {
    const s = new Sway()
    s.update(6, 0, 0, 0, DT)
    for (let i = 0; i < 5; i++) s.update(0, 0, 0, 0, DT)
    expect(s.x).toBeLessThan(-0.05)
  })

  it('a base stopped dead throws the top forward', () => {
    const s = new Sway()
    s.update(0, -4, 0, 0, DT)
    for (let i = 0; i < 5; i++) s.update(0, 0, 0, 0, DT)
    expect(s.z).toBeGreaterThan(0.05)
  })

  it('settles back to its rest lean', () => {
    const s = new Sway()
    s.update(8, 3, 0, 0, DT)
    for (let i = 0; i < 180; i++) s.update(0, 0, -0.1, 0, DT)
    expect(s.x).toBeCloseTo(-0.1, 2)
    expect(s.z).toBeCloseTo(0, 2)
  })

  it('never leans past MAX_LEAN, however hard the hit', () => {
    const s = new Sway()
    let worst = 0
    s.update(80, -60, 0, 0, DT)
    for (let i = 0; i < 60; i++) {
      s.update(0, 0, 0, 0, DT)
      worst = Math.max(worst, Math.hypot(s.x, s.z))
    }
    expect(worst).toBeLessThanOrEqual(MAX_LEAN + 1e-9)
  })
})

describe('headYaw', () => {
  it('faces the target when it is in front', () => {
    expect(headYaw(0, 1)).toBeCloseTo(0)
    expect(headYaw(1, 1)).toBeCloseTo(Math.PI / 4)
    expect(headYaw(-1, 1)).toBeCloseTo(-Math.PI / 4)
  })

  it('stops at the neck limit when the target is behind', () => {
    expect(headYaw(1, -1)).toBe(MAX_YAW)
    expect(headYaw(-1, -1)).toBe(-MAX_YAW)
  })
})
