import { CORNER_RADIUS, GOAL_HALF_WIDTH, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH } from './constants'

// The rail line seen from above: two open paths, one per long side, each running from a goal post round both
// rounded corners to the other goal post. Each sample carries the normal pointing into the pitch.
type Sample = { x: number; z: number; nx: number; nz: number }
const ARC_STEPS = 16

function railPath(side: 1 | -1): Sample[] {
  const L = TABLE_HALF_LENGTH, W = TABLE_HALF_WIDTH, R = CORNER_RADIUS
  const out: Sample[] = [{ x: -L, z: GOAL_HALF_WIDTH, nx: 1, nz: 0 }]
  for (const [cx, a0] of [[-L + R, Math.PI], [L - R, Math.PI / 2]]) {
    for (let k = 0; k <= ARC_STEPS; k++) {
      const a = a0 - (k / ARC_STEPS) * (Math.PI / 2), c = Math.cos(a), s = Math.sin(a)
      out.push({ x: cx + R * c, z: W - R + R * s, nx: -c, nz: -s })
    }
  }
  out.push({ x: L, z: GOAL_HALF_WIDTH, nx: -1, nz: 0 })
  // mirrored and reversed, so both paths wind the same way and their surfaces face the pitch
  return side === 1 ? out : out.reverse().map(p => ({ ...p, z: -p.z, nz: -p.nz }))
}

export const RAIL_PATHS: readonly Sample[][] = [railPath(1), railPath(-1)]

// Distance to the nearest rail, and the way back into the pitch from it.
export function railGap(x: number, z: number): { d: number; nx: number; nz: number } {
  let best = { d: Infinity, nx: 0, nz: 0 }
  for (const path of RAIL_PATHS) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i]
      const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz
      const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0
      const px = a.x + t * dx, pz = a.z + t * dz, d = Math.hypot(x - px, z - pz)
      if (d < best.d) best = d > 1e-9 ? { d, nx: (x - px) / d, nz: (z - pz) / d } : { d, nx: a.nx, nz: a.nz }
    }
  }
  return best
}

// Something on the floor: a segment from base to head (a point when it stands), with its radius.
export type Blocker = { ax: number; az: number; bx: number; bz: number; r: number }

export const segDist = (x: number, z: number, s: Blocker) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, len2 = dx * dx + dz * dz
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0
  return Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz))
}

// A surface swept along both rail paths. Profile points are (inset from the rail line, height), listed from the
// pitch side outward/upward, so the faces look at the pitch (or up, or out, for a profile going that way).
export function sweep(profile: readonly (readonly [number, number])[]): { positions: Float32Array; indices: Uint32Array } {
  const pos: number[] = [], idx: number[] = [], n = profile.length
  for (const path of RAIL_PATHS) {
    const base = pos.length / 3
    for (const p of path) for (const [u, y] of profile) pos.push(p.x + p.nx * u, y, p.z + p.nz * u)
    for (let i = 1; i < path.length; i++) {
      for (let j = 1; j < n; j++) {
        const a = base + (i - 1) * n + j - 1, b = base + i * n + j - 1, c = base + i * n + j, d = base + (i - 1) * n + j
        idx.push(a, c, b, a, d, c)
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

// The invisible glass above the rail: up from the rail's top at y0, curving in over the pitch until it is level.
export function glassProfile(y0: number, radius: number, steps = 8): [number, number][] {
  const out: [number, number][] = []
  for (let k = 1; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2)
    out.push([radius - radius * Math.cos(a), y0 + radius * Math.sin(a)])
  }
  return out
}

// The ramp's curve, from where it leaves the floor up to the rail's top.
export function rampProfile(radius: number, steps = 8): [number, number][] {
  const out: [number, number][] = []
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * (Math.PI / 2)
    out.push([radius - radius * Math.sin(a), radius - radius * Math.cos(a)])
  }
  return out
}
