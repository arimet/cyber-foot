import { describe, expect, it } from 'vitest'
import { panelAt } from '../src/render/ball'

const PHI = (1 + Math.sqrt(5)) / 2

describe('ball panels', () => {
  it('has a pentagon around each of the 12 icosahedron corners', () => {
    expect(panelAt(0, 1, PHI)).toBe('pentagon')
    expect(panelAt(-PHI, 0, 1)).toBe('pentagon')
  })

  it('has a hexagon at the middle of each icosahedron face', () => {
    expect(panelAt(0 + 1 + PHI, 1 + PHI + 0, PHI + 0 + 1)).toBe('hexagon') // face (0,1,φ) (1,φ,0) (φ,0,1)
  })

  it('has a seam halfway between two hexagons', () => {
    const a = [1 + PHI, 1 + PHI, 1 + PHI].map(v => v / 3), b = [0 + 1 - 1, 1 + PHI + PHI, PHI + 0 + 0].map(v => v / 3)
    // faces (0,1,φ)(1,φ,0)(φ,0,1) and (0,1,φ)(1,φ,0)(-1,φ,0) share an edge
    const n = (v: number[]) => { const l = Math.hypot(...v); return v.map(c => c / l) }
    const [x, y, z] = n(n(a).map((c, i) => c + n(b)[i]))
    expect(panelAt(x, y, z)).toBe('seam')
  })
})
