import type { Pose, Table } from '../physics/table'
import { BALL_DAMPING, KICK_SPEED, PIECES, TABLE_HALF_LENGTH } from './constants'
import type { Shot, Team } from './types'

export type Level = 'rookie' | 'pro' | 'legend'

const NOISE: Record<Level, { angleDeg: number; power: number }> = {
  rookie: { angleDeg: 12, power: 0.25 },
  pro: { angleDeg: 5, power: 0.1 },
  legend: { angleDeg: 1, power: 0.03 },
}
const AI_HORIZON = 240 // steps simulated per candidate
const MIN_CANDIDATES = 12
const BUDGET_MS = 1500 // wall time, frames included: thinking stays under the spec's 2 s
const SLICE_MS = 8 // compute per frame before yielding
const OFFSETS_DEG = [0, 4, -4, 8, -8]
const POWERS = [0.7, 0.95, 0.45]
const LOB_POWERS = [0.7, 0.95]
const SHOOTERS = 3 // only the pieces nearest the ball
// Having the ball is worth a few metres; a caught pass is another shot. ponytail: blind to the passes left this turn.
const POSSESSION = 15
const PASS_BONUS = 12
const PASS_ARRIVAL = 5 // m/s a pass should still have on reaching the teammate

// The goal a team attacks: cyan defends -x.
const attackX = (me: Team) => (me === 'cyan' ? TABLE_HALF_LENGTH : -TABLE_HALF_LENGTH)
const dir = (deg: number) => ({ dirX: Math.cos((deg * Math.PI) / 180), dirZ: Math.sin((deg * Math.PI) / 180) })

const teamOf = (id: string) => PIECES.find(p => p.id === id)!.team
const at = (from: { x: number; z: number }, to: { x: number; z: number }) => (Math.atan2(to.z - from.z, to.x - from.x) * 180) / Math.PI
const interleave = <T>(lists: T[][]): T[] => {
  const out: T[] = []
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

// Most promising first, mixed so a slow device that stops early has still tried each kind.
// With the ball: the holder shoots, lobs or passes. Without: the pieces nearest the ball slide at it, which tackles
// its holder or picks a loose ball up.
export function candidates(table: Table, canShoot: (id: string) => boolean, me: Team): Shot[] {
  const h = table.holder
  if (h && teamOf(h) === me && canShoot(h)) return kicks(table, h, me)
  const target = h ? table.piecePose(h) : table.ballPose()
  const sliders = PIECES.filter(p => p.team === me && canShoot(p.id))
    .map(p => ({ id: p.id, pose: table.piecePose(p.id) }))
    .sort((a, b) => Math.hypot(a.pose.x - target.x, a.pose.z - target.z) - Math.hypot(b.pose.x - target.x, b.pose.z - target.z))
    .slice(0, SHOOTERS)
  return interleave(sliders.map(({ id, pose }) => {
    const list: Shot[] = []
    for (const power of POWERS) for (const off of OFFSETS_DEG) list.push({ pieceId: id, ...dir(at(pose, target) + off), power, mode: 'ground' })
    return list
  }))
}

// The holder's kicks: at the goal (ground, then lobs), and soft passes that reach each standing teammate slowly
// enough to be caught (the ball slows by BALL_DAMPING per second, so it covers (v0 - v) / BALL_DAMPING).
function kicks(table: Table, id: string, me: Team): Shot[] {
  const pose = table.piecePose(id), goal = { x: attackX(me), z: 0 }
  const shots: Shot[] = [], lobs: Shot[] = [], passes: Shot[] = []
  for (const power of POWERS) for (const off of OFFSETS_DEG) shots.push({ pieceId: id, ...dir(at(pose, goal) + off), power, mode: 'ground' })
  for (const power of LOB_POWERS) lobs.push({ pieceId: id, ...dir(at(pose, goal)), power, mode: 'lob' })
  for (const p of PIECES) {
    if (p.team !== me || p.id === id || table.isTipped(p.id)) continue
    const mate = table.piecePose(p.id), d = Math.hypot(mate.x - pose.x, mate.z - pose.z)
    const power = Math.min(1, (BALL_DAMPING * d + PASS_ARRIVAL) / KICK_SPEED)
    for (const k of [1, 0.85, 1.15]) passes.push({ pieceId: id, ...dir(at(pose, mate)), power: Math.min(1, power * k), mode: 'ground' })
  }
  return interleave([shots, passes, lobs])
}

// How good the table looks for `me` after a simulated shot.
export function scoreOutcome(table: Table, goalAgainst: Team | null, me: Team, tippedBefore: string[], ballBefore: Pose): number {
  if (goalAgainst) return goalAgainst === me ? -1000 : 1000
  const ball = table.ballPose()
  const gx = attackX(me)
  const toGoal = (b: { x: number; z: number }) => Math.hypot(b.x - gx, b.z)
  let s = 10 * (toGoal(ballBefore) - toGoal(ball))
  s -= 15 * Math.max(0, 6 - Math.hypot(ball.x + gx, ball.z)) // ball near my own goal
  for (const id of table.tippedIds()) {
    if (tippedBefore.includes(id)) continue
    s += id.startsWith(me) ? -6 : 8
  }
  const h = table.holder
  if (h) s += teamOf(h) === me ? POSSESSION : -POSSESSION
  if (table.passedTo) s += PASS_BONUS
  return s
}

const now = () => performance.now()

// Evaluates candidates on table clones, yielding to the caller every few ms so frames keep flowing.
export function* think(
  table: Table,
  canShoot: (id: string) => boolean,
  me: Team,
  level: Level,
  rng: () => number = Math.random,
): Generator<void, Shot> {
  const list = candidates(table, canShoot, me)
  if (!list.length) throw new Error(`${me} has no piece that can shoot`) // Match passes such turns
  const ballBefore = table.ballPose()
  const tippedBefore = table.tippedIds()
  let best = list[0], bestScore = -Infinity
  const start = now()
  let slice = now()
  for (let i = 0; i < list.length; i++) {
    const sim = table.clone()
    sim.shoot(list[i])
    const { goalAgainst } = sim.runTurn(AI_HORIZON)
    const s = scoreOutcome(sim, goalAgainst, me, tippedBefore, ballBefore)
    sim.free()
    if (s > bestScore) [best, bestScore] = [list[i], s]
    if (i + 1 >= MIN_CANDIDATES && now() - start > BUDGET_MS) break
    if (now() - slice > SLICE_MS) {
      yield
      slice = now()
    }
  }
  return blur(best, level, rng)
}

// Level noise: the shot is turned and its power scaled, both uniformly within the level's range.
function blur(shot: Shot, level: Level, rng: () => number): Shot {
  const n = NOISE[level]
  const turn = (rng() * 2 - 1) * n.angleDeg
  const power = Math.max(0.05, Math.min(1, shot.power * (1 + (rng() * 2 - 1) * n.power)))
  return { ...shot, ...dir((Math.atan2(shot.dirZ, shot.dirX) * 180) / Math.PI + turn), power }
}

export function runThink(gen: Generator<void, Shot>): Shot {
  for (;;) {
    const r = gen.next()
    if (r.done) return r.value
  }
}
