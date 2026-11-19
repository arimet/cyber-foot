import { GOALS_TO_WIN, MAX_ORDERS } from './constants'
import { other, type PieceSpec, type Shot, type Team } from './types'

export type RoundOutcome = { kickoff: Team | null; standUp: string[]; winner: Team | null }

// Strategy mode rules, pure: each round both teams give up to MAX_ORDERS orders, one per standing piece, in secret,
// then every order starts at once. A piece knocked over sits out the next round.
export class Strategy {
  score: Record<Team, number> = { cyan: 0, magenta: 0 }
  winner: Team | null = null
  private readonly down = new Set<string>()
  private readonly planned: Record<Team, Map<string, Shot>> = { cyan: new Map(), magenta: new Map() }
  private readonly teamOf: Map<string, Team>

  constructor(pieces: readonly PieceSpec[]) {
    this.teamOf = new Map(pieces.map(p => [p.id, p.team]))
  }

  get stunned(): ReadonlySet<string> {
    return this.down
  }

  canOrder(team: Team, id: string): boolean {
    return !this.winner && this.teamOf.get(id) === team && !this.down.has(id)
  }

  // A new order for a piece replaces its old one; a piece without one needs a free slot.
  setOrder(team: Team, shot: Shot): boolean {
    const plan = this.planned[team]
    if (!this.canOrder(team, shot.pieceId) || (!plan.has(shot.pieceId) && plan.size >= MAX_ORDERS)) return false
    plan.set(shot.pieceId, shot)
    return true
  }

  dropOrder(team: Team, id: string): void {
    this.planned[team].delete(id)
  }

  orders(team: Team): Shot[] {
    return [...this.planned[team].values()]
  }

  allOrders(): Shot[] {
    return [...this.orders('cyan'), ...this.orders('magenta')]
  }

  endRound(r: { goalAgainst: Team | null; tipped: string[] }): RoundOutcome {
    this.planned.cyan.clear()
    this.planned.magenta.clear()
    if (r.goalAgainst) {
      const scorer = other(r.goalAgainst)
      if (++this.score[scorer] >= GOALS_TO_WIN) this.winner = scorer
      this.down.clear()
      return { kickoff: r.goalAgainst, standUp: [], winner: this.winner }
    }
    // Those down this round have sat it out; the newly fallen sit out the next one.
    const standUp = [...this.down]
    this.down.clear()
    for (const id of r.tipped) if (!standUp.includes(id)) this.down.add(id)
    return { kickoff: null, standUp, winner: null }
  }
}
