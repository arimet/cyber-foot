import { describe, expect, it } from 'vitest'
import { DRILLS, type Drill, drillMet, setUpDrill } from '../src/game/drills'
import type { ShotMode } from '../src/game/types'
import { Table } from '../src/physics/table'

const [empty, penalty, lob, pass, tip] = DRILLS

const fire = async (d: Drill, angle: number, power: number, mode: ShotMode = 'ground') => {
  const t = await Table.create()
  setUpDrill(t, d)
  t.shoot({ pieceId: d.shooter, dirX: Math.cos(angle), dirZ: Math.sin(angle), power, mode })
  const r = t.runTurn()
  return drillMet(d, { goalAgainst: r.goalAgainst, tipped: t.tippedIds(), passes: 0 })
}

// The fox passes; if the cat catches it, the cat shoots straight at the goal's middle.
const passThenShoot = async (angle: number, power: number) => {
  const t = await Table.create()
  setUpDrill(t, pass)
  t.shoot({ pieceId: pass.shooter, dirX: Math.cos(angle), dirZ: Math.sin(angle), power, mode: 'ground' })
  if (t.runTurn().captured !== 'cyan-light2') return false
  const c = t.piecePose('cyan-light2'), d = Math.hypot(10 - c.x, c.z)
  t.shoot({ pieceId: 'cyan-light2', dirX: (10 - c.x) / d, dirZ: -c.z / d, power: 0.8, mode: 'ground' })
  return drillMet(pass, { goalAgainst: t.runTurn().goalAgainst, tipped: t.tippedIds(), passes: 1 })
}

// some shot among these angles (rad) and powers meets the drill
const anyMeets = async (d: Drill, angles: number[], powers: number[], mode: ShotMode = 'ground') => {
  for (const a of angles) for (const p of powers) if (await fire(d, a, p, mode)) return true
  return false
}
const range = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))

describe('drills', () => {
  it('the empty goal is scored by a straight shot', async () => {
    expect(await fire(empty, 0, 0.6)).toBe(true)
  })

  it('the penalty is saved straight, scored on the open side', async () => {
    expect(await fire(penalty, 0, 1)).toBe(false)
    expect(await anyMeets(penalty, range(0.08, 0.2, 4), [0.8, 1])).toBe(true)
  })

  it('the lob drill: along the ground is blocked, a lob scores', async () => {
    expect(await fire(lob, 0, 1)).toBe(false)
    expect(await anyMeets(lob, [0], range(0.4, 1, 7), 'lob')).toBe(true)
  })

  it('the pass drill: a pass caught by the cat, then its shot scores', async () => {
    const aim = Math.atan2(pass.ball.z - pass.pieces[pass.shooter].z, pass.ball.x - pass.pieces[pass.shooter].x)
    let met = false
    for (const a of range(aim - 0.1, aim + 0.1, 5)) for (const p of range(0.25, 0.6, 8)) if (!met) met = await passThenShoot(a, p)
    expect(met).toBe(true)
  })

  it('the pass drill needs a pass: a goal straight from the fox does not count', () => {
    expect(drillMet(pass, { goalAgainst: 'magenta', tipped: [], passes: 0 })).toBe(false)
  })

  it('the tip drill is met when the target falls', async () => {
    expect(await fire(tip, 0, 1)).toBe(true)
  })

  it('an own goal is a miss', () => {
    expect(drillMet(empty, { goalAgainst: 'cyan', tipped: [], passes: 0 })).toBe(false)
  })

  it('a shot that misses the ball is a miss', async () => {
    expect(await fire(empty, Math.PI / 2, 0.3)).toBe(false)
  })

  it('only the drill pieces are on the pitch', async () => {
    const t = await Table.create()
    setUpDrill(t, tip)
    t.placeBall(-9, 0.35, 0, -12, 0, 0) // straight at cyan's goal: no keeper benched in the way
    expect(t.runTurn().goalAgainst).toBe('cyan')
  })
})
