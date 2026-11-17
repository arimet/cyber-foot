import * as THREE from 'three'
import { TOP_HALF_LENGTH, TOP_HALF_WIDTH } from './pitch'

// Rain over the roof: thin streaks that fall, and little rings that open where they land, on the table or the roof.
export const FLOOR_Y = -6
const COUNT = 1400
const SPEED = 24 // units per second
const DRIFT = -3 // wind along x
const LEN = 0.7
const BOX = { x: 34, zMin: -22, zMax: 16, top: 18 }
const SPLASHES = 90
const SPLASH_LIFE = 0.35 // s
const SPLASH_EVERY = 4 // one landing in four leaves a ring

export function groundAt(x: number, z: number): number {
  return Math.abs(x) <= TOP_HALF_LENGTH && Math.abs(z) <= TOP_HALF_WIDTH ? 0 : FLOOR_Y
}

export function createRain(): { group: THREE.Group; update(dt: number): void } {
  const group = new THREE.Group()
  const pos = new Float32Array(COUNT * 6)
  const drop = (i: number, y: number) => {
    const x = (Math.random() * 2 - 1) * BOX.x, z = BOX.zMin + Math.random() * (BOX.zMax - BOX.zMin)
    pos.set([x, y, z, x - (DRIFT * LEN) / SPEED, y + LEN, z], i * 6)
  }
  for (let i = 0; i < COUNT; i++) drop(i, FLOOR_Y + Math.random() * (BOX.top - FLOOR_Y))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0x9fb4e0, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  streaks.frustumCulled = false

  // rings: fade by darkening their colour, which with additive blending is the same as fading out
  const rings = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.8, 1, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    SPLASHES,
  )
  rings.frustumCulled = false
  const age = new Float32Array(SPLASHES).fill(SPLASH_LIFE)
  const at = new Float32Array(SPLASHES * 3)
  const m = new THREE.Matrix4(), c = new THREE.Color()
  let next = 0, landed = 0
  for (let i = 0; i < SPLASHES; i++) rings.setColorAt(i, c.setRGB(0, 0, 0))
  group.add(streaks, rings)

  return {
    group,
    update(dt: number) {
      const dy = SPEED * dt, dx = DRIFT * dt
      for (let i = 0; i < COUNT; i++) {
        const o = i * 6
        pos[o] += dx
        pos[o + 3] += dx
        pos[o + 1] -= dy
        pos[o + 4] -= dy
        const x = pos[o], z = pos[o + 2], g = groundAt(x, z)
        if (pos[o + 1] > g) continue
        if (++landed % SPLASH_EVERY === 0) {
          age[next] = 0
          at.set([x, g + 0.02, z], next * 3)
          next = (next + 1) % SPLASHES
        }
        drop(i, BOX.top)
      }
      geo.attributes.position.needsUpdate = true
      for (let i = 0; i < SPLASHES; i++) {
        age[i] = Math.min(SPLASH_LIFE, age[i] + dt)
        const k = age[i] / SPLASH_LIFE
        m.makeScale(0.05 + k * 0.3, 1, 0.05 + k * 0.3).setPosition(at[i * 3], at[i * 3 + 1], at[i * 3 + 2])
        rings.setMatrixAt(i, m)
        rings.setColorAt(i, c.setRGB(0.55, 0.65, 0.8).multiplyScalar((1 - k) * 0.5))
      }
      rings.instanceMatrix.needsUpdate = true
      rings.instanceColor!.needsUpdate = true
    },
  }
}
