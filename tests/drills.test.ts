import { describe, expect, it } from 'vitest'
import { DRILLS, type Drill, drillMet, setUpDrill } from '../src/game/drills'
import type { ShotMode } from '../src/game/types'
import { Table } from '../src/physics/table'

const [empty, penalty, lob, tip] = DRILLS

const fire = async (d: Drill, angle: number, power: number, mode: ShotMode = 'ground') => {
  const t = await Table.create()
  setUpDrill(t, d)
  t.shoot({ pieceId: d.shooter, dirX: Math.cos(angle), dirZ: Math.sin(angle), power, mode })
  const r = t.runTurn()
  return drillMet(d, { goalAgainst: r.goalAgainst, tipped: t.tippedIds() })
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

  it('the tip drill is met when the target falls', async () => {
    expect(await fire(tip, 0, 1)).toBe(true)
  })

  it('an own goal is a miss', () => {
    expect(drillMet(empty, { goalAgainst: 'cyan', tipped: [] })).toBe(false)
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
