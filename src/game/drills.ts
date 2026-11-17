import { BALL_RADIUS } from './constants'
import type { Team } from './types'
import type { Table } from '../physics/table'

export type DrillKey = 'empty' | 'penalty' | 'lob' | 'tip'
export type Drill = {
  key: DrillKey
  shooter: string
  pieces: Record<string, { x: number; z: number }> // the shooter and the others on the pitch
  ball: { x: number; z: number }
  win: 'goal' | { tip: string }
}

// Cyan shoots at the magenta goal, at +x. Each drill teaches one move and is solvable by it (see tests/drills.test.ts).
// The keeper stands off-centre: a straight shot hits it, the open side scores. The lob needs a run-up to clear the rhino.
const fox = (x: number) => ({ 'cyan-light1': { x, z: 0 } })
export const DRILLS: readonly Drill[] = [
  { key: 'empty', shooter: 'cyan-light1', pieces: fox(2.5), ball: { x: 4.5, z: 0 }, win: 'goal' },
  { key: 'penalty', shooter: 'cyan-light1', pieces: { ...fox(2.5), 'magenta-keeper': { x: 9, z: 0.7 } }, ball: { x: 4.5, z: 0 }, win: 'goal' },
  { key: 'lob', shooter: 'cyan-light1', pieces: { ...fox(0.5), 'magenta-heavy1': { x: 6.5, z: 0 } }, ball: { x: 2.5, z: 0 }, win: 'goal' },
  { key: 'tip', shooter: 'cyan-light1', pieces: { ...fox(3.5), 'magenta-light1': { x: 6, z: 0 } }, ball: { x: 0, z: -4 }, win: { tip: 'magenta-light1' } },
]

// Only the drill's pieces on the pitch, upright on their spots, and the ball on its own.
export function setUpDrill(table: Table, d: Drill): void {
  table.setBenched(new Set(table.pieces.map(p => p.id).filter(id => !(id in d.pieces))))
  for (const [id, p] of Object.entries(d.pieces)) table.placePiece(id, p.x, p.z)
  table.placeBall(d.ball.x, BALL_RADIUS, d.ball.z)
}

export function drillMet(d: Drill, r: { goalAgainst: Team | null; tipped: string[] }): boolean {
  return d.win === 'goal' ? r.goalAgainst === 'magenta' : r.tipped.includes(d.win.tip)
}
