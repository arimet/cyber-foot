import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createConfetti } from '../src/render/confetti'

describe('confetti', () => {
  it('lands on the table top, never through it, and is gone after its life', () => {
    const c = createConfetti()
    c.burst(9, 1, 0, -1, 0, [0xffffff], 80)
    expect(c.live()).toBe(80)
    const m = new THREE.Matrix4(), p = new THREE.Vector3()
    for (let t = 0; t < 2; t += 1 / 60) c.update(1 / 60)
    for (let i = 0; i < 80; i++) {
      c.mesh.getMatrixAt(i, m)
      p.setFromMatrixPosition(m)
      if (Math.abs(p.x) < 10 && Math.abs(p.z) < 6) expect(p.y).toBeGreaterThanOrEqual(0)
    }
    for (let t = 0; t < 1; t += 1 / 60) c.update(1 / 60)
    expect(c.live()).toBe(0)
  })
})
