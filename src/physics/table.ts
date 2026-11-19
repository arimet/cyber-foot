import RAPIER from '@dimforge/rapier3d-compat'
import {
  BALL_DAMPING, BALL_MASS, BALL_RADIUS, BASE_RADIUS, BODY_HEIGHT, GLASS_HEIGHT, GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, KICK_SPEED, KICKOFF,
  GLASS_CURVE, LOB_ANGLE_DEG, MASS, MAX_IMPULSE, MAX_TURN_STEPS, PIECE_INSET, PIECES, RAMP_RADIUS, SETTLE_SPEED, SETTLE_STEPS, SHOT_BOOST,
  TABLE_HALF_LENGTH, TABLE_HALF_WIDTH, TIP_COS,
} from '../game/constants'
import { type Blocker, glassProfile, railGap, rampProfile, segDist, sweep } from '../game/arena'
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
const BALL_RAIL_DAMPING = 0.1 // up the curved rail or the glass: nothing rolls against it, so it comes back with pace
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
// Possession: a standing piece takes the ball once it comes within CAPTURE_GAP of its base and keeps it at its feet, on
// the side it came from. A field piece lets a hard or flying ball bounce off; the keeper catches anything it touches.
// A piece the ball bounced off, a kicker and the two pieces of a tackle may not take it until it has left their reach.
const CAPTURE_GAP = 0.5
const CATCH_SPEED = 9 // a field piece lets a faster ball bounce off: a half-power kick or less is caught
const CATCH_HEIGHT = BALL_RADIUS + 0.3 // a field piece does not catch a ball flying higher
const HOLD_IN = 0.2 // share of the way in to the feet the ball goes each step
const TACKLE_SPEED = 3 // closing speed at which an opponent knocks the ball loose
const TACKLE_BALL = 4 // the loose ball leaves at least this fast, on the way of the hit

// Collision groups: the curved ramp along the rails only meets the ball; pieces stop at a straight wall a little in
// front of it instead, since a flat base riding up a curve would tip.
const groups = (member: number, filter: number) => (member << 16) | filter
const BALL_GROUP = 1, PIECE_GROUP = 2

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
  private readonly preStep = new Map<string, { x: number; z: number }>()
  private readonly falling = new Set<string>()
  private floorCollider = -1
  private benched: ReadonlySet<string> = new Set() // off the pitch: no body in play
  private ballPre = { x: 0, y: 0, z: 0 }
  private holding: string | null = null // the piece with the ball at its feet
  private caught: string | null = null // the piece that took the ball since the last shot
  private kicker: string | null = null // the last shot was a kick by this piece
  private unarmed = new Set<string>() // may not take the ball until it has left their reach
  private tackled: string | null = null // lost the ball to a tackle: may not take it back before the next shot

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
      this.holding = src.holding
      this.caught = src.caught
      this.kicker = src.kicker
      this.unarmed = new Set(src.unarmed)
      this.tackled = src.tackled
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
        .setCollisionGroups(groups(BALL_GROUP, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
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
    // Frictionless: a rolling ball keeps its spin on the way up, and friction would have it fight that spin on the
    // way down, coming back at half pace.
    const rail = (profile: [number, number][], member: number, filter: number) => {
      const { positions, indices } = sweep(profile)
      this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(positions, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
          .setRestitution(WALL_BOUNCE)
          .setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setCollisionGroups(groups(member, filter)),
      )
    }
    // closed off straight up at the end of the curve, so a ball can never come to rest on top of it
    rail([...rampProfile(RAMP_RADIUS), ...glassProfile(RAMP_RADIUS, GLASS_CURVE), [GLASS_CURVE, H]], 4, BALL_GROUP)
    rail([[PIECE_INSET, 0], [PIECE_INSET, H]], 8, PIECE_GROUP)
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
        .setCollisionGroups(groups(PIECE_GROUP, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    ))
    const bodyR = r * 0.55
    const bodyHalf = Math.max(0.05, (BODY_HEIGHT[p.role] - baseTop) / 2 - bodyR)
    own(this.world.createCollider(
      RAPIER.ColliderDesc.capsule(bodyHalf, bodyR)
        .setTranslation(0, baseTop + bodyHalf + bodyR, 0)
        .setMass(m * (1 - BASE_SHARE)).setRestitution(PIECE_BOUNCE).setFriction(FRICTION)
        .setCollisionGroups(groups(PIECE_GROUP, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
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

  // Kickoff: every piece on its spot, the kickoff team's light1 at the centre with the ball.
  reset(kickoff: Team = 'cyan'): void {
    for (const p of this.pieces) this.placePiece(p.id, KICKOFF[p.id].x, KICKOFF[p.id].z)
    const id = `${kickoff}-light1`
    this.placePiece(id, (kickoff === 'cyan' ? -1 : 1) * (BASE_RADIUS.light + BALL_RADIUS + 0.03), 0)
    this.placeBall(0, BALL_RADIUS, 0)
    this.goalReported = false
    this.kicker = null
    this.unarmed.clear()
    this.holding = id
  }

  // The ball at the piece's feet, on the (dirX, dirZ) side (default: toward the goal its team attacks).
  giveBall(id: string, dirX?: number, dirZ?: number): void {
    const o = this.body(id).translation(), r = BASE_RADIUS[this.role(id)] + BALL_RADIUS + 0.03
    if (dirX === undefined || dirZ === undefined) [dirX, dirZ] = [id.startsWith('cyan') ? 1 : -1, 0]
    const d = Math.hypot(dirX, dirZ) || 1
    this.placeBall(o.x + (dirX / d) * r, BALL_RADIUS, o.z + (dirZ / d) * r)
    this.holding = id
  }

  // Takes the listed pieces off the pitch (back on their kickoff spot, body disabled) and brings every other one back.
  setBenched(ids: ReadonlySet<string>): void {
    this.benched = new Set(ids)
    if (this.holding && ids.has(this.holding)) this.holding = null
    for (const p of this.pieces) {
      const b = this.body(p.id)
      if (ids.has(p.id)) this.placePiece(p.id, KICKOFF[p.id].x, KICKOFF[p.id].z)
      b.setEnabled(!ids.has(p.id))
    }
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
    if (id === this.holding) this.holding = null
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
    this.holding = null
    this.caught = null
  }

  // The holder kicks the ball and stays put; any other piece slides (to tackle, block or pick up a loose ball).
  shoot(shot: Shot): void {
    this.goalReported = false
    this.caught = null
    this.kicker = null
    this.tackled = null
    this.launch(shot)
  }

  // Strategy mode: several pieces set off at the same instant.
  shootAll(shots: Shot[]): void {
    this.goalReported = false
    this.caught = null
    this.kicker = null
    this.tackled = null
    for (const s of shots) this.launch(s)
  }

  private launch(shot: Shot) {
    this.calm = 0
    if (shot.pieceId === this.holding) {
      this.kick(shot)
      this.kicker = shot.pieceId
      this.unarmed.add(shot.pieceId)
      this.holding = null
      return
    }
    const j = shot.power * MAX_IMPULSE * SHOT_BOOST[this.role(shot.pieceId)]
    this.body(shot.pieceId).applyImpulse({ x: shot.dirX * j, y: 0, z: shot.dirZ * j }, true)
  }

  // The ball leaves the holder's feet on the aimed side (it may have been held on any side), at a speed set by the pull.
  private kick(shot: Shot) {
    const o = this.body(shot.pieceId).translation(), r = BASE_RADIUS[this.role(shot.pieceId)] + BALL_RADIUS + 0.02
    const speed = shot.power * KICK_SPEED, a = shot.mode === 'lob' ? (LOB_ANGLE_DEG * Math.PI) / 180 : 0
    this.ball.setTranslation({ x: o.x + shot.dirX * r, y: BALL_RADIUS, z: o.z + shot.dirZ * r }, true)
    this.ball.setLinvel({ x: shot.dirX * speed * Math.cos(a), y: speed * Math.sin(a), z: shot.dirZ * speed * Math.cos(a) }, true)
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  // While the holder aims, its ball turns round the base toward the aimed side, at most maxTurn rad per call
  // (one call per frame), so the kick then leaves from where the ball already is. Other pieces leave it alone.
  aimHold(id: string, dirX: number, dirZ: number, maxTurn: number): void {
    if (id !== this.holding) return
    const o = this.body(id).translation(), t = this.ball.translation()
    const a = Math.atan2(t.z - o.z, t.x - o.x)
    const turn = Math.atan2(dirZ, dirX) - a, d = Math.atan2(Math.sin(turn), Math.cos(turn)) // shortest way round
    const next = a + Math.max(-maxTurn, Math.min(maxTurn, d)), r = BASE_RADIUS[this.role(id)] + BALL_RADIUS + 0.02
    this.ball.setTranslation({ x: o.x + r * Math.cos(next), y: BALL_RADIUS, z: o.z + r * Math.sin(next) }, true)
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }

  // How far the ball's edge is from the piece's base.
  private ballGap(id: string, t: { x: number; z: number }): number {
    const o = this.body(id).translation()
    return Math.hypot(t.x - o.x, t.z - o.z) - BASE_RADIUS[this.role(id)] - BALL_RADIUS
  }

  get holder(): string | null {
    return this.holding
  }

  // The teammate that caught the last kick, if it was one: a pass.
  get passedTo(): string | null {
    const k = this.kicker, c = this.caught
    return k && c && c !== k && this.team(c) === this.team(k) ? c : null
  }

  private team(id: string): Team {
    return this.pieces.find(p => p.id === id)!.team
  }

  // Whether the piece can take a ball arriving at that speed and height.
  private catches(id: string, speed: number, y: number): boolean {
    if (this.benched.has(id) || this.unarmed.has(id) || id === this.tackled || this.falling.has(id) || this.isTipped(id)) return false
    return this.role(id) === 'keeper' ? y < GOAL_HEIGHT : speed <= CATCH_SPEED && y <= CATCH_HEIGHT
  }

  // Keeps the held ball at its holder's feet (a holder knocked over drops it), or gives a loose ball to the first
  // piece within reach that can take it.
  private magnet(): string | null {
    if (this.goalReported) return null
    const t = this.ball.translation()
    for (const id of [...this.unarmed]) if (this.ballGap(id, t) > CAPTURE_GAP) this.unarmed.delete(id)
    if (this.holding && this.isTipped(this.holding)) {
      this.unarmed.add(this.holding)
      this.holding = null
    }
    if (this.holding) {
      this.hold(this.holding, t)
      return null
    }
    const v = this.ballPre, speed = Math.hypot(v.x, v.z)
    for (const p of this.pieces) {
      if (this.ballGap(p.id, t) > CAPTURE_GAP || !this.catches(p.id, speed, t.y)) continue
      this.holding = this.caught = p.id
      this.hold(p.id, t)
      return p.id
    }
    return null
  }

  // Draws the ball in to the piece's feet, on the side it is on, and carries it along as the piece moves.
  private hold(id: string, t: { x: number; z: number }) {
    const b = this.body(id), o = b.translation(), pv = b.linvel()
    const d = Math.hypot(t.x - o.x, t.z - o.z) || 1
    const k = (BASE_RADIUS[this.role(id)] + BALL_RADIUS + 0.03 - d) * HOLD_IN / d
    const fps = 60 // the fixed step: the velocity that lands the ball on the next point
    this.ball.setLinvel({ x: pv.x + (t.x - o.x) * k * fps, y: Math.min(0, this.ball.linvel().y), z: pv.z + (t.z - o.z) * k * fps }, true)
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }

  // An opponent ran into the holder or its ball: the ball comes loose on the way of the hit.
  private tackle(by: string) {
    const v = this.preStep.get(by)!, s = Math.hypot(v.x, v.z) || 1, speed = Math.max(TACKLE_BALL, s)
    this.tackled = this.holding
    this.unarmed.add(by)
    if (this.caught === this.holding) this.caught = null
    this.holding = null
    this.ball.setLinvel({ x: (v.x / s) * speed, y: 0, z: (v.z / s) * speed }, true)
  }

  // An opponent of the holder hits it, or its ball, hard enough.
  private tackles(by: string, closing: number): boolean {
    return !!this.holding && by !== this.holding && this.team(by) !== this.team(this.holding) && closing > TACKLE_SPEED
  }

  // One fixed step. Reports a goal once per turn, and the contacts that started, with their impact speed.
  step(): { goalAgainst: Team | null; contacts: Contact[]; captured: string | null } {
    for (const [id, b] of this.bodies) {
      const v = b.linvel()
      this.preStep.set(id, { x: v.x, z: v.z })
    }
    const bv = this.ball.linvel(), bt = this.ball.translation()
    this.ballPre = { x: bv.x, y: bv.y, z: bv.z }
    const climbing = bt.y > BALL_RADIUS + 0.02 && railGap(bt.x, bt.z).d < GLASS_CURVE
    this.ball.setLinearDamping(climbing ? BALL_RAIL_DAMPING : BALL_DAMPING)
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
          const closing = this.knock(a, b)
          report('piece', closing)
          if (this.holding === a && this.tackles(b, closing)) this.tackle(b)
          else if (this.holding === b && this.tackles(a, closing)) this.tackle(a)
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
        if (this.tackles(piece, Math.hypot(pv.x, pv.z))) this.tackle(piece)
        else if (!this.holding && !this.catches(piece, Math.hypot(bp.x, bp.z), this.ball.translation().y)) this.unarmed.add(piece) // bounced off
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
    const captured = this.magnet()
    return { goalAgainst, contacts, captured }
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
    return this.pieces.filter(p => !this.benched.has(p.id) && this.isTipped(p.id)).map(p => p.id)
  }

  tilt(id: string, angleRad: number): void {
    this.body(id).setRotation({ x: 0, y: 0, z: Math.sin(angleRad / 2), w: Math.cos(angleRad / 2) }, true)
  }

  // What stands or lies on the floor: each piece as a segment from its base to its head (a point when it stands).
  private blockers(except?: string): Blocker[] {
    return this.pieces.filter(p => p.id !== except && !this.benched.has(p.id)).map(p => {
      const b = this.body(p.id), t = b.translation(), q = b.rotation(), h = BODY_HEIGHT[p.role]
      const ux = 2 * (q.x * q.y - q.w * q.z), uz = 2 * (q.y * q.z + q.w * q.x) // local up axis, on the floor
      return { ax: t.x, az: t.z, bx: t.x + ux * h, bz: t.z + uz * h, r: BASE_RADIUS[p.role] }
    })
  }

  // Upright where it lies if that spot is free, else the nearest free spot on rings around it, kept on the table.
  // A lying piece blocks the strip from its base to its head, not just its base circle.
  standUp(id: string): void {
    const r = BASE_RADIUS[this.role(id)]
    const here = this.body(id).translation()
    const t = this.ball.translation()
    const blockers = [...this.blockers(id), { ax: t.x, az: t.z, bx: t.x, bz: t.z, r: BALL_RADIUS }]
    const maxX = TABLE_HALF_LENGTH - r, maxZ = TABLE_HALF_WIDTH - r
    const free = (x: number, z: number) =>
      Math.abs(x) <= maxX && Math.abs(z) <= maxZ && railGap(x, z).d >= PIECE_INSET + r &&
      blockers.every(o => segDist(x, z, o) >= r + o.r + 0.01)
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

  runTurn(maxSteps = MAX_TURN_STEPS): { goalAgainst: Team | null; steps: number; caught: string | null } {
    for (let steps = 1; steps <= maxSteps; steps++) {
      const { goalAgainst } = this.step()
      if (goalAgainst || this.isSettled()) return { goalAgainst, steps, caught: this.caught }
    }
    return { goalAgainst: null, steps: maxSteps, caught: this.caught }
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
