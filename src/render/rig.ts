import * as THREE from 'three'
import type { Rig } from './animals'

// The figure is fixed to its base by its feet. When the base changes speed, the top lags behind and springs back:
// launched forward it leans back, stopped dead it pitches forward, then wobbles still.
const SWAY_FREQ = 2.2 // Hz
const SWAY_K = (2 * Math.PI * SWAY_FREQ) ** 2
const SWAY_DAMP = 2 * 0.3 * Math.sqrt(SWAY_K) // damping ratio 0.3: a few visible wobbles
const SWAY_KICK = 0.7 // lean speed (rad/s) per m/s of sudden speed change
export const MAX_LEAN = 0.55 // rad
export const MAX_YAW = 1.2 // rad: the neck turns about 70° each way

// Lean of the top toward (x, z), in radians, world axes.
export class Sway {
  x = 0
  z = 0
  private vx = 0
  private vz = 0

  // dvx/dvz: change of the base's speed since the last frame. restX/restZ: the lean it settles to.
  update(dvx: number, dvz: number, restX: number, restZ: number, dt: number): void {
    this.vx += -dvx * SWAY_KICK + (-SWAY_K * (this.x - restX) - SWAY_DAMP * this.vx) * dt
    this.vz += -dvz * SWAY_KICK + (-SWAY_K * (this.z - restZ) - SWAY_DAMP * this.vz) * dt
    this.x += this.vx * dt
    this.z += this.vz * dt
    const m = Math.hypot(this.x, this.z)
    if (m > MAX_LEAN) { // a stop, not a bounce
      this.x *= MAX_LEAN / m
      this.z *= MAX_LEAN / m
      this.vx = this.vz = 0
    }
  }

  reset(): void {
    this.x = this.z = this.vx = this.vz = 0
  }
}

// Yaw that turns a head facing +z toward the local direction (x, z), within what a neck allows.
export function headYaw(x: number, z: number): number {
  return THREE.MathUtils.clamp(Math.atan2(x, z), -MAX_YAW, MAX_YAW)
}

// Everything a figure can do, in the rig's own axes (facing +z).
export type Pose = {
  leanX: number; leanZ: number // top of the body displaced toward (leanX, leanZ), radians
  hop: number // feet above the base
  breath: number // body height scale
  yaw: number; pitch: number; roll: number // head; pitch > 0 looks down
  wag: number; lift: number // tail; lift > 0 raises it
}
export const REST: Pose = { leanX: 0, leanZ: 0, hop: 0, breath: 1, yaw: 0, pitch: 0, roll: 0, wag: 0, lift: 0 }

const axis = new THREE.Vector3()
export function applyPose(rig: Rig, p: Pose): void {
  const m = Math.hypot(p.leanX, p.leanZ)
  if (m > 1e-6) rig.body.quaternion.setFromAxisAngle(axis.set(p.leanZ / m, 0, -p.leanX / m), m) // up x lean
  else rig.body.quaternion.identity()
  rig.body.position.y = p.hop
  rig.body.scale.set(1, p.breath, 1)
  rig.head?.rotation.set(p.pitch, p.yaw, p.roll, 'YXZ')
  rig.tail?.rotation.set(p.lift, p.wag, 0, 'YXZ')
}

export type Mood = 'cheer' | 'sulk' | null
export type Drive = {
  t: number; dt: number
  dvx: number; dvz: number // world change of the base's speed this frame
  look: { x: number; z: number } | null // local direction to look at
  coil: { x: number; z: number } // local lean held while being pulled back for a shot
  stunned: boolean
  mood: Mood; moodT: number // seconds since the mood started
}

const HEAD_EASE = 6 // per second
export const MOOD_TIME = 2.2
const RISE_TIME = 2

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => x * x * (3 - 2 * x)
const bump = (k: number, from: number, len: number) => Math.sin(Math.PI * clamp01((k - from) / len)) // 0 -> 1 -> 0

export const TILT_TIME = 0.7 // s to roll the base back upright, before the figure straightens up

// A piece that fell toward (fx, fz) is rolled back up over the rim of its base (radius r): at k = 0 it lies on its
// side where it fell, at k = 1 it stands where the rules put it, right under that spot. Returns the tilt about the
// axis (fz, 0, -fx) and where the base's centre is, relative to where it ends up.
// `from`: the slant it lay at, from the vertical.
export function tiltUp(k: number, fx: number, fz: number, r: number, from = Math.PI / 2): { angle: number; x: number; y: number; z: number } {
  const e = smooth(clamp01(k))
  const angle = from * (1 - e)
  const out = r * (1 - Math.cos(angle)) - r * (1 - Math.cos(from)) * (1 - e) // round the rim, less the slide to the spot
  return { angle, x: fx * out, y: r * Math.sin(angle), z: fz * out }
}

// Back up after a fall: crouched over its knees, eyes on the floor, a beat to gather itself, then it straightens
// up, stretches a little and shakes the daze off.
function rising(k: number): { lean: number; squash: number; pitch: number; shake: number } {
  const e = smooth(clamp01((k - 0.25) / 0.85))
  const s = k - 1.15
  return {
    lean: 0.7 * (1 - e) - 0.06 * bump(k, 0.95, 0.45),
    squash: 0.62 + 0.38 * e + 0.06 * bump(k, 0.9, 0.5),
    pitch: 0.5 * (1 - e),
    shake: s > 0 && s < 0.8 ? Math.sin(s * 16) * 0.4 * (1 - s / 0.8) : 0,
  }
}

// One figure's motion. The sway runs in world axes; `toLocal` turns a world direction into the rig's axes.
export class FigureMotion {
  private readonly sway = new Sway()
  private yaw = 0
  private pitch = 0
  private riseAt = -Infinity

  constructor(private readonly phase: number) {}

  reset(): void {
    this.sway.reset()
  }

  // The piece was just stood back up (Drive.t of that moment).
  rise(t: number): void {
    this.riseAt = t
    this.sway.reset()
  }

  update(d: Drive, toLocal: (x: number, z: number) => { x: number; z: number }, toWorld: (x: number, z: number) => { x: number; z: number }): Pose {
    const mood = d.moodT < MOOD_TIME ? d.mood : null
    const t = d.t + this.phase
    // waiting: weight shifts from foot to foot, now and then a glance aside
    const idleX = Math.sin(t * 0.9) * 0.07, idleZ = Math.sin(t * 0.55 + 1) * 0.05
    const glance = Math.sin(t * 0.37 + this.phase) > 0.85 ? Math.sign(Math.sin(t * 0.11 + this.phase) || 1) * 0.9 : 0
    const rest = toWorld(d.coil.x + idleX, d.coil.z + idleZ + (mood === 'sulk' ? 0.2 : 0)) // a sulking figure slumps forward
    this.sway.update(d.dvx, d.dvz, rest.x, rest.z, d.dt)
    const lean = toLocal(this.sway.x, this.sway.z)
    let yawT = (d.look ? headYaw(d.look.x, d.look.z) : Math.sin(t * 0.4) * 0.5) + glance
    let pitchT = 0, roll = 0, hop = 0, lift = 0.05, wag = Math.sin(t * 2.1) * 0.3 - lean.x * 2
    if (d.stunned) { // dazed: the head rolls round
      yawT = Math.sin(t * 5) * 0.45
      pitchT = 0.3 + Math.cos(t * 5) * 0.3
      roll = Math.sin(t * 5 + 1) * 0.35
      lift = -0.4
      wag = 0
    }
    if (mood === 'cheer') {
      const k = Math.max(0, 1 - d.moodT / MOOD_TIME)
      hop = Math.abs(Math.sin(d.moodT * Math.PI * 2.5)) * 0.3 * k
      pitchT = -0.5
      lift = 0.7
      wag = Math.sin(t * 14) * 0.7
    } else if (mood === 'sulk') {
      pitchT = 0.7
      lift = -0.5
      wag = 0
    }
    const e = 1 - Math.exp(-HEAD_EASE * d.dt)
    this.yaw += (yawT - this.yaw) * e
    this.pitch += (pitchT - this.pitch) * e
    const r = d.t - this.riseAt < RISE_TIME ? rising(d.t - this.riseAt) : { lean: 0, squash: 1, pitch: 0, shake: 0 }
    return {
      leanX: lean.x, leanZ: lean.z + r.lean, hop, breath: (1 + Math.sin(t * 2.2) * 0.025) * r.squash,
      yaw: this.yaw + r.shake, pitch: this.pitch + r.pitch, roll, wag, lift,
    }
  }
}
