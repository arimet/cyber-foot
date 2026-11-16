import RAPIER from '@dimforge/rapier3d-compat'
import {
  BALL_MASS, BALL_RADIUS, BASE_RADIUS, BODY_HEIGHT, GLASS_HEIGHT, GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, KICKOFF,
  MASS, MAX_IMPULSE, MAX_TURN_STEPS, PIECES, SETTLE_SPEED, SETTLE_STEPS, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH,
} from '../game/constants'
import type { PieceSpec, Shot, Team } from '../game/types'

export type Pose = { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }

// Feel knobs, tuned by playing.
const WALL = 0.5 // wall thickness
const BASE_HALF = 0.12 // half height of the base's flat part
const BASE_ROUND = 0.08 // rounded edge of the base
const BASE_SHARE = 0.8 // share of a piece's mass in its base: low centre of mass
const FRICTION = 0.3
const PIECE_BOUNCE = 0.4
const BALL_BOUNCE = 0.6
const WALL_BOUNCE = 0.5
const PIECE_DAMPING = 0.3
const PIECE_SPIN_DAMPING = 0.5
const BALL_DAMPING = 0.5
const BALL_SPIN_DAMPING = 0.8

let ready: Promise<void> | null = null

export class Table {
  readonly pieces: readonly PieceSpec[] = PIECES
  private readonly world: RAPIER.World
  private readonly bodies = new Map<string, RAPIER.RigidBody>()
  private readonly ball: RAPIER.RigidBody
  private calm = 0
  private goalReported = false

  static async create(): Promise<Table> {
    await (ready ??= RAPIER.init())
    return new Table()
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.buildArena()
    for (const p of this.pieces) this.bodies.set(p.id, this.buildPiece(p))
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setLinearDamping(BALL_DAMPING).setAngularDamping(BALL_SPIN_DAMPING),
    )
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(BALL_MASS).setRestitution(BALL_BOUNCE).setFriction(FRICTION),
      this.ball,
    )
    this.reset()
  }

  private fixedBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRestitution(WALL_BOUNCE).setFriction(FRICTION),
    )
  }

  private buildArena() {
    const L = TABLE_HALF_LENGTH, W = TABLE_HALF_WIDTH, G = GOAL_HALF_WIDTH, H = GLASS_HEIGHT
    const outerX = L + GOAL_DEPTH + WALL
    this.fixedBox(0, -WALL / 2, 0, outerX, WALL / 2, W + WALL) // floor
    this.fixedBox(0, H + WALL / 2, 0, outerX, WALL / 2, W + WALL) // glass ceiling
    for (const s of [-1, 1]) {
      this.fixedBox(0, H / 2, s * (W + WALL / 2), L + WALL, H / 2, WALL / 2) // long sides
      const endX = s * (L + WALL / 2)
      const sideHalf = (W - G) / 2
      for (const t of [-1, 1]) this.fixedBox(endX, H / 2, t * (G + sideHalf), WALL / 2, H / 2, sideHalf) // end wall beside the goal
      this.fixedBox(endX, (GOAL_HEIGHT + H) / 2, 0, WALL / 2, (H - GOAL_HEIGHT) / 2, G) // above the goal mouth
      // goal box: back, sides, roof
      const boxX = s * (L + GOAL_DEPTH / 2)
      this.fixedBox(s * (L + GOAL_DEPTH + WALL / 2), GOAL_HEIGHT / 2, 0, WALL / 2, GOAL_HEIGHT / 2, G + WALL)
      for (const t of [-1, 1]) this.fixedBox(boxX, GOAL_HEIGHT / 2, t * (G + WALL / 2), GOAL_DEPTH / 2, GOAL_HEIGHT / 2, WALL / 2)
      this.fixedBox(boxX, GOAL_HEIGHT + WALL / 2, 0, GOAL_DEPTH / 2, WALL / 2, G + WALL)
    }
  }

  // Body origin sits on the floor, under the base's centre.
  private buildPiece(p: PieceSpec): RAPIER.RigidBody {
    const r = BASE_RADIUS[p.role], m = MASS[p.role]
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setLinearDamping(PIECE_DAMPING).setAngularDamping(PIECE_SPIN_DAMPING),
    )
    const baseTop = 2 * (BASE_HALF + BASE_ROUND)
    this.world.createCollider(
      RAPIER.ColliderDesc.roundCylinder(BASE_HALF, r - BASE_ROUND, BASE_ROUND)
        .setTranslation(0, BASE_HALF + BASE_ROUND, 0)
        .setMass(m * BASE_SHARE).setRestitution(PIECE_BOUNCE).setFriction(FRICTION),
      body,
    )
    const bodyR = r * 0.55
    const bodyHalf = Math.max(0.05, (BODY_HEIGHT[p.role] - baseTop) / 2 - bodyR)
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(bodyHalf, bodyR)
        .setTranslation(0, baseTop + bodyHalf + bodyR, 0)
        .setMass(m * (1 - BASE_SHARE)).setRestitution(PIECE_BOUNCE).setFriction(FRICTION),
      body,
    )
    return body
  }

  private body(id: string): RAPIER.RigidBody {
    const b = this.bodies.get(id)
    if (!b) throw new Error(`unknown piece ${id}`)
    return b
  }

  private static still(b: RAPIER.RigidBody) {
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  reset(): void {
    for (const p of this.pieces) this.placePiece(p.id, KICKOFF[p.id].x, KICKOFF[p.id].z)
    this.placeBall(0, BALL_RADIUS, 0)
    this.goalReported = false
  }

  placePiece(id: string, x: number, z: number): void {
    const b = this.body(id)
    b.setTranslation({ x, y: 0, z }, true)
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    Table.still(b)
    this.calm = 0
  }

  placeBall(x: number, y: number, z: number, vx = 0, vy = 0, vz = 0): void {
    this.ball.setTranslation({ x, y, z }, true)
    this.ball.setLinvel({ x: vx, y: vy, z: vz }, true)
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.calm = 0
  }

  shoot(shot: Shot): void {
    const b = this.body(shot.pieceId)
    const j = shot.power * MAX_IMPULSE
    b.applyImpulse({ x: shot.dirX * j, y: 0, z: shot.dirZ * j }, true)
    this.calm = 0
    this.goalReported = false
  }

  step(): { goalAgainst: Team | null } {
    this.world.step()
    this.calm = this.allQuiet() ? this.calm + 1 : 0
    const goalAgainst = this.goalReported ? null : this.ballInGoal()
    if (goalAgainst) this.goalReported = true
    return { goalAgainst }
  }

  private allQuiet(): boolean {
    for (const b of [...this.bodies.values(), this.ball]) {
      if (b.isSleeping()) continue
      const v = b.linvel(), w = b.angvel()
      if (Math.hypot(v.x, v.y, v.z) > SETTLE_SPEED || Math.hypot(w.x, w.y, w.z) > SETTLE_SPEED) return false
    }
    return true
  }

  private ballInGoal(): Team | null {
    const { x, y, z } = this.ball.translation()
    if (Math.abs(x) <= TABLE_HALF_LENGTH + BALL_RADIUS || Math.abs(z) >= GOAL_HALF_WIDTH || y >= GOAL_HEIGHT) return null
    return x < 0 ? 'cyan' : 'magenta'
  }

  isSettled(): boolean {
    return this.calm >= SETTLE_STEPS
  }

  runTurn(maxSteps = MAX_TURN_STEPS): { goalAgainst: Team | null; steps: number } {
    for (let steps = 1; steps <= maxSteps; steps++) {
      const { goalAgainst } = this.step()
      if (goalAgainst || this.isSettled()) return { goalAgainst, steps }
    }
    return { goalAgainst: null, steps: maxSteps }
  }

  private static pose(b: RAPIER.RigidBody): Pose {
    const t = b.translation(), q = b.rotation()
    return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w }
  }

  piecePose(id: string): Pose {
    return Table.pose(this.body(id))
  }

  ballPose(): Pose {
    return Table.pose(this.ball)
  }
}
