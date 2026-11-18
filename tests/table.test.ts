import { beforeEach, describe, expect, it } from 'vitest'
import {
  BALL_RADIUS, BASE_RADIUS, BODY_HEIGHT, GLASS_HEIGHT, GOAL_DEPTH, KICKOFF, MAX_TURN_STEPS, PIECES, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH,
} from '../src/game/constants'
import { RAMP_RADIUS, PIECE_INSET } from '../src/game/constants'
import { railGap } from '../src/game/arena'
import { Table } from '../src/physics/table'

let table: Table
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)

describe('Table', () => {
  beforeEach(async () => {
    table = await Table.create()
    table.reset()
  })

  it('reset puts every piece at its kickoff spot, upright, and the ball at the centre', () => {
    for (const p of PIECES) {
      const pose = table.piecePose(p.id)
      expect(pose.x).toBeCloseTo(KICKOFF[p.id].x, 5)
      expect(pose.z).toBeCloseTo(KICKOFF[p.id].z, 5)
      expect(Math.abs(pose.qw)).toBeCloseTo(1, 5)
    }
    const ball = table.ballPose()
    expect(ball.x).toBeCloseTo(0, 5)
    expect(ball.z).toBeCloseTo(0, 5)
  })

  it('a light piece travels much farther than a heavy one for the same shot', () => {
    const travel = (id: string) => {
      table.reset()
      table.placePiece(id, -8, -5.3)
      const start = table.piecePose(id)
      table.shoot({ pieceId: id, dirX: 1, dirZ: 0, power: 0.6, mode: 'ground' })
      table.runTurn()
      return dist(start, table.piecePose(id))
    }
    const dLight = travel('cyan-light1')
    const dHeavy = travel('cyan-heavy1')
    expect(dHeavy).toBeGreaterThan(0.2)
    expect(dLight).toBeGreaterThan(1.5 * dHeavy)
  })

  it('a heavy at full power leaves at least as fast as the keeper', () => {
    const launch = (id: string) => {
      table.reset()
      table.shoot({ pieceId: id, dirX: 0, dirZ: 1, power: 1, mode: 'ground' })
      return table.piecePose(id).vz
    }
    expect(launch('cyan-heavy1')).toBeGreaterThanOrEqual(launch('cyan-keeper') - 1e-6)
  })

  it('a piece driven into the ball sends it forward', () => {
    table.placePiece('cyan-light1', -3, 0)
    table.placeBall(-1.5, BALL_RADIUS, 0)
    table.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 0.8, mode: 'ground' })
    table.runTurn()
    expect(table.ballPose().x).toBeGreaterThan(0)
  })

  it('ball fully past the goal line between the posts is a goal against that side', () => {
    table.placeBall(-10.6, BALL_RADIUS, 0, -3, 0, 0)
    expect(table.runTurn().goalAgainst).toBe('cyan')
  })

  it('ball resting on the line is not a goal', () => {
    table.placeBall(-10, BALL_RADIUS, 0)
    expect(table.runTurn().goalAgainst).toBe(null)
  })

  it('ball hitting the post wide of the goal is not a goal', () => {
    table.placeBall(-9, BALL_RADIUS, 2.6, -8, 0, 0)
    expect(table.runTurn().goalAgainst).toBe(null)
    expect(table.ballPose().x).toBeGreaterThan(-TABLE_HALF_LENGTH)
  })

  it('nothing leaves the table', () => {
    table.placeBall(0, BALL_RADIUS, 0, 25, 15, 25)
    for (let i = 0; i < MAX_TURN_STEPS; i++) {
      table.step()
      const b = table.ballPose()
      expect(Math.abs(b.x)).toBeLessThanOrEqual(TABLE_HALF_LENGTH + GOAL_DEPTH)
      expect(Math.abs(b.z)).toBeLessThanOrEqual(TABLE_HALF_WIDTH)
      expect(b.y).toBeGreaterThanOrEqual(0)
      expect(b.y).toBeLessThanOrEqual(GLASS_HEIGHT)
    }
  })

  it.each([
    ['a side rail', 0, TABLE_HALF_WIDTH - 0.3],
    ['a corner', TABLE_HALF_LENGTH - 1, TABLE_HALF_WIDTH - 1],
  ])('a ball dropped against %s rolls back out by itself', (_, x, z) => {
    table.placeBall(x, 1.2, z)
    table.runTurn()
    const b = table.ballPose()
    expect(railGap(b.x, b.z).d).toBeGreaterThanOrEqual(RAMP_RADIUS - 0.05)
    expect(b.y).toBeCloseTo(BALL_RADIUS, 1)
  })

  it('a hard ball into a rail comes back out with pace', () => {
    table.placeBall(0, BALL_RADIUS, TABLE_HALF_WIDTH - 0.9, 0, 0, 12)
    table.runTurn()
    expect(table.ballPose().z).toBeLessThan(TABLE_HALF_WIDTH / 2)
  })

  it('a ball climbing the glass above a rail is sent back toward the middle', () => {
    table.placeBall(0, 1.2, TABLE_HALF_WIDTH - 0.4, 0, 9, 0) // straight up along the glass
    let top = false
    for (let i = 0; i < MAX_TURN_STEPS; i++) {
      table.step()
      const b = table.ballPose()
      if (b.y > 2) top = true
      if (top && b.y < 1.2) {
        expect(railGap(b.x, b.z).d).toBeGreaterThan(1.5)
        return
      }
    }
    throw new Error('the ball never came back down')
  })

  it('a piece driven into a rail stops off the ramp, upright', () => {
    table.placePiece('cyan-heavy1', 0, 3)
    table.shoot({ pieceId: 'cyan-heavy1', dirX: 0, dirZ: 1, power: 0.5, mode: 'ground' })
    table.runTurn()
    const p = table.piecePose('cyan-heavy1')
    expect(railGap(p.x, p.z).d).toBeGreaterThanOrEqual(PIECE_INSET + BASE_RADIUS.heavy - 0.05)
    expect(table.isTipped('cyan-heavy1')).toBe(false)
  })

  it('a turn always ends within MAX_TURN_STEPS', () => {
    table.placePiece('cyan-heavy1', -1.5, 0.5)
    table.shoot({ pieceId: 'cyan-heavy1', dirX: 1, dirZ: 0, power: 1, mode: 'ground' })
    expect(table.runTurn().steps).toBeLessThanOrEqual(MAX_TURN_STEPS)
  })

  it('a quiet table settles', () => {
    expect(table.runTurn().steps).toBeLessThan(MAX_TURN_STEPS)
  })

  it('same state + same shot = same result', async () => {
    const play = async () => {
      const t = await Table.create()
      t.reset()
      t.shoot({ pieceId: 'cyan-light1', dirX: 0.8, dirZ: 0.6, power: 0.9, mode: 'ground' })
      t.runTurn()
      return t.ballPose()
    }
    const a = await play()
    const b = await play()
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6)
    expect(Math.abs(a.z - b.z)).toBeLessThan(1e-6)
  })
})

describe('lob and tipping', () => {
  beforeEach(async () => {
    table = await Table.create()
    table.reset()
  })

  const ballPeak = () => {
    let maxY = 0
    for (let i = 0; i < MAX_TURN_STEPS; i++) {
      table.step()
      maxY = Math.max(maxY, table.ballPose().y)
      if (table.isSettled()) break
    }
    return maxY
  }

  it('a lob lifts the ball', () => {
    table.placePiece('cyan-light1', -3, 0)
    table.placeBall(-1.8, BALL_RADIUS, 0)
    table.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 0.8, mode: 'lob' })
    expect(ballPeak()).toBeGreaterThan(4 * BALL_RADIUS)
  })

  it('a ground shot keeps the ball low', () => {
    table.placePiece('cyan-light1', -3, 0)
    table.placeBall(-1.8, BALL_RADIUS, 0)
    table.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 0.8, mode: 'ground' })
    expect(ballPeak()).toBeLessThan(2 * BALL_RADIUS)
  })

  it.each(['cyan-keeper', 'cyan-heavy1', 'cyan-light1'])('a full-power ground shot on an open table does not tip %s', id => {
    table.placePiece(id, -8, -5)
    table.shoot({ pieceId: id, dirX: 1, dirZ: 0, power: 1, mode: 'ground' })
    table.runTurn()
    expect(table.isTipped(id)).toBe(false)
  })

  it('a heavy piece at full power can tip a light one', () => {
    table.placePiece('magenta-light1', 0, 5.2)
    table.placePiece('cyan-heavy1', -3, 5.2)
    table.shoot({ pieceId: 'cyan-heavy1', dirX: 1, dirZ: 0, power: 1, mode: 'ground' })
    table.runTurn()
    expect(table.isTipped('magenta-light1')).toBe(true)
  })

  it('a soft bump tips nobody', () => {
    table.placePiece('magenta-light1', 0, 5.2)
    table.placePiece('cyan-heavy1', -1.7, 5.2)
    table.shoot({ pieceId: 'cyan-heavy1', dirX: 1, dirZ: 0, power: 0.3, mode: 'ground' })
    table.runTurn()
    expect(table.tippedIds()).toEqual([])
    expect(table.piecePose('magenta-light1').x).toBeGreaterThan(0.01) // it was hit
  })

  // Parks every piece out of the way, then plays shooter into target along z=0.
  // A fresh table each time: reset() keeps Rapier's contact caches, which makes back-to-back runs drift.
  const duel = async (shooter: string, target: string, power: number) => {
    table = await Table.create()
    PIECES.forEach((p, i) => table.placePiece(p.id, -8 + (i % 5) * 4, i < 5 ? -5.6 : 5.6))
    table.placeBall(9, BALL_RADIUS, 4.5)
    table.placePiece(target, 0, 0)
    table.placePiece(shooter, -3, 0)
    table.shoot({ pieceId: shooter, dirX: 1, dirZ: 0, power, mode: 'ground' })
    table.runTurn()
    return table.isTipped(target)
  }

  it.each([
    ['cyan-light1', 'magenta-light1', true],
    ['cyan-light1', 'magenta-heavy1', false], // heavies are hard to dislodge: tipping one is allowed, not required
    ['cyan-heavy1', 'magenta-light1', true],
  ] as const)('a harder hit of %s on %s never tips less', async (shooter, target, mustTip) => {
    const tips: boolean[] = []
    for (const p of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) tips.push(await duel(shooter, target, p))
    const first = tips.indexOf(true)
    if (mustTip) expect(first, `tips by power: ${tips}`).toBeGreaterThan(-1)
    if (first >= 0) expect(tips.slice(first).every(Boolean), `tips by power: ${tips}`).toBe(true)
  })

  it('a light tap between two lights tips nobody', async () => {
    expect(await duel('cyan-light1', 'magenta-light1', 0.3)).toBe(false)
    expect(table.isTipped('cyan-light1')).toBe(false)
  })

  it.each([0.8, 0.9, 1])('a light shot into a side rail at power %s does not tip itself', power => {
    table.reset()
    PIECES.forEach((p, i) => table.placePiece(p.id, -8 + (i % 5) * 4, i < 5 ? -5.6 : 5.6))
    table.placePiece('cyan-light1', 0, 0)
    table.shoot({ pieceId: 'cyan-light1', dirX: 0.3, dirZ: 0.95, power, mode: 'ground' })
    table.runTurn()
    expect(table.isTipped('cyan-light1')).toBe(false)
  })

  it('tilt past 45° counts as tipped, below does not', () => {
    table.tilt('cyan-light1', 0.9)
    expect(table.isTipped('cyan-light1')).toBe(true)
    table.tilt('cyan-light1', 0.6)
    expect(table.isTipped('cyan-light1')).toBe(false)
    expect(table.tippedIds()).toEqual([])
  })

  it('standUp against the rail still clears its neighbour', () => {
    table.placePiece('cyan-heavy1', 9.95, -5)
    table.tilt('cyan-heavy1', 1.5)
    table.placePiece('cyan-heavy2', 8.5, -5)
    table.standUp('cyan-heavy1')
    const a = table.piecePose('cyan-heavy1'), b = table.piecePose('cyan-heavy2')
    expect(dist(a, b)).toBeGreaterThanOrEqual(2 * BASE_RADIUS.heavy - 1e-6)
    expect(a.x).toBeLessThanOrEqual(TABLE_HALF_LENGTH - BASE_RADIUS.heavy + 1e-6)
  })

  it("standUp does not stand a piece inside a lying piece's body", () => {
    table.placePiece('magenta-heavy1', 0, 0)
    table.tilt('magenta-heavy1', Math.PI / 2) // lies with its head toward -x
    table.placePiece('cyan-light1', -1, 0.3)
    table.tilt('cyan-light1', 1.5)
    table.standUp('cyan-light1')
    const p = table.piecePose('cyan-light1')
    // closest point of the lying body (x in [-BODY_HEIGHT, 0], z = 0)
    const cx = Math.max(-BODY_HEIGHT.heavy, Math.min(0, p.x))
    expect(Math.hypot(p.x - cx, p.z)).toBeGreaterThanOrEqual(BASE_RADIUS.light + BASE_RADIUS.heavy * 0.55 - 1e-6)
  })

  it('standUp puts the piece upright and off any overlap', () => {
    const id = 'cyan-light1'
    table.tilt(id, 1.5)
    const p = table.piecePose(id)
    table.placeBall(p.x, BALL_RADIUS, p.z)
    table.standUp(id)
    expect(table.isTipped(id)).toBe(false)
    const q = table.piecePose(id), b = table.ballPose()
    expect(dist(q, b)).toBeGreaterThanOrEqual(BASE_RADIUS.light + BALL_RADIUS - 1e-6)
  })
})

describe('clone', () => {
  const allPoses = (t: Table) => [t.ballPose(), ...PIECES.map(p => t.piecePose(p.id))]

  it('a clone predicts the real outcome exactly', async () => {
    const t = await Table.create()
    t.shoot({ pieceId: 'cyan-light1', dirX: 0.8, dirZ: 0.6, power: 0.9, mode: 'ground' })
    t.runTurn()
    t.shoot({ pieceId: 'magenta-heavy1', dirX: -1, dirZ: 0.1, power: 1, mode: 'ground' })
    t.runTurn()
    const c = t.clone()
    const shot = { pieceId: 'cyan-light2', dirX: 0.9, dirZ: -0.4, power: 0.8, mode: 'lob' as const }
    t.shoot(shot)
    c.shoot(shot)
    t.runTurn()
    c.runTurn()
    const a = allPoses(t), b = allPoses(c)
    a.forEach((p, i) => {
      expect(Math.abs(p.x - b[i].x)).toBeLessThan(1e-6)
      expect(Math.abs(p.y - b[i].y)).toBeLessThan(1e-6)
      expect(Math.abs(p.z - b[i].z)).toBeLessThan(1e-6)
    })
    c.free()
  })

  it('simulating on a clone leaves the real table untouched', async () => {
    const t = await Table.create()
    const before = JSON.stringify(allPoses(t))
    const c = t.clone()
    c.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 1, mode: 'ground' })
    c.runTurn()
    c.free()
    expect(JSON.stringify(allPoses(t))).toBe(before)
  })
})

describe('contacts', () => {
  it('contacts are reported with their strength', async () => {
    const t = await Table.create()
    t.placePiece('cyan-light1', -3, 0)
    t.placeBall(-1.5, BALL_RADIUS, 0)
    t.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 1, mode: 'ground' })
    const all: { kind: string; strength: number }[] = []
    for (let i = 0; i < 240; i++) all.push(...t.step().contacts)
    expect(all.some(c => c.kind === 'ball' && c.strength > 1)).toBe(true)
    expect(all.every(c => c.strength >= 0.5)).toBe(true)
  })

  it('a benched piece is off the pitch: the ball rolls through its spot', async () => {
    const table = await Table.create()
    const k = KICKOFF['magenta-light1']
    table.setBenched(new Set(['magenta-light1']))
    table.placeBall(k.x - 3, BALL_RADIUS, k.z, 10, 0, 0)
    table.runTurn()
    expect(table.ballPose().x).toBeGreaterThan(k.x + 1)
  })

  it('unbenching brings every piece back', async () => {
    const table = await Table.create()
    table.setBenched(new Set(['magenta-light1']))
    table.setBenched(new Set())
    const k = KICKOFF['magenta-light1']
    table.placeBall(k.x - 3, BALL_RADIUS, k.z, 10, 0, 0)
    table.runTurn()
    expect(table.ballPose().x).toBeLessThan(k.x)
  })
})

describe('magnetic control', () => {
  // Only the passer (cyan-light1) and the receiver (cyan-light2) on the pitch, the ball between them.
  const pitch = async () => {
    const t = await Table.create()
    t.setBenched(new Set(PIECES.map(p => p.id).filter(id => id !== 'cyan-light1' && id !== 'cyan-light2')))
    t.placePiece('cyan-light1', -2, 0)
    t.placePiece('cyan-light2', 4, 0)
    t.placeBall(-1, BALL_RADIUS, 0)
    return t
  }
  const reach = BASE_RADIUS.light + BALL_RADIUS

  it('a soft pass is caught at the feet of a teammate', async () => {
    const t = await pitch()
    t.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 0.35, mode: 'ground' })
    expect(t.runTurn().captured).toBe('cyan-light2')
    expect(dist(t.ballPose(), t.piecePose('cyan-light2'))).toBeLessThan(reach + 0.1)
  })

  // A forward pass reaches the catcher from behind, on its -x side.
  const caught = async () => {
    const t = await pitch()
    t.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 0.35, mode: 'ground' })
    expect(t.runTurn().captured).toBe('cyan-light2')
    return t
  }

  it('a caught ball stays on the side it arrived from', async () => {
    const t = await caught()
    const b = t.ballPose(), p = t.piecePose('cyan-light2')
    expect(p.x - b.x).toBeGreaterThan(reach - 0.1)
    expect(Math.abs(b.z - p.z)).toBeLessThan(0.2)
  })

  it('the holder kicks the ball away itself and stays put, whatever side the ball is on', async () => {
    const t = await caught()
    const p = t.piecePose('cyan-light2')
    t.shoot({ pieceId: 'cyan-light2', dirX: 1, dirZ: 0, power: 0.5, mode: 'ground' })
    t.runTurn()
    expect(dist(t.piecePose('cyan-light2'), p)).toBeLessThan(0.05)
    expect(t.ballPose().x).toBeGreaterThan(p.x + 2)
  })

  it('the harder the pull, the farther the kick', async () => {
    const far = async (power: number) => {
      const t = await caught()
      t.shoot({ pieceId: 'cyan-light2', dirX: 0, dirZ: 1, power, mode: 'ground' })
      t.runTurn()
      return t.ballPose().z
    }
    expect(await far(0.6)).toBeGreaterThan((await far(0.2)) + 1)
  })

  it('a kicked lob leaves the ground', async () => {
    const t = await caught()
    t.shoot({ pieceId: 'cyan-light2', dirX: 1, dirZ: 0, power: 0.6, mode: 'lob' })
    let top = 0
    for (let i = 0; i < 30; i++) { t.step(); top = Math.max(top, t.ballPose().y) }
    expect(top).toBeGreaterThan(BALL_RADIUS + 0.3)
  })

  it('a clone keeps the holder', async () => {
    const t = await caught()
    const c = t.clone(), p = c.piecePose('cyan-light2')
    c.shoot({ pieceId: 'cyan-light2', dirX: 1, dirZ: 0, power: 0.5, mode: 'ground' })
    c.runTurn()
    expect(dist(c.piecePose('cyan-light2'), p)).toBeLessThan(0.05)
    c.free()
  })

  it('placing the ball elsewhere drops the hold: the piece runs again', async () => {
    const t = await caught()
    t.placeBall(0, BALL_RADIUS, 3)
    const p = t.piecePose('cyan-light2')
    t.shoot({ pieceId: 'cyan-light2', dirX: 1, dirZ: 0, power: 0.5, mode: 'ground' })
    t.runTurn()
    expect(dist(t.piecePose('cyan-light2'), p)).toBeGreaterThan(1)
  })

  it('a hard shot is not caught', async () => {
    const t = await pitch()
    t.shoot({ pieceId: 'cyan-light1', dirX: 1, dirZ: 0, power: 1, mode: 'ground' })
    expect(t.runTurn().captured).toBeNull()
  })

  it('a piece already at the ball when the shot starts does not catch it', async () => {
    const t = await pitch()
    t.placeBall(4 - reach - 0.2, BALL_RADIUS, 0) // resting by the receiver
    t.shoot({ pieceId: 'cyan-light1', dirX: -1, dirZ: 0, power: 0.3, mode: 'ground' }) // the shooter runs off the other way
    expect(t.runTurn().captured).toBeNull()
  })
})
