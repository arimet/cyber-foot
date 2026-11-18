import { describe, expect, it } from 'vitest'
import { GOALS_TO_WIN, MAX_PASSES, PIECES } from '../src/game/constants'
import { Match } from '../src/game/match'

const quiet = { goalAgainst: null, tipped: [] as string[] }
const magentaIds = PIECES.filter(p => p.team === 'magenta').map(p => p.id)

describe('Match', () => {
  it('cyan plays first and turns alternate', () => {
    const m = new Match(PIECES)
    expect(m.turn).toBe('cyan')
    m.endTurn(quiet)
    expect(m.turn).toBe('magenta')
    m.endTurn(quiet)
    expect(m.turn).toBe('cyan')
  })

  it('canShoot refuses the other team, stunned pieces and finished games', () => {
    const m = new Match(PIECES)
    expect(m.canShoot('cyan-light1')).toBe(true)
    expect(m.canShoot('magenta-light1')).toBe(false)
    m.endTurn({ goalAgainst: null, tipped: ['magenta-light1'] })
    expect(m.canShoot('magenta-light1')).toBe(false)
    expect(m.canShoot('magenta-light2')).toBe(true)
    for (let i = 0; i < GOALS_TO_WIN; i++) {
      m.endTurn({ goalAgainst: 'magenta', tipped: [] })
    }
    expect(m.winner).toBe('cyan')
    expect(PIECES.some(p => m.canShoot(p.id))).toBe(false)
  })

  it("a piece tipped during cyan's turn is stunned for its team's next turn, then stands up", () => {
    const m = new Match(PIECES)
    m.endTurn({ goalAgainst: null, tipped: ['magenta-heavy1'] })
    expect(m.turn).toBe('magenta')
    expect(m.canShoot('magenta-heavy1')).toBe(false)
    const out = m.endTurn({ goalAgainst: null, tipped: ['magenta-heavy1'] }) // still lying when magenta's turn ends
    expect(out.standUp).toContain('magenta-heavy1')
    expect(m.stunned.has('magenta-heavy1')).toBe(false)
  })

  it('the shooter tipping itself is stunned through its own next turn', () => {
    const m = new Match(PIECES)
    m.endTurn({ goalAgainst: null, tipped: ['cyan-light1'] })
    const afterMagenta = m.endTurn({ goalAgainst: null, tipped: ['cyan-light1'] })
    expect(afterMagenta.standUp).not.toContain('cyan-light1')
    expect(m.turn).toBe('cyan')
    expect(m.canShoot('cyan-light1')).toBe(false)
    const afterCyan = m.endTurn({ goalAgainst: null, tipped: ['cyan-light1'] })
    expect(afterCyan.standUp).toContain('cyan-light1')
  })

  it('goal: the other team scores, conceding team kicks off, stuns cleared', () => {
    const m = new Match(PIECES)
    m.endTurn({ goalAgainst: null, tipped: ['magenta-light2'] })
    m.endTurn(quiet)
    const out = m.endTurn({ goalAgainst: 'magenta', tipped: ['cyan-light1'] })
    expect(m.score.cyan).toBe(1)
    expect(m.turn).toBe('magenta')
    expect(out.kickoff).toBe(true)
    expect(m.stunned.size).toBe(0)
  })

  it('own goal counts for the opponent', () => {
    const m = new Match(PIECES)
    m.endTurn({ goalAgainst: 'cyan', tipped: [] })
    expect(m.score.magenta).toBe(1)
    expect(m.score.cyan).toBe(0)
    expect(m.turn).toBe('cyan')
  })

  it('first to 5 wins', () => {
    const m = new Match(PIECES)
    let out
    for (let i = 0; i < GOALS_TO_WIN; i++) out = m.endTurn({ goalAgainst: 'magenta', tipped: [] })
    expect(m.score.cyan).toBe(5)
    expect(m.winner).toBe('cyan')
    expect(out!.winner).toBe('cyan')
  })

  it('a team with every piece stunned passes and the game goes on', () => {
    const m = new Match(PIECES)
    const out = m.endTurn({ goalAgainst: null, tipped: magentaIds })
    expect(out.passed).toEqual(['magenta'])
    expect(m.turn).toBe('cyan')
    expect(out.standUp.sort()).toEqual([...magentaIds].sort())
    expect(m.stunned.size).toBe(0)
  })

  it('both teams fully stunned still ends on a team that can shoot', () => {
    const m = new Match(PIECES)
    const out = m.endTurn({ goalAgainst: null, tipped: PIECES.map(p => p.id) })
    expect(out.passed.length).toBeGreaterThan(0)
    expect(PIECES.some(p => m.canShoot(p.id))).toBe(true)
  })

  it('a pass caught by a teammate gives the same team another shot, with that piece only', () => {
    const m = new Match(PIECES)
    m.endTurn({ ...quiet, captured: 'cyan-light2' })
    expect(m.turn).toBe('cyan')
    expect(m.receiver).toBe('cyan-light2')
    expect(m.canShoot('cyan-light2')).toBe(true)
    expect(m.canShoot('cyan-light1')).toBe(false)
  })

  it('an interception ends the turn', () => {
    const m = new Match(PIECES)
    m.endTurn({ ...quiet, captured: 'magenta-heavy1' })
    expect(m.turn).toBe('magenta')
    expect(m.receiver).toBeNull()
    expect(m.canShoot('magenta-light1')).toBe(true)
  })

  it('after MAX_PASSES passes the next catch ends the turn', () => {
    const m = new Match(PIECES)
    for (let i = 0; i < MAX_PASSES; i++) m.endTurn({ ...quiet, captured: i % 2 ? 'cyan-light1' : 'cyan-light2' })
    expect(m.passes).toBe(MAX_PASSES)
    m.endTurn({ ...quiet, captured: 'cyan-heavy1' })
    expect(m.turn).toBe('magenta')
    expect(m.passes).toBe(0)
  })

  it('a piece knocked over during a pass still sits out its next turn', () => {
    const m = new Match(PIECES)
    m.endTurn({ goalAgainst: null, tipped: ['cyan-heavy1'], captured: 'cyan-light2' })
    m.endTurn({ goalAgainst: null, tipped: ['cyan-heavy1'] }) // cyan's turn ends, the heavy still lying
    m.endTurn({ goalAgainst: null, tipped: ['cyan-heavy1'] }) // magenta's
    expect(m.canShoot('cyan-heavy1')).toBe(false)
  })
})
