import { beforeEach, describe, expect, it } from 'vitest'
import { candidates, planOrders, runThink, scoreOutcome, slidePower, think } from '../src/game/ai'
import { BALL_RADIUS, PIECES } from '../src/game/constants'
import { Table } from '../src/physics/table'

let table: Table
const magenta = (id: string) => id.startsWith('magenta')
const angleOf = (s: { dirX: number; dirZ: number }) => (Math.atan2(s.dirZ, s.dirX) * 180) / Math.PI

// Every piece parked on the long sides, away from the goals.
const park = () => PIECES.forEach((p, i) => table.placePiece(p.id, -8 + (i % 5) * 4, i < 5 ? -5.6 : 5.6))

const openGoal = () => {
  park()
  table.placePiece('magenta-light1', -4.5, 0.4)
  table.giveBall('magenta-light1')
}

describe('AI', () => {
  beforeEach(async () => {
    table = await Table.create()
  })

  it('candidates only use my shootable pieces', () => {
    const list = candidates(table, id => magenta(id) && id !== 'magenta-light1', 'magenta')
    expect(list.length).toBeGreaterThan(0)
    for (const s of list) {
      expect(s.pieceId.startsWith('magenta')).toBe(true)
      expect(s.pieceId).not.toBe('magenta-light1')
      expect(Math.hypot(s.dirX, s.dirZ)).toBeCloseTo(1, 6)
      expect(s.power).toBeGreaterThan(0)
      expect(s.power).toBeLessThanOrEqual(1)
    }
  })

  it('without the ball, the first dozen candidates cover the three pieces nearest it (slow devices stop early)', () => {
    const first = candidates(table, magenta, 'magenta').slice(0, 12)
    expect(new Set(first.map(s => s.pieceId)).size).toBe(3)
  })

  it('with the ball, the first dozen candidates hold a shot, a pass, a lob and a teammate moving', () => {
    const list = candidates(table, id => id.startsWith('cyan'), 'cyan') // cyan-light1 holds at the centre
    const first = list.slice(0, 12)
    expect(first.some(s => s.mode === 'lob')).toBe(true)
    expect(first.some(s => s.pieceId === 'cyan-light1' && s.dirX < 0)).toBe(true) // a pass back
    expect(first[0].pieceId).toBe('cyan-light1')
    expect(first[0].dirX).toBeGreaterThan(0.9) // at the goal first
    expect(first.some(s => s.pieceId !== 'cyan-light1')).toBe(true) // a teammate runs
    expect(list.every(s => s.pieceId !== 'cyan-keeper' || s.pieceId === table.holder)).toBe(true) // the keeper stays home
  })

  it('scoreOutcome likes an open teammate ahead of the holder', () => {
    park()
    table.placePiece('magenta-heavy1', 6, -5) // the other runners behind the play
    table.placePiece('magenta-heavy2', 6, 5)
    table.placePiece('magenta-light1', -2, 0)
    table.placePiece('magenta-light2', 2, 0)
    table.giveBall('magenta-light1', -1, 0)
    const ball = table.ballPose(), behind = scoreOutcome(table, null, 'magenta', [], ball)
    table.placePiece('magenta-light2', -6, 2) // ahead (magenta attacks -x), lane clear
    const open = scoreOutcome(table, null, 'magenta', [], ball)
    table.placePiece('cyan-heavy1', -4, 1) // now an opponent stands in the lane
    const blocked = scoreOutcome(table, null, 'magenta', [], ball)
    expect(open).toBeGreaterThan(behind + 10)
    expect(open).toBeGreaterThan(blocked + 10)
  })

  it('a piece holding the ball shoots toward the goal, even with the ball behind it', () => {
    park()
    table.placePiece('magenta-light1', -4, 0)
    table.giveBall('magenta-light1', 1, 0)
    expect(candidates(table, magenta, 'magenta')[0].dirX).toBeLessThan(-0.9) // magenta attacks -x
  })

  it('without the ball, the pieces slide at its holder', () => {
    const list = candidates(table, magenta, 'magenta') // cyan-light1 holds at the centre
    const h = table.piecePose('cyan-light1')
    const first = list[0], p = table.piecePose(first.pieceId)
    const toward = Math.atan2(h.z - p.z, h.x - p.x)
    expect(Math.abs(Math.atan2(first.dirZ, first.dirX) - toward)).toBeLessThan(0.01)
  })

  it('scoreOutcome rewards scoring and punishes own goals', () => {
    const ball = table.ballPose()
    expect(scoreOutcome(table, 'cyan', 'magenta', [], ball)).toBeGreaterThan(500)
    expect(scoreOutcome(table, 'magenta', 'magenta', [], ball)).toBeLessThan(-500)
  })

  it('scoreOutcome likes having the ball', () => {
    park()
    table.placePiece('magenta-light1', 0, 0)
    table.placePiece('cyan-light1', 0, 3)
    const ball = { ...table.ballPose(), x: 0, z: 0.98 }
    table.giveBall('magenta-light1', 0, 1)
    const mine = scoreOutcome(table, null, 'magenta', [], ball)
    table.giveBall('cyan-light1', 0, -1)
    const theirs = scoreOutcome(table, null, 'magenta', [], ball)
    expect(mine).toBeGreaterThan(theirs + 20)
  })

  it('scoreOutcome likes a pass caught by a teammate', () => {
    park()
    table.placePiece('magenta-light1', 0, 0)
    table.placePiece('magenta-light2', -4, 0)
    table.giveBall('magenta-light1', -1, 0)
    const before = table.ballPose(), held = scoreOutcome(table, null, 'magenta', [], before)
    table.shoot({ pieceId: 'magenta-light1', dirX: -1, dirZ: 0, power: 0.5, mode: 'ground' })
    table.runTurn()
    expect(table.passedTo).toBe('magenta-light2')
    expect(scoreOutcome(table, null, 'magenta', [], before)).toBeGreaterThan(held)
  })

  it('legend scores an open goal', () => {
    openGoal()
    const shot = runThink(think(table, magenta, 'magenta', 'legend', () => 0.5))
    table.shoot(shot)
    expect(table.runTurn().goalAgainst).toBe('cyan')
  })

  it('the AI always returns a shot, even when every option is bad', () => {
    park()
    table.placeBall(9.3, BALL_RADIUS, 0)
    table.placePiece('magenta-light1', 7.8, 0)
    const shot = runThink(think(table, id => id === 'magenta-light1', 'magenta', 'pro', () => 0.5))
    expect(shot.pieceId).toBe('magenta-light1')
    expect(Math.hypot(shot.dirX, shot.dirZ)).toBeCloseTo(1, 6)
    expect(shot.power).toBeGreaterThan(0)
  })

  it('rookie misses by more than legend', () => {
    openGoal()
    const best = runThink(think(table, magenta, 'magenta', 'legend', () => 0.5))
    const rookie = runThink(think(table, magenta, 'magenta', 'rookie', () => 1))
    const legend = runThink(think(table, magenta, 'magenta', 'legend', () => 1))
    expect(Math.abs(angleOf(rookie) - angleOf(best))).toBeCloseTo(12, 1)
    expect(Math.abs(angleOf(legend) - angleOf(best))).toBeCloseTo(1, 1)
    expect(rookie.power).toBeCloseTo(Math.min(1, best.power * 1.25), 6)
  })

  it('thinking leaves the real table untouched', () => {
    openGoal()
    const before = JSON.stringify([table.ballPose(), ...PIECES.map(p => table.piecePose(p.id))])
    runThink(think(table, magenta, 'magenta', 'pro', () => 0.5))
    expect(JSON.stringify([table.ballPose(), ...PIECES.map(p => table.piecePose(p.id))])).toBe(before)
  })
})

describe('Strategy AI', () => {
  beforeEach(async () => {
    table = await Table.create()
  })
  const all = () => true
  const angleTo = (s: { pieceId: string; dirX: number; dirZ: number }, t: { x: number; z: number }) => {
    const p = table.piecePose(s.pieceId)
    const d = Math.atan2(s.dirZ, s.dirX) - Math.atan2(t.z - p.z, t.x - p.x)
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))
  }

  it('gives at most four orders, to distinct pieces of its own that may play', () => {
    const orders = runThink(planOrders(table, 'magenta', id => id !== 'magenta-light2', 'pro', () => 0.5))
    expect(orders.length).toBeGreaterThan(0)
    expect(orders.length).toBeLessThanOrEqual(4)
    expect(new Set(orders.map(o => o.pieceId)).size).toBe(orders.length)
    for (const o of orders) {
      expect(o.pieceId.startsWith('magenta')).toBe(true)
      expect(o.pieceId).not.toBe('magenta-light2')
    }
  })

  it('with the ball, the holder kicks', () => {
    table.reset('magenta')
    const orders = runThink(planOrders(table, 'magenta', all, 'pro', () => 0.5))
    expect(orders.some(o => o.pieceId === 'magenta-light1')).toBe(true)
  })

  it('without the ball, a piece runs at the holder', () => {
    const orders = runThink(planOrders(table, 'magenta', all, 'legend', () => 0.5)) // cyan-light1 holds
    const h = table.piecePose('cyan-light1')
    expect(orders.some(o => angleTo(o, h) < 0.05 && o.power > 0.3)).toBe(true)
  })

  it('a loose ball is chased hard enough to be reached', () => {
    park()
    table.placePiece('magenta-light1', 0, 0)
    table.placeBall(-5, BALL_RADIUS, 0)
    const orders = runThink(planOrders(table, 'magenta', all, 'legend', () => 0.5))
    const chase = orders.find(o => o.pieceId === 'magenta-light1')!
    expect(angleTo(chase, { x: -5, z: 0 })).toBeLessThan(0.05)
    table.shoot(chase)
    table.runTurn()
    expect(table.holder).toBe('magenta-light1')
  })

  it('slidePower grows with the distance and is capped at full power', () => {
    expect(slidePower('light', 2)).toBeLessThan(slidePower('light', 6))
    expect(slidePower('heavy', 4)).toBeGreaterThan(slidePower('light', 4))
    expect(slidePower('heavy', 50)).toBe(1)
  })

  it('planning leaves the real table untouched', () => {
    const before = JSON.stringify([table.ballPose(), ...PIECES.map(p => table.piecePose(p.id))])
    runThink(planOrders(table, 'cyan', all, 'pro', () => 0.5))
    expect(JSON.stringify([table.ballPose(), ...PIECES.map(p => table.piecePose(p.id))])).toBe(before)
  })
})
