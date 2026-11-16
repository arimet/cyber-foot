import { MASS, MAX_IMPULSE, MAX_PULL, MIN_PULL } from './constants'
import type { Role } from './types'

type P = { x: number; z: number }

const ARROW_SCALE = 0.25 // table units per unit of launch speed

// Slingshot: pull back from the piece, it flies the opposite way.
export function aimFromDrag(origin: P, pointer: P): { dirX: number; dirZ: number; power: number } | null {
  const dx = origin.x - pointer.x, dz = origin.z - pointer.z
  const len = Math.hypot(dx, dz)
  if (len < MIN_PULL) return null
  return { dirX: dx / len, dirZ: dz / len, power: Math.min(len / MAX_PULL, 1) }
}

// Proportional to launch speed, so a light piece's arrow shows its longer reach.
export const arrowLength = (power: number, role: Role): number => ((power * MAX_IMPULSE) / MASS[role]) * ARROW_SCALE
