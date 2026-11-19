import { GOALS_TO_WIN, MAX_ACTIONS } from './constants'
import { other, type PieceSpec, type Team } from './types'

export type TurnOutcome = { kickoff: boolean; standUp: string[]; passed: Team[]; winner: Team | null }

// Pure turn rules: knows nothing about physics.
export class Match {
  score: Record<Team, number> = { cyan: 0, magenta: 0 }
  turn: Team = 'cyan'
  winner: Team | null = null
  actions = 0 // actions played this turn, the team keeping the ball
  private readonly down = new Set<string>()
  private readonly teamOf: Map<string, Team>

  constructor(pieces: readonly PieceSpec[]) {
    this.teamOf = new Map(pieces.map(p => [p.id, p.team]))
  }

  get stunned(): ReadonlySet<string> {
    return this.down
  }

  canShoot(id: string): boolean {
    return !this.winner && this.teamOf.get(id) === this.turn && !this.down.has(id)
  }

  // `holder`: who has the ball once the action has played out. While the team playing has it, the team plays on, up
  // to MAX_ACTIONS actions; pieces knocked over meanwhile are dealt with when the turn really ends.
  endTurn(r: { goalAgainst: Team | null; tipped: string[]; holder?: string | null }): TurnOutcome {
    const h = r.holder
    if (!r.goalAgainst && h && this.teamOf.get(h) === this.turn && this.actions + 1 < MAX_ACTIONS) {
      this.actions++
      return { kickoff: false, standUp: [], passed: [], winner: null }
    }
    this.actions = 0
    if (r.goalAgainst) {
      const scorer = other(r.goalAgainst)
      this.score[scorer]++
      if (this.score[scorer] >= GOALS_TO_WIN) this.winner = scorer
      this.down.clear()
      this.turn = r.goalAgainst // conceding team kicks off
      return { kickoff: true, standUp: [], passed: [], winner: this.winner }
    }

    // Pieces of the team that just played have served their stunned turn.
    const standUp = this.serve(this.turn)
    for (const id of r.tipped) if (!standUp.includes(id)) this.down.add(id)

    const passed: Team[] = []
    let next = other(this.turn)
    // A team with nothing standing passes; serving the turn stands its pieces up, so this ends.
    while (!this.hasShooter(next)) {
      passed.push(next)
      standUp.push(...this.serve(next))
      next = other(next)
    }
    this.turn = next
    return { kickoff: false, standUp, passed, winner: null }
  }

  private serve(team: Team): string[] {
    const ids = [...this.down].filter(id => this.teamOf.get(id) === team)
    for (const id of ids) this.down.delete(id)
    return ids
  }

  private hasShooter(team: Team): boolean {
    for (const [id, t] of this.teamOf) if (t === team && !this.down.has(id)) return true
    return false
  }
}
