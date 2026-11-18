import type { Pose, Table } from '../physics/table'
import { BALL_RADIUS, BASE_RADIUS, PIECES, TABLE_HALF_LENGTH } from './constants'
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
// A caught pass is another shot; an interception hands the ball over. ponytail: blind to the passes left this turn.
const PASS_BONUS = 12
const INTERCEPTED = 10

// The goal a team attacks: cyan defends -x.
const attackX = (me: Team) => (me === 'cyan' ? TABLE_HALF_LENGTH : -TABLE_HALF_LENGTH)
const roleOf = (id: string) => PIECES.find(p => p.id === id)!.role
const dir = (deg: number) => ({ dirX: Math.cos((deg * Math.PI) / 180), dirZ: Math.sin((deg * Math.PI) / 180) })

// Most promising first, taking the shooters in turn so a slow device that stops early has still tried each of them
// and a lob. Per shooter: a straight shot at the "ghost" point that drives the ball goalward, a lob there, then the
// remaining powers and angle offsets, at the ghost point before the ball centre.
export function candidates(table: Table, canShoot: (id: string) => boolean, me: Team): Shot[] {
  const ball = table.ballPose()
  const gx = attackX(me)
  const gd = Math.hypot(gx - ball.x, ball.z) || 1
  const shooters = PIECES.filter(p => p.team === me && canShoot(p.id))
    .map(p => ({ id: p.id, pose: table.piecePose(p.id) }))
    .sort((a, b) => Math.hypot(a.pose.x - ball.x, a.pose.z - ball.z) - Math.hypot(b.pose.x - ball.x, b.pose.z - ball.z))
    .slice(0, SHOOTERS)
  const perShooter = shooters.map(({ id, pose }) => {
    const reach = BASE_RADIUS[roleOf(id)] + BALL_RADIUS
    // The holder kicks the ball itself: it aims at the goal, not at a point behind the ball.
    const holds = table.capturedBy === id
    const ghost = holds ? { x: gx, z: 0 } : { x: ball.x - ((gx - ball.x) / gd) * reach, z: ball.z - (-ball.z / gd) * reach }
    const toward = (t: { x: number; z: number }) => (Math.atan2(t.z - pose.z, t.x - pose.x) * 180) / Math.PI
    const ground = (t: { x: number; z: number }, off: number, power: number): Shot =>
      ({ pieceId: id, ...dir(toward(t) + off), power, mode: 'ground' })
    const list: Shot[] = [ground(ghost, 0, POWERS[0]), { pieceId: id, ...dir(toward(ghost)), power: LOB_POWERS[0], mode: 'lob' }]
    for (const target of holds ? [ghost] : [ghost, ball])
      for (const off of OFFSETS_DEG)
        for (const power of POWERS) if (!(target === ghost && off === 0 && power === POWERS[0])) list.push(ground(target, off, power))
    for (const power of LOB_POWERS.slice(1)) list.push({ pieceId: id, ...dir(toward(ghost)), power, mode: 'lob' })
    return list
  })
  const out: Shot[] = []
  for (let i = 0; perShooter.some(l => i < l.length); i++) for (const l of perShooter) if (i < l.length) out.push(l[i])
  return out
}

// How good the table looks for `me` after a simulated shot.
export function scoreOutcome(
  table: Table, goalAgainst: Team | null, me: Team, tippedBefore: string[], ballBefore: Pose, captured: string | null = null,
): number {
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
  if (captured) s += captured.startsWith(me) ? PASS_BONUS : -INTERCEPTED
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
    const { goalAgainst, captured } = sim.runTurn(AI_HORIZON)
    const s = scoreOutcome(sim, goalAgainst, me, tippedBefore, ballBefore, captured)
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
