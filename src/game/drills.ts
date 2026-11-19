import type { Team } from './types'
import type { Table } from '../physics/table'

export type DrillKey = 'empty' | 'penalty' | 'lob' | 'pass' | 'tackle'
export type Drill = {
  key: DrillKey
  shooter: string
  pieces: Record<string, { x: number; z: number }> // the shooter and the others on the pitch
  holder: string // starts with the ball at its feet, on the side of the goal it attacks
  win: 'goal' | 'pass' | { steal: string } // 'pass': a goal after at least one pass; steal: that piece loses the ball
}

// Cyan attacks the magenta goal, at +x. Each drill teaches one move and is solvable by it (see tests/drills.test.ts).
// The keeper stands off-centre and catches whatever touches it: the open side scores. The lob needs room to rise
// over the rhino. The pass: the rhino stands on the line from the fox to the goal, not on the cat's.
export const DRILLS: readonly Drill[] = [
  { key: 'empty', shooter: 'cyan-light1', pieces: { 'cyan-light1': { x: 3.5, z: 0 } }, holder: 'cyan-light1', win: 'goal' },
  {
    key: 'penalty', shooter: 'cyan-light1', holder: 'cyan-light1', win: 'goal',
    pieces: { 'cyan-light1': { x: 4.5, z: 0 }, 'magenta-keeper': { x: 9, z: 0.7 } },
  },
  {
    key: 'lob', shooter: 'cyan-light1', holder: 'cyan-light1', win: 'goal',
    pieces: { 'cyan-light1': { x: 1.5, z: 0 }, 'magenta-heavy1': { x: 6.5, z: 0 } },
  },
  {
    key: 'pass', shooter: 'cyan-light1', holder: 'cyan-light1', win: 'pass',
    pieces: { 'cyan-light1': { x: 2, z: -3 }, 'cyan-light2': { x: 5.5, z: 1.5 }, 'magenta-heavy1': { x: 6.5, z: -1.3 } },
  },
  {
    key: 'tackle', shooter: 'cyan-light1', holder: 'magenta-light1', win: { steal: 'magenta-light1' },
    pieces: { 'cyan-light1': { x: 3, z: 0 }, 'magenta-light1': { x: 5.5, z: 0 } },
  },
]

// Only the drill's pieces on the pitch, upright on their spots, and the ball at the holder's feet.
export function setUpDrill(table: Table, d: Drill): void {
  table.setBenched(new Set(table.pieces.map(p => p.id).filter(id => !(id in d.pieces))))
  for (const [id, p] of Object.entries(d.pieces)) table.placePiece(id, p.x, p.z)
  table.giveBall(d.holder, d.holder.startsWith('cyan') ? 1 : -1, 0)
}

export function drillMet(d: Drill, r: { goalAgainst: Team | null; passes: number; holder: string | null }): boolean {
  if (d.win === 'pass') return r.goalAgainst === 'magenta' && r.passes > 0
  if (d.win === 'goal') return r.goalAgainst === 'magenta'
  return r.goalAgainst !== 'cyan' && r.holder !== d.win.steal
}
