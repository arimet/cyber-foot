import { describe, expect, it } from 'vitest'
import { type Drive, FigureMotion, MAX_LEAN, MAX_YAW, type Pose, Sway, headYaw, tiltUp } from '../src/render/rig'

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

describe('figure motion', () => {
  const same = (x: number, z: number) => ({ x, z })
  const still = (t: number): Drive => ({
    t, dt: DT, dvx: 0, dvz: 0, look: { x: 0, z: 1 }, coil: { x: 0, z: 0 }, stunned: false, mood: null, moodT: 99,
  })
  const run = (m: FigureMotion, from: number, seconds: number) => {
    const poses: Pose[] = []
    for (let i = 0; i < seconds * 60; i++) poses.push(m.update(still(from + i * DT), same, same))
    return poses
  }

  it('a figure waiting its turn still shifts its weight and glances about', () => {
    const poses = run(new FigureMotion(0), 0, 8)
    const span = (k: keyof Pose) => Math.max(...poses.map(p => p[k])) - Math.min(...poses.map(p => p[k]))
    expect(span('leanX') + span('leanZ')).toBeGreaterThan(0.08)
    expect(span('yaw')).toBeGreaterThan(0.3)
  })

  it('a figure standing back up starts crouched, takes its time, and ends upright', () => {
    const m = new FigureMotion(0)
    run(m, 0, 1)
    m.rise(1)
    const poses = run(m, 1, 2.5)
    expect(poses[0].breath).toBeLessThan(0.75) // crouched
    expect(poses[0].leanZ).toBeGreaterThan(0.4) // bent over its knees
    expect(poses[36].breath).toBeLessThan(0.95) // still getting up after 0.6 s
    expect(Math.abs(poses.at(-1)!.leanZ)).toBeLessThan(0.15)
    expect(poses.at(-1)!.breath).toBeCloseTo(1, 1)
  })
})

describe('tilting back up', () => {
  // fallen toward +x, base radius 0.6
  it('starts lying on its side, resting on the rim of its base', () => {
    const p = tiltUp(0, 1, 0, 0.6)
    expect(p.angle).toBeCloseTo(Math.PI / 2)
    expect(p.y).toBeCloseTo(0.6) // the base's centre is a radius above the table
    expect(p.x).toBeCloseTo(0) // right where it lay
  })

  it('rolls over the rim, and ends standing on its base', () => {
    const mid = tiltUp(0.5, 1, 0, 0.6)
    expect(mid.angle).toBeGreaterThan(0)
    expect(mid.angle).toBeLessThan(Math.PI / 2)
    expect(mid.y).toBeGreaterThan(0)
    expect(mid.y).toBeLessThan(0.6)
    const end = tiltUp(1, 1, 0, 0.6)
    expect(end.angle).toBeCloseTo(0)
    expect(end.x).toBeCloseTo(0)
    expect(end.y).toBeCloseTo(0)
  })

  it('starts from the slant it actually lies at', () => {
    const p = tiltUp(0, 1, 0, 0.6, 1.2)
    expect(p.angle).toBeCloseTo(1.2)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(0.6 * Math.sin(1.2))
  })
})
