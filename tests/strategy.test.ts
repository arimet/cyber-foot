import { describe, expect, it } from 'vitest'
import { GOALS_TO_WIN, MAX_ORDERS, PIECES } from '../src/game/constants'
import { Strategy } from '../src/game/strategy'
import type { Shot } from '../src/game/types'

const order = (pieceId: string, power = 0.5): Shot => ({ pieceId, dirX: 1, dirZ: 0, power, mode: 'ground' })

describe('Strategy rounds', () => {
  it('a team orders only its own standing pieces', () => {
    const s = new Strategy(PIECES)
    expect(s.setOrder('cyan', order('magenta-light1'))).toBe(false)
    expect(s.setOrder('cyan', order('cyan-light1'))).toBe(true)
    expect(s.orders('cyan').map(o => o.pieceId)).toEqual(['cyan-light1'])
  })

  it(`at most ${MAX_ORDERS} orders per team, one per piece: a new order for a piece replaces its old one`, () => {
    const s = new Strategy(PIECES)
    for (const id of ['cyan-keeper', 'cyan-heavy1', 'cyan-heavy2', 'cyan-light1']) expect(s.setOrder('cyan', order(id))).toBe(true)
    expect(s.setOrder('cyan', order('cyan-light2'))).toBe(false)
    expect(s.setOrder('cyan', order('cyan-light1', 0.9))).toBe(true)
    expect(s.orders('cyan')).toHaveLength(MAX_ORDERS)
    expect(s.orders('cyan').find(o => o.pieceId === 'cyan-light1')!.power).toBe(0.9)
  })

  it('an order can be dropped', () => {
    const s = new Strategy(PIECES)
    s.setOrder('cyan', order('cyan-light1'))
    s.dropOrder('cyan', 'cyan-light1')
    expect(s.orders('cyan')).toEqual([])
  })

  it('the round plays every order of both teams, then clears them', () => {
    const s = new Strategy(PIECES)
    s.setOrder('cyan', order('cyan-light1'))
    s.setOrder('magenta', order('magenta-light2'))
    expect(s.allOrders().map(o => o.pieceId).sort()).toEqual(['cyan-light1', 'magenta-light2'])
    s.endRound({ goalAgainst: null, tipped: [] })
    expect(s.allOrders()).toEqual([])
  })

  it('a piece knocked over sits out the next round, then stands up', () => {
    const s = new Strategy(PIECES)
    expect(s.endRound({ goalAgainst: null, tipped: ['cyan-heavy1'] }).standUp).toEqual([])
    expect(s.setOrder('cyan', order('cyan-heavy1'))).toBe(false)
    expect(s.endRound({ goalAgainst: null, tipped: ['cyan-heavy1'] }).standUp).toEqual(['cyan-heavy1'])
    expect(s.setOrder('cyan', order('cyan-heavy1'))).toBe(true)
  })

  it('a goal scores, sets the kickoff team and stands everyone up', () => {
    const s = new Strategy(PIECES)
    s.endRound({ goalAgainst: null, tipped: ['cyan-heavy1'] })
    const out = s.endRound({ goalAgainst: 'magenta', tipped: [] })
    expect(s.score.cyan).toBe(1)
    expect(out.kickoff).toBe('magenta')
    expect(s.stunned.size).toBe(0)
  })

  it(`the first to ${GOALS_TO_WIN} wins, and nobody orders after that`, () => {
    const s = new Strategy(PIECES)
    let out = s.endRound({ goalAgainst: 'cyan', tipped: [] })
    for (let i = 1; i < GOALS_TO_WIN; i++) out = s.endRound({ goalAgainst: 'cyan', tipped: [] })
    expect(out.winner).toBe('magenta')
    expect(s.setOrder('magenta', order('magenta-light1'))).toBe(false)
  })
})
