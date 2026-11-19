import type { Shot, Team } from './types'
import type { Table } from '../physics/table'

export type DrillKey = 'empty' | 'penalty' | 'lob' | 'pass' | 'tackle' | 'orders' | 'anticipate'
export type Drill = {
  key: DrillKey
  shooter: string
  pieces: Record<string, { x: number; z: number }> // the shooter and the others on the pitch
  holder: string // starts with the ball at its feet
  side?: { x: number; z: number } // where at its feet; default: toward the goal its team attacks
  // 'pass': a goal after at least one earlier action (the pass); steal: that piece loses the ball; 'deny': magenta ends without the ball
  win: 'goal' | 'pass' | 'deny' | { steal: string }
  minOrders?: number // Strategy drills: orders the player must give
  script?: Shot[] // Strategy drills: the other team's orders, played at the same time
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

// Strategy mode. Orders: the same penalty, but two orders at once. Anticipate: the magenta cat passes to the rhino
// as the round starts, so a run at the cat finds nobody; the fox, near the lane's far end, must cut the pass or
// tackle the rhino as it receives (about a third of the slides that way work).
const PASSER = { x: 1, z: -2 }, RECEIVER = { x: -4, z: 1.5 }
const LANE = Math.hypot(RECEIVER.x - PASSER.x, RECEIVER.z - PASSER.z)
export const STRATEGY_DRILLS: readonly Drill[] = [
  {
    key: 'orders', shooter: 'cyan-light1', holder: 'cyan-light1', win: 'goal', minOrders: 2,
    pieces: { 'cyan-light1': { x: 4.5, z: 0 }, 'cyan-light2': { x: 2, z: 3 }, 'magenta-keeper': { x: 9, z: 0.7 } },
  },
  {
    key: 'anticipate', shooter: 'cyan-light1', holder: 'magenta-light1', win: 'deny',
    pieces: { 'cyan-light1': { x: -2.5, z: -1.8 }, 'magenta-light1': PASSER, 'magenta-heavy1': RECEIVER },
    side: { x: RECEIVER.x - PASSER.x, z: RECEIVER.z - PASSER.z },
    script: [{
      pieceId: 'magenta-light1', dirX: (RECEIVER.x - PASSER.x) / LANE, dirZ: (RECEIVER.z - PASSER.z) / LANE,
      power: (1.6 * LANE + 5) / 17.5, mode: 'ground', // arrives slow enough to be caught (see the AI's passes)
    }],
  },
]

// Only the drill's pieces on the pitch, upright on their spots, and the ball at the holder's feet.
export function setUpDrill(table: Table, d: Drill): void {
  table.setBenched(new Set(table.pieces.map(p => p.id).filter(id => !(id in d.pieces))))
  for (const [id, p] of Object.entries(d.pieces)) table.placePiece(id, p.x, p.z)
  table.giveBall(d.holder, d.side?.x ?? (d.holder.startsWith('cyan') ? 1 : -1), d.side?.z ?? 0)
}

export function drillMet(
  d: Drill, r: { goalAgainst: Team | null; actions: number; holder: string | null; orders: number },
): boolean {
  if (r.orders < (d.minOrders ?? 1)) return false
  if (d.win === 'pass') return r.goalAgainst === 'magenta' && r.actions > 0
  if (d.win === 'deny') return r.goalAgainst !== 'cyan' && !r.holder?.startsWith('magenta')
  if (d.win === 'goal') return r.goalAgainst === 'magenta'
  return r.goalAgainst !== 'cyan' && r.holder !== d.win.steal
}
