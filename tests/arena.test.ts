import { describe, expect, it } from 'vitest'
import { CORNER_RADIUS, THROW_IN_GAP, TABLE_HALF_LENGTH as L, TABLE_HALF_WIDTH as W } from '../src/game/constants'
import { railGap, sweep, throwInSpot } from '../src/game/arena'

describe('railGap', () => {
  it('measures to the nearest rail and points back into the pitch', () => {
    const g = railGap(0, W - 0.5)
    expect(g.d).toBeCloseTo(0.5, 2)
    expect(g.nx).toBeCloseTo(0, 2)
    expect(g.nz).toBeCloseTo(-1, 2)
  })

  it('has no rail across the goal mouth: the nearest one is beside the post', () => {
    expect(railGap(-L + 0.5, 0).d).toBeCloseTo(Math.hypot(0.5, 2), 2)
  })

  it('follows the rounded corner', () => {
    const c = { x: -L + CORNER_RADIUS, z: -W + CORNER_RADIUS } // centre of the corner's arc
    const g = railGap(c.x - 1, c.z - 1)
    expect(g.d).toBeCloseTo(CORNER_RADIUS - Math.SQRT2, 1)
    expect(g.nx).toBeCloseTo(Math.SQRT1_2, 1)
    expect(g.nz).toBeCloseTo(Math.SQRT1_2, 1)
  })
})

describe('throwInSpot', () => {
  it('leaves a ball in open play alone', () => {
    expect(throwInSpot(0, 0, [])).toBeNull()
    expect(throwInSpot(-L + 0.5, 0, [])).toBeNull() // right in front of the goal
    expect(throwInSpot(-L + 0.5, 1.5, [])).toBeNull() // by the post, still in front of the goal
  })

  it('brings a ball off the rail, straight back into the pitch', () => {
    const s = throwInSpot(3, W - 0.9, [])!
    expect(s.x).toBeCloseTo(3, 2)
    expect(s.z).toBeCloseTo(W - THROW_IN_GAP, 2)
  })

  it('brings a ball out of a corner', () => {
    const s = throwInSpot(L - 1, W - 1, [])!
    expect(railGap(s.x, s.z).d).toBeGreaterThanOrEqual(THROW_IN_GAP - 0.01) // the arc is sampled
    expect(s.x).toBeLessThan(L - 1)
    expect(s.z).toBeLessThan(W - 1)
  })

  it('goes on past a piece standing on its spot', () => {
    const s = throwInSpot(3, W - 0.9, [{ ax: 3, az: W - THROW_IN_GAP, bx: 3, bz: W - THROW_IN_GAP, r: 0.6 }])!
    expect(s.x).toBeCloseTo(3, 2)
    expect(W - THROW_IN_GAP - s.z).toBeGreaterThanOrEqual(0.6 + 0.35)
  })
})

describe('sweep', () => {
  it('faces the pitch on both long sides', () => {
    for (const side of [-1, 1]) {
      const { positions: p, indices: ix } = sweep([[0, 0], [0, 1]])
      let found = 0
      // find a triangle on this long side, at mid-length
      for (let t = 0; t < ix.length; t += 3) {
        const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(i => [p[3 * i], p[3 * i + 1], p[3 * i + 2]])
        if (![a, b, c].every(v => Math.abs(v[2] - side * W) < 1e-6 && Math.abs(v[0]) < L - CORNER_RADIUS + 1e-6)) continue
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
        const nz = e1[0] * e2[1] - e1[1] * e2[0]
        expect(Math.sign(nz)).toBe(-side)
        found++
      }
      expect(found).toBeGreaterThan(0)
    }
  })
})
