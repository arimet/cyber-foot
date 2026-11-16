import { beforeEach, describe, expect, it } from 'vitest'
import {
  BALL_RADIUS, GLASS_HEIGHT, GOAL_DEPTH, KICKOFF, MAX_TURN_STEPS, PIECES, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH,
} from '../src/game/constants'
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
