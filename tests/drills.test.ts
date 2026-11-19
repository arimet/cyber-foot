import { describe, expect, it } from 'vitest'
import { DRILLS, type Drill, drillMet, setUpDrill } from '../src/game/drills'
import type { ShotMode } from '../src/game/types'
import { Table } from '../src/physics/table'

const [empty, penalty, lob, pass, tackle] = DRILLS

const fire = async (d: Drill, angle: number, power: number, mode: ShotMode = 'ground') => {
  const t = await Table.create()
  setUpDrill(t, d)
  t.shoot({ pieceId: d.shooter, dirX: Math.cos(angle), dirZ: Math.sin(angle), power, mode })
  const r = t.runTurn()
  return drillMet(d, { goalAgainst: r.goalAgainst, passes: 0, holder: t.holder })
}

// The fox passes; if the cat catches it, the cat shoots straight at the goal's middle.
const passThenShoot = async (angle: number, power: number) => {
  const t = await Table.create()
  setUpDrill(t, pass)
  t.shoot({ pieceId: pass.shooter, dirX: Math.cos(angle), dirZ: Math.sin(angle), power, mode: 'ground' })
  t.runTurn()
  if (t.passedTo !== 'cyan-light2') return false
  const c = t.piecePose('cyan-light2'), d = Math.hypot(10 - c.x, c.z)
  t.shoot({ pieceId: 'cyan-light2', dirX: (10 - c.x) / d, dirZ: -c.z / d, power: 0.8, mode: 'ground' })
  return drillMet(pass, { goalAgainst: t.runTurn().goalAgainst, passes: 1, holder: t.holder })
}

// some shot among these angles (rad) and powers meets the drill
const anyMeets = async (d: Drill, angles: number[], powers: number[], mode: ShotMode = 'ground') => {
  for (const a of angles) for (const p of powers) if (await fire(d, a, p, mode)) return true
  return false
}
const range = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))

describe('drills', () => {
  it('every drill but the tackle starts with the ball at the shooter', async () => {
    for (const d of DRILLS) {
      const t = await Table.create()
      setUpDrill(t, d)
      expect(t.holder).toBe(d === tackle ? 'magenta-light1' : d.shooter)
    }
  })

  it('the empty goal is scored by a straight kick', async () => {
    expect(await fire(empty, 0, 0.6)).toBe(true)
  })

  it('the penalty is saved straight, scored on the open side', async () => {
    expect(await fire(penalty, 0, 1)).toBe(false)
    expect(await anyMeets(penalty, range(-0.35, -0.12, 5), [0.8, 1])).toBe(true)
  })

  it('the lob drill: along the ground is blocked, a lob scores', async () => {
    expect(await fire(lob, 0, 1)).toBe(false)
    expect(await anyMeets(lob, [0], range(0.4, 1, 7), 'lob')).toBe(true)
  })

  it('the pass drill: the fox cannot score straight, a pass caught by the cat then its kick scores', async () => {
    const goal = Math.atan2(0 - pass.pieces[pass.shooter].z, 10 - pass.pieces[pass.shooter].x)
    expect(await fire(pass, goal, 1)).toBe(false)
    const cat = pass.pieces['cyan-light2'], fox = pass.pieces[pass.shooter]
    const aim = Math.atan2(cat.z - fox.z, cat.x - fox.x)
    let met = false
    for (const a of range(aim - 0.06, aim + 0.06, 3)) for (const p of range(0.4, 0.8, 5)) if (!met) met = await passThenShoot(a, p)
    expect(met).toBe(true)
  })

  it('the pass drill needs a pass: a goal straight from the fox does not count', () => {
    expect(drillMet(pass, { goalAgainst: 'magenta', passes: 0, holder: null })).toBe(false)
  })

  it('the tackle drill: a hard run at the cat wins the ball off it, a soft one does not', async () => {
    expect(await fire(tackle, 0, 1)).toBe(true)
    expect(await fire(tackle, 0, 0.15)).toBe(false)
  })

  it('an own goal is a miss', () => {
    expect(drillMet(empty, { goalAgainst: 'cyan', passes: 0, holder: null })).toBe(false)
  })

  it('only the drill pieces are on the pitch', async () => {
    const t = await Table.create()
    setUpDrill(t, tackle)
    t.placeBall(-9, 0.35, 0, -12, 0, 0) // straight at cyan's goal: no keeper benched in the way
    expect(t.runTurn().goalAgainst).toBe('cyan')
  })
})
