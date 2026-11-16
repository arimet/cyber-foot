import RAPIER from '@dimforge/rapier3d-compat'
import {
  BALL_MASS, BALL_RADIUS, BASE_RADIUS, BODY_HEIGHT, GLASS_HEIGHT, GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, KICKOFF,
  LOB_ANGLE_DEG, MASS, MAX_IMPULSE, MAX_TURN_STEPS, PIECES, SETTLE_SPEED, SETTLE_STEPS, TABLE_HALF_LENGTH,
  TABLE_HALF_WIDTH, TIP_COS,
} from '../game/constants'
import type { PieceSpec, Shot, Team } from '../game/types'

export type Contact = { kind: 'piece' | 'ball' | 'rail'; strength: number }
const MIN_CONTACT = 0.5 // softer touches are not reported

export type Pose = { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number; vx: number; vz: number }

// Feel knobs, tuned by playing.
const WALL = 0.5 // wall thickness
const BASE_HALF = 0.12 // half height of the base's flat part
const BASE_ROUND = 0.08 // rounded edge of the base
const BASE_SHARE = 0.8 // share of a piece's mass in its base: low centre of mass
const FRICTION = 0.08
const PIECE_BOUNCE = 0.4
const BALL_BOUNCE = 0.6
const WALL_BOUNCE = 0.5
const PIECE_DAMPING = 0.45
const PIECE_SPIN_DAMPING = 4 // a piece lying on its side would roll on its round base forever
const BALL_DAMPING = 1.6
const BALL_SPIN_DAMPING = 0.8
// Knock: the flat bases meet below the centre of mass, so plain contact rarely tips anything. A head-on hit is scored
// as (closing speed - KNOCK_SPEED) x (other mass / own mass); at KNOCK_SEVERITY or more the piece is given a fixed
// spin that lays it down. Fixed, so a harder hit never tips less (an added spin made pieces cartwheel at random).
const KNOCK_SPEED = 1.0
const KNOCK_SEVERITY = 5
const TIP_SPIN = 4 // tips the piece over its base's rim with a little to spare; gravity does the rest
const FALL_SPIN_DAMPING = 0.3
const LYING_DAMPING = 3 // a figure lying on its side scrapes to a halt (friction would trip it over its head)
const FALLEN_BASE_SHARE = 0.4 // a knocked piece loses its weighted base's pull, or it would rock back up like a weeble
const LAID_COS = 0.2 // past ~78° the piece is down: heavy spin damping, so it never cartwheels back up

let ready: Promise<void> | null = null

export class Table {
  readonly pieces: readonly PieceSpec[] = PIECES
  private readonly world: RAPIER.World
  private readonly bodies = new Map<string, RAPIER.RigidBody>()
  private readonly ball: RAPIER.RigidBody
  private readonly ballCollider: number
  private readonly colliderOwner = new Map<number, string>()
  private readonly events = new RAPIER.EventQueue(true)
  private calm = 0
  private goalReported = false
  private lob: { id: string; dirX: number; dirZ: number } | null = null
  private readonly preStep = new Map<string, { x: number; z: number }>()
  private readonly falling = new Set<string>()
  private floorCollider = -1
  private ballPre = { x: 0, y: 0, z: 0 }

  static async create(): Promise<Table> {
    await (ready ??= RAPIER.init())
    return new Table()
  }

  // A copy of the exact world, contact caches included, so a shot played on it predicts the real one.
  // Counters start fresh. Call free() when done: the world lives in WASM memory.
  clone(): Table {
    return new Table(RAPIER.World.restoreSnapshot(this.world.takeSnapshot()), this)
  }

  free(): void {
    this.world.free()
    this.events.free()
  }

  private constructor(world?: RAPIER.World, src?: Table) {
    if (world && src) {
      // Handles survive the snapshot; the JS wrappers must be fetched from the new world.
      this.world = world
      for (const [id, b] of src.bodies) this.bodies.set(id, world.getRigidBody(b.handle))
      this.ball = world.getRigidBody(src.ball.handle)
      this.ballCollider = src.ballCollider
      for (const [h, id] of src.colliderOwner) this.colliderOwner.set(h, id)
      for (const id of src.falling) this.falling.add(id)
      this.floorCollider = src.floorCollider
      return
    }
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.buildArena()
    for (const p of this.pieces) this.bodies.set(p.id, this.buildPiece(p))
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setLinearDamping(BALL_DAMPING).setAngularDamping(BALL_SPIN_DAMPING),
    )
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS).setMass(BALL_MASS).setRestitution(BALL_BOUNCE).setFriction(FRICTION)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.ball,
    ).handle
    this.reset()
  }

  private fixedBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): number {
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setRestitution(WALL_BOUNCE).setFriction(FRICTION),
    ).handle
  }

  private buildArena() {
    const L = TABLE_HALF_LENGTH, W = TABLE_HALF_WIDTH, G = GOAL_HALF_WIDTH, H = GLASS_HEIGHT
    const outerX = L + GOAL_DEPTH + WALL
    this.floorCollider = this.fixedBox(0, -WALL / 2, 0, outerX, WALL / 2, W + WALL) // floor
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
    const own = (c: RAPIER.Collider) => this.colliderOwner.set(c.handle, p.id)
    own(this.world.createCollider(
      RAPIER.ColliderDesc.roundCylinder(BASE_HALF, r - BASE_ROUND, BASE_ROUND)
        .setTranslation(0, BASE_HALF + BASE_ROUND, 0)
        .setMass(m * BASE_SHARE).setRestitution(PIECE_BOUNCE).setFriction(FRICTION)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    ))
    const bodyR = r * 0.55
    const bodyHalf = Math.max(0.05, (BODY_HEIGHT[p.role] - baseTop) / 2 - bodyR)
    own(this.world.createCollider(
      RAPIER.ColliderDesc.capsule(bodyHalf, bodyR)
        .setTranslation(0, baseTop + bodyHalf + bodyR, 0)
        .setMass(m * (1 - BASE_SHARE)).setRestitution(PIECE_BOUNCE).setFriction(FRICTION)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    ))
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
    this.lob = null
  }

  placePiece(id: string, x: number, z: number): void {
    const b = this.body(id)
    b.setTranslation({ x, y: 0, z }, true)
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    Table.still(b)
    b.setAngularDamping(PIECE_SPIN_DAMPING)
    b.setLinearDamping(PIECE_DAMPING)
    this.ballast(id, BASE_SHARE)
    this.falling.delete(id)
    this.calm = 0
  }

  // Collider 0 is the base, 1 the body.
  private ballast(id: string, baseShare: number) {
    const b = this.body(id), m = MASS[this.role(id)]
    b.collider(0).setMass(m * baseShare)
    b.collider(1).setMass(m * (1 - baseShare))
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
    this.lob = shot.mode === 'lob' ? { id: shot.pieceId, dirX: shot.dirX, dirZ: shot.dirZ } : null
  }

  // One fixed step. Reports a goal once per turn, and the contacts that started, with their impact speed.
  step(): { goalAgainst: Team | null; contacts: Contact[] } {
    for (const [id, b] of this.bodies) {
      const v = b.linvel()
      this.preStep.set(id, { x: v.x, z: v.z })
    }
    const bv = this.ball.linvel()
    this.ballPre = { x: bv.x, y: bv.y, z: bv.z }
    this.world.step(this.events)
    const knocked = new Set<string>()
    const contacts: Contact[] = []
    const report = (kind: Contact['kind'], strength: number) => { if (strength >= MIN_CONTACT) contacts.push({ kind, strength }) }
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return
      const a = this.colliderOwner.get(h1), b = this.colliderOwner.get(h2)
      if (a && b) {
        if (a === b) return
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (!knocked.has(key)) {
          knocked.add(key)
          report('piece', this.knock(a, b))
        }
        return
      }
      const isBall = h1 === this.ballCollider || h2 === this.ballCollider
      const other = h1 === this.ballCollider ? h2 : h1
      const piece = a ?? b
      const bp = this.ballPre
      if (isBall && piece) {
        const pv = this.preStep.get(piece)!
        report('ball', Math.hypot(bp.x - pv.x, bp.y, bp.z - pv.z))
        if (this.lob && piece === this.lob.id) this.liftBall()
      } else if (isBall) {
        // the floor makes the ball bounce, everything else is a rail
        if (other === this.floorCollider) report('ball', Math.abs(bp.y))
        else report('rail', Math.hypot(bp.x, bp.y, bp.z))
      } else if (piece && h1 !== this.floorCollider && h2 !== this.floorCollider) {
        const pv = this.preStep.get(piece)!
        report('rail', Math.hypot(pv.x, pv.z))
      }
    })
    this.calm = this.allQuiet() ? this.calm + 1 : 0
    for (const id of this.falling) {
      if (this.upY(id) > LAID_COS) continue
      const b = this.body(id), w = b.angvel()
      b.setAngvel({ x: 0, y: w.y, z: 0 }, true) // down: no cartwheel over its head
      b.setAngularDamping(PIECE_SPIN_DAMPING)
      b.setLinearDamping(LYING_DAMPING)
      this.falling.delete(id)
    }
    const goalAgainst = this.goalReported ? null : this.ballInGoal()
    if (goalAgainst) this.goalReported = true
    return { goalAgainst, contacts }
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

  // Lob: the first time the armed piece touches the ball, the ball leaves at LOB_ANGLE_DEG, same heading and speed.
  private liftBall() {
    const lob = this.lob!
    this.lob = null
    const v = this.ball.linvel()
    const h = Math.hypot(v.x, v.z)
    const [hx, hz] = h > 1e-3 ? [v.x / h, v.z / h] : [lob.dirX, lob.dirZ]
    const speed = Math.hypot(v.x, v.y, v.z)
    const a = (LOB_ANGLE_DEG * Math.PI) / 180
    this.ball.setLinvel({ x: hx * speed * Math.cos(a), y: speed * Math.sin(a), z: hz * speed * Math.cos(a) }, true)
  }

  // Returns the closing speed of the hit.
  private knock(a: string, b: string): number {
    const pa = this.body(a).translation(), pb = this.body(b).translation()
    const dx = pb.x - pa.x, dz = pb.z - pa.z, d = Math.hypot(dx, dz)
    if (d < 1e-6) return 0
    const nx = dx / d, nz = dz / d // from a to b
    const va = this.preStep.get(a)!, vb = this.preStep.get(b)!
    const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz
    const excess = closing - KNOCK_SPEED
    if (excess <= 0) return Math.max(0, closing)
    const ma = MASS[this.role(a)], mb = MASS[this.role(b)]
    // Bases meet low down: b's base is shoved out from under it, so its top falls back toward a,
    // while a's base stops dead and its top carries on toward b.
    if ((excess * ma) / mb >= KNOCK_SEVERITY) this.topple(b, -nx, -nz)
    if ((excess * mb) / ma >= KNOCK_SEVERITY) this.topple(a, nx, nz)
    return closing
  }

  // Rolls the piece over the rim of its base on the (nx, nz) side, the way a real one goes down:
  // the rim stays on the floor, the top swings out and gravity speeds it up.
  private topple(id: string, nx: number, nz: number) {
    this.falling.add(id)
    const b = this.body(id), cur = b.angvel(), v = b.linvel(), o = b.translation(), c = b.worldCom()
    const r = BASE_RADIUS[this.role(id)]
    const wx = nz * TIP_SPIN, wz = -nx * TIP_SPIN
    const rx = c.x - (o.x + nx * r), ry = c.y - o.y, rz = c.z - (o.z + nz * r) // rim -> centre of mass
    this.ballast(id, FALLEN_BASE_SHARE)
    b.setAngularDamping(FALL_SPIN_DAMPING)
    b.setAngvel({ x: wx, y: cur.y, z: wz }, true)
    b.setLinvel({ x: v.x - wz * ry, y: v.y + wz * rx - wx * rz, z: v.z + wx * ry }, true) // v + w x r
  }

  private role(id: string) {
    return this.pieces.find(p => p.id === id)!.role
  }

  // y of the piece's local up axis
  private upY(id: string): number {
    const q = this.body(id).rotation()
    return 1 - 2 * (q.x * q.x + q.z * q.z)
  }

  isTipped(id: string): boolean {
    return this.upY(id) < TIP_COS
  }

  tippedIds(): string[] {
    return this.pieces.filter(p => this.isTipped(p.id)).map(p => p.id)
  }

  tilt(id: string, angleRad: number): void {
    this.body(id).setRotation({ x: 0, y: 0, z: Math.sin(angleRad / 2), w: Math.cos(angleRad / 2) }, true)
  }

  // Upright where it lies if that spot is free, else the nearest free spot on rings around it, kept on the table.
  // A lying piece blocks the strip from its base to its head, not just its base circle.
  standUp(id: string): void {
    const r = BASE_RADIUS[this.role(id)]
    const here = this.body(id).translation()
    const blockers = [
      ...this.pieces.filter(p => p.id !== id).map(p => {
        const b = this.body(p.id), t = b.translation(), q = b.rotation(), h = BODY_HEIGHT[p.role]
        const ux = 2 * (q.x * q.y - q.w * q.z), uz = 2 * (q.y * q.z + q.w * q.x) // local up axis, on the floor
        return { ax: t.x, az: t.z, bx: t.x + ux * h, bz: t.z + uz * h, r: BASE_RADIUS[p.role] }
      }),
      (() => { const t = this.ball.translation(); return { ax: t.x, az: t.z, bx: t.x, bz: t.z, r: BALL_RADIUS } })(),
    ]
    const maxX = TABLE_HALF_LENGTH - r, maxZ = TABLE_HALF_WIDTH - r
    const free = (x: number, z: number) =>
      Math.abs(x) <= maxX && Math.abs(z) <= maxZ && blockers.every(o => segDist(x, z, o) >= r + o.r + 0.01)
    const x0 = Math.max(-maxX, Math.min(maxX, here.x)), z0 = Math.max(-maxZ, Math.min(maxZ, here.z))
    let spot = { x: x0, z: z0 }
    search: if (!free(x0, z0)) {
      for (let ring = 1; ring <= 40; ring++) {
        const d = ring * 0.25
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2
          if (free(x0 + d * Math.cos(a), z0 + d * Math.sin(a))) {
            spot = { x: x0 + d * Math.cos(a), z: z0 + d * Math.sin(a) }
            break search
          }
        }
      }
    }
    this.placePiece(id, spot.x, spot.z)
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
    const t = b.translation(), q = b.rotation(), v = b.linvel()
    return { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w, vx: v.x, vz: v.z }
  }

  piecePose(id: string): Pose {
    return Table.pose(this.body(id))
  }

  ballPose(): Pose {
    return Table.pose(this.ball)
  }
}

const segDist = (x: number, z: number, s: { ax: number; az: number; bx: number; bz: number }) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az, len2 = dx * dx + dz * dz
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2)) : 0
  return Math.hypot(x - (s.ax + t * dx), z - (s.az + t * dz))
}
