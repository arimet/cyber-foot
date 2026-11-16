import * as THREE from 'three'
import type { Rig } from './animals'

// The figure is fixed to its base by its feet. When the base changes speed, the top lags behind and springs back:
// launched forward it leans back, stopped dead it pitches forward, then wobbles still.
const SWAY_FREQ = 2.2 // Hz
const SWAY_K = (2 * Math.PI * SWAY_FREQ) ** 2
const SWAY_DAMP = 2 * 0.3 * Math.sqrt(SWAY_K) // damping ratio 0.3: a few visible wobbles
const SWAY_KICK = 0.4 // lean speed (rad/s) per m/s of sudden speed change
export const MAX_LEAN = 0.4 // rad
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
const MOOD_TIME = 2.2

// One figure's motion. The sway runs in world axes; `toLocal` turns a world direction into the rig's axes.
export class FigureMotion {
  private readonly sway = new Sway()
  private yaw = 0
  private pitch = 0

  constructor(private readonly phase: number) {}

  reset(): void {
    this.sway.reset()
  }

  update(d: Drive, toLocal: (x: number, z: number) => { x: number; z: number }, toWorld: (x: number, z: number) => { x: number; z: number }): Pose {
    const mood = d.moodT < MOOD_TIME ? d.mood : null
    const rest = toWorld(d.coil.x, d.coil.z + (mood === 'sulk' ? 0.12 : 0)) // a sulking figure slumps forward
    this.sway.update(d.dvx, d.dvz, rest.x, rest.z, d.dt)
    const lean = toLocal(this.sway.x, this.sway.z)
    const t = d.t + this.phase
    let yawT = d.look ? headYaw(d.look.x, d.look.z) : Math.sin(t * 0.4) * 0.5
    let pitchT = 0, roll = 0, hop = 0, lift = 0.05, wag = Math.sin(t * 2.1) * 0.18 - lean.x * 1.5
    if (d.stunned) { // dazed: the head rolls round
      yawT = Math.sin(t * 5) * 0.3
      pitchT = 0.2 + Math.cos(t * 5) * 0.2
      roll = Math.sin(t * 5 + 1) * 0.25
      lift = -0.3
      wag = 0
    }
    if (mood === 'cheer') {
      const k = Math.max(0, 1 - d.moodT / MOOD_TIME)
      hop = Math.abs(Math.sin(d.moodT * Math.PI * 2.5)) * 0.12 * k
      pitchT = -0.35
      lift = 0.5
      wag = Math.sin(t * 14) * 0.5
    } else if (mood === 'sulk') {
      pitchT = 0.5
      lift = -0.4
      wag = 0
    }
    const e = 1 - Math.exp(-HEAD_EASE * d.dt)
    this.yaw += (yawT - this.yaw) * e
    this.pitch += (pitchT - this.pitch) * e
    return {
      leanX: lean.x, leanZ: lean.z, hop, breath: 1 + Math.sin(t * 2.2) * 0.012,
      yaw: this.yaw, pitch: this.pitch, roll, wag, lift,
    }
  }
}
