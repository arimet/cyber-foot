import * as THREE from 'three'
import { groundAt } from './rain'

// Voxel confetti: little glowing squares thrown up, fluttering down, lying on the table a moment, then gone.
const MAX = 600
const LIFE = 2.8 // s
const SHRINK = 0.4 // the last part of the life, spent shrinking away
const GRAVITY = 12
const FALL = 3.2 // paper flutters: it never falls faster than this
const DRAG = 1.4 // sideways speed lost per second in the air

type Bit = { age: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; axis: THREE.Vector3; angle: number; spin: number }

export function createConfetti(): {
  mesh: THREE.InstancedMesh
  burst(x: number, y: number, z: number, dx: number, dz: number, colors: readonly number[], n: number): void
  shower(halfX: number, halfZ: number, top: number, colors: readonly number[], n: number): void
  update(dt: number): void
  live(): number
} {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.04), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX)
  mesh.frustumCulled = false
  const bits: Bit[] = Array.from({ length: MAX }, () => ({
    age: LIFE, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, axis: new THREE.Vector3(0, 1, 0), angle: 0, spin: 0,
  }))
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color()
  let next = 0
  for (let i = 0; i < MAX; i++) {
    mesh.setMatrixAt(i, m.makeScale(0, 0, 0))
    mesh.setColorAt(i, c.setRGB(1, 1, 1))
  }

  const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number) => {
    const b = bits[next]
    Object.assign(b, { age: 0, x, y, z, vx, vy, vz, angle: Math.random() * 6, spin: 4 + Math.random() * 10 })
    b.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
    mesh.setColorAt(next, c.setHex(color).multiplyScalar(1.4)) // over 1: the bloom catches it
    next = (next + 1) % MAX
  }

  return {
    mesh,
    // n bits from (x, y, z), thrown up and out along (dx, dz), fanned wide
    burst(x, y, z, dx, dz, colors, n) {
      for (let i = 0; i < n; i++) {
        const out = 2 + Math.random() * 5, side = (Math.random() - 0.5) * 7
        spawn(x, y, z, dx * out - dz * side, 5 + Math.random() * 6, dz * out + dx * side, colors[i % colors.length])
      }
      mesh.instanceColor!.needsUpdate = true
    },
    // n bits falling from above the whole area, as if dropped from the sky
    shower(halfX, halfZ, top, colors, n) {
      for (let i = 0; i < n; i++) {
        const x = (Math.random() * 2 - 1) * halfX, z = (Math.random() * 2 - 1) * halfZ
        spawn(x, top + Math.random() * 3, z, (Math.random() - 0.5) * 2, -Math.random() * 2, (Math.random() - 0.5) * 2, colors[i % colors.length])
      }
      mesh.instanceColor!.needsUpdate = true
    },
    update(dt) {
      const drag = Math.exp(-DRAG * dt)
      for (let i = 0; i < MAX; i++) {
        const b = bits[i]
        if (b.age >= LIFE) continue
        b.age = Math.min(LIFE, b.age + dt)
        const floor = groundAt(b.x, b.z) + 0.03
        if (b.y > floor) { // in the air: tumbles and flutters
          b.vy = Math.max(-FALL, b.vy - GRAVITY * dt)
          b.vx *= drag
          b.vz *= drag
          b.x += b.vx * dt
          b.y = Math.max(floor, b.y + b.vy * dt)
          b.z += b.vz * dt
          b.angle += b.spin * dt
        }
        const k = b.age >= LIFE ? 0 : Math.min(1, (LIFE - b.age) / SHRINK)
        q.setFromAxisAngle(b.axis, b.angle)
        mesh.setMatrixAt(i, m.compose(p.set(b.x, b.y, b.z), q, s.setScalar(k)))
      }
      mesh.instanceMatrix.needsUpdate = true
    },
    live: () => bits.filter(b => b.age < LIFE).length,
  }
}
