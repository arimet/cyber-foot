import { beforeEach, describe, expect, it } from 'vitest'
import { candidates, runThink, scoreOutcome, think } from '../src/game/ai'
import { BALL_RADIUS, PIECES } from '../src/game/constants'
import { Table } from '../src/physics/table'

let table: Table
const magenta = (id: string) => id.startsWith('magenta')
const angleOf = (s: { dirX: number; dirZ: number }) => (Math.atan2(s.dirZ, s.dirX) * 180) / Math.PI

// Every piece parked on the long sides, away from the goals.
const park = () => PIECES.forEach((p, i) => table.placePiece(p.id, -8 + (i % 5) * 4, i < 5 ? -5.6 : 5.6))

const openGoal = () => {
  park()
  table.placeBall(-7, BALL_RADIUS, 0)
  table.placePiece('magenta-light1', -4.5, 0.4)
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

  it('the first dozen candidates already cover every shooter and a lob (slow devices stop early)', () => {
    const first = candidates(table, magenta, 'magenta').slice(0, 12)
    expect(new Set(first.map(s => s.pieceId)).size).toBe(3)
    expect(first.some(s => s.mode === 'lob')).toBe(true)
  })

  it('scoreOutcome rewards scoring and punishes own goals', () => {
    const ball = table.ballPose()
    expect(scoreOutcome(table, 'cyan', 'magenta', [], ball)).toBeGreaterThan(500)
    expect(scoreOutcome(table, 'magenta', 'magenta', [], ball)).toBeLessThan(-500)
  })

  it('scoreOutcome likes a pass caught by a teammate and dislikes an interception', () => {
    const ball = table.ballPose(), plain = scoreOutcome(table, null, 'magenta', [], ball)
    expect(scoreOutcome(table, null, 'magenta', [], ball, 'magenta-light2')).toBeGreaterThan(plain)
    expect(scoreOutcome(table, null, 'magenta', [], ball, 'cyan-light2')).toBeLessThan(plain)
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
