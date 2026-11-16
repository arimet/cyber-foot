import * as THREE from 'three'
import { arrowLength } from '../game/aim'
import {
  BASE_RADIUS, BODY_HEIGHT, GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, RAIL_HEIGHT, TABLE_HALF_LENGTH,
  TABLE_HALF_WIDTH,
} from '../game/constants'
import type { PieceSpec, Role, Team } from '../game/types'
import type { Table } from '../physics/table'
import { type Animal, type Rig, createAnimal } from './animals'
import { createBall } from './ball'
import { framedFocus } from './framing'
import { FigureMotion, type Mood, applyPose } from './rig'
import { createRoom } from './room'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export const TEAM_COLOR: Record<Team, number> = { cyan: 0x2cf6ff, magenta: 0xff3df2 }
const LINE = 0x2cf6ff
const BASE_H = 0.4
const ANIMAL: Record<string, Animal> = { keeper: 'gorilla', heavy1: 'rhino', heavy2: 'bear', light1: 'fox', light2: 'cat' }
const FIGURE_OVERHANG = 0.25 // the figure may stand a little taller than its physics body
const CLOSE_ZOOM = 1.7
const CAMERA_EASE = 0.06 // share of the remaining way covered each frame

const neon = (color: number, intensity = 1.6) =>
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity })

type PieceView = {
  group: THREE.Group; ring: THREE.MeshStandardMaterial; team: Team
  rig: Rig; motion: FigureMotion; vel: { x: number; z: number }; seen: { x: number; z: number }
  down: boolean // lying on the table: when it is next seen upright, it was stood back up
}
const COIL = 0.4 // lean back (rad) at full pull

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly composer: EffectComposer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  private readonly views = new Map<string, PieceView>()
  private readonly ball: THREE.Mesh
  private readonly arrow = new THREE.Group()
  private readonly arrowMat = new THREE.MeshBasicMaterial({ color: LINE, transparent: true, opacity: 0.9 })
  private readonly shaft: THREE.Mesh
  private readonly head: THREE.Mesh
  private readonly ray = new THREE.Raycaster()
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private selected: string | null = null
  private readonly room = createRoom()
  private fitDist = 30 // camera distance that frames the whole table
  private zoomTarget = CLOSE_ZOOM
  private zoom = CLOSE_ZOOM
  private focus = { x: 0, z: 0 }
  private aim: { x: number; z: number; power: number } | null = null
  private stunned: ReadonlySet<string> = new Set()
  private mood: { scorer: Team; since: number } | null = null
  private lastT = -1

  constructor(private readonly canvas: HTMLCanvasElement, pieces: readonly PieceSpec[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0x05050c)
    this.scene.add(new THREE.HemisphereLight(0x8090ff, 0x100818, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(-6, 14, 10)
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.9) // from the camera side, so faces read
    fill.position.set(2, 6, 14)
    this.scene.add(key, fill)
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.15, 0.85))
    this.composer.addPass(new OutputPass())

    this.scene.add(this.room.group)
    this.buildTable()
    for (const p of pieces) this.views.set(p.id, this.buildPiece(p))
    this.ball = createBall()
    this.scene.add(this.ball)

    this.shaft = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.14).translate(0.5, 0, 0).rotateX(-Math.PI / 2), this.arrowMat)
    const tri = new THREE.Shape([new THREE.Vector2(0, -0.28), new THREE.Vector2(0.4, 0), new THREE.Vector2(0, 0.28)])
    this.head = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), this.arrowMat)
    this.arrow.add(this.shaft, this.head)
    this.arrow.visible = false
    this.scene.add(this.arrow)

    addEventListener('resize', () => this.resize())
    this.resize()
  }

  private add(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    this.scene.add(m)
    return m
  }

  private buildTable() {
    const L = TABLE_HALF_LENGTH, W = TABLE_HALF_WIDTH
    const floor = new THREE.MeshStandardMaterial({ color: 0x0f1a2a, roughness: 0.85 })
    this.add(new THREE.BoxGeometry(2 * (L + GOAL_DEPTH + 1), 0.2, 2 * W + 2), floor, 0, -0.1, 0)
    const line = neon(LINE, 0.7)
    const strip = (x: number, z: number, lx: number, lz: number) => this.add(new THREE.BoxGeometry(lx, 0.01, lz), line, x, 0.005, z)
    const t = 0.06
    strip(0, 0, t, 2 * W) // halfway line
    this.add(new THREE.RingGeometry(2.4, 2.4 + t, 64).rotateX(-Math.PI / 2), line, 0, 0.006, 0)
    for (const s of [-1, 1]) {
      const bx = 3.2, bz = 4.2 // penalty box
      strip(s * (L - bx), 0, t, 2 * bz)
      strip(s * (L - bx / 2), bz, bx, t)
      strip(s * (L - bx / 2), -bz, bx, t)
    }
    // rails, with a neon top edge
    const rail = new THREE.MeshStandardMaterial({ color: 0x141a2a, roughness: 0.6 })
    const edge = neon(LINE, 0.8)
    const railBox = (x: number, z: number, lx: number, lz: number) => {
      this.add(new THREE.BoxGeometry(lx, RAIL_HEIGHT, lz), rail, x, RAIL_HEIGHT / 2, z)
      this.add(new THREE.BoxGeometry(lx, 0.04, lz), edge, x, RAIL_HEIGHT + 0.02, z)
    }
    for (const s of [-1, 1]) {
      railBox(0, s * (W + 0.15), 2 * L + 0.6, 0.3)
      const seg = W - GOAL_HALF_WIDTH
      for (const u of [-1, 1]) railBox(s * (L + 0.15), u * (GOAL_HALF_WIDTH + seg / 2), 0.3, seg)
    }
    // goals: posts, crossbar, back frame in the defending team's colour
    for (const [s, team] of [[-1, 'cyan'], [1, 'magenta']] as const) {
      const mat = neon(TEAM_COLOR[team], 1.3)
      const post = new THREE.CylinderGeometry(0.06, 0.06, GOAL_HEIGHT, 8)
      for (const u of [-1, 1]) {
        this.add(post, mat, s * L, GOAL_HEIGHT / 2, u * GOAL_HALF_WIDTH)
        this.add(post, mat, s * (L + GOAL_DEPTH), GOAL_HEIGHT / 2, u * GOAL_HALF_WIDTH)
      }
      this.add(new THREE.BoxGeometry(0.1, 0.1, 2 * GOAL_HALF_WIDTH), mat, s * L, GOAL_HEIGHT, 0)
      const net = new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, opacity: 0.12, side: THREE.DoubleSide })
      this.add(new THREE.PlaneGeometry(2 * GOAL_HALF_WIDTH, GOAL_HEIGHT).rotateY(Math.PI / 2), net, s * (L + GOAL_DEPTH), GOAL_HEIGHT / 2, 0)
    }
  }

  // Glowing base ring and the team's voxel animal on it.
  private buildPiece(p: PieceSpec): PieceView {
    const r = BASE_RADIUS[p.role], h = BODY_HEIGHT[p.role] - BASE_H
    const group = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.92, r, BASE_H, 32),
      new THREE.MeshStandardMaterial({ color: 0x0d1626, roughness: 0.5 }),
    )
    base.position.y = BASE_H / 2
    const ring = neon(TEAM_COLOR[p.team], 0.8)
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 48).rotateX(Math.PI / 2), ring)
    ringMesh.position.y = 0.06
    const rig = createAnimal(ANIMAL[p.id.split('-')[1]], p.team)
    const figure = rig.root
    const box = new THREE.Box3().setFromObject(figure)
    figure.scale.setScalar((h + FIGURE_OVERHANG) / (box.max.y - box.min.y))
    figure.position.y = BASE_H
    figure.rotation.y = p.team === 'cyan' ? Math.PI / 4 : -Math.PI / 4 // three-quarters toward the goal it attacks
    group.add(base, ringMesh, figure)
    group.userData.id = p.id
    this.scene.add(group)
    const phase = [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 7 // so they don't breathe in step
    return { group, ring, team: p.team, rig, motion: new FigureMotion(phase), vel: { x: 0, z: 0 }, seen: { x: 0, z: 0 }, down: false }
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.composer.setSize(w, h)
    this.camera.aspect = w / h
    // Fit the whole table, goals included, whatever the screen shape. Tilted 45°.
    const v = THREE.MathUtils.degToRad(this.camera.fov / 2)
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect)
    this.fitDist = Math.max((TABLE_HALF_LENGTH + GOAL_DEPTH + 0.8) / Math.tan(hfov), (TABLE_HALF_WIDTH + 1.5) / Math.tan(v)) * 1.05
    this.camera.updateProjectionMatrix()
    this.placeCamera()
  }

  private placeCamera() {
    const d = (this.fitDist / this.zoom) * Math.SQRT1_2
    this.camera.position.set(this.focus.x, d, this.focus.z + d)
    this.camera.lookAt(this.focus.x, 0, this.focus.z + 0.6)
  }

  // Close view (follows the ball) or the whole table.
  setClose(close: boolean): void {
    this.zoomTarget = close ? CLOSE_ZOOM : 1
  }

  sync(table: Table): void {
    for (const [id, v] of this.views) {
      const p = table.piecePose(id)
      v.group.position.set(p.x, p.y, p.z)
      v.group.quaternion.set(p.qx, p.qy, p.qz, p.qw)
      v.vel = { x: p.vx, z: p.vz }
      const up = 1 - 2 * (p.qx * p.qx + p.qz * p.qz) // cosine of the tilt
      if (up < 0.7) v.down = true
      else if (v.down && up > 0.95) { // stood up by the rules (after a stunned turn, or for a kickoff)
        v.down = false
        v.motion.rise(Math.max(0, this.lastT))
      }
      v.ring.emissiveIntensity = id === this.selected ? 1.6 : 0.8
    }
    const b = table.ballPose()
    this.zoom += (this.zoomTarget - this.zoom) * CAMERA_EASE
    const f = framedFocus(b.x, b.z, this.zoom)
    this.focus.x += (f.x - this.focus.x) * CAMERA_EASE
    this.focus.z += (f.z - this.focus.z) * CAMERA_EASE
    this.placeCamera()
    this.ball.position.set(b.x, b.y, b.z)
    this.ball.quaternion.set(b.qx, b.qy, b.qz, b.qw)
  }

  private readonly q = new THREE.Quaternion()
  private readonly qi = new THREE.Quaternion()
  private readonly v3 = new THREE.Vector3()

  private animate(t: number, dt: number) {
    const ball = this.ball.position
    for (const [id, v] of this.views) {
      // the rig's axes: the base's tilt and turn, then the figure's three-quarter turn
      this.q.copy(v.group.quaternion).multiply(v.rig.root.quaternion)
      this.qi.copy(this.q).invert()
      const turn = (q: THREE.Quaternion) => (x: number, z: number) => {
        this.v3.set(x, 0, z).applyQuaternion(q)
        return { x: this.v3.x, z: this.v3.z }
      }
      const toLocal = turn(this.qi), toWorld = turn(this.q)
      const aiming = id === this.selected && this.aim
      const pos = v.group.position
      const look = aiming ? toLocal(this.aim!.x, this.aim!.z) : toLocal(ball.x - pos.x, ball.z - pos.z)
      const coil = aiming ? toLocal(-this.aim!.x * this.aim!.power * COIL, -this.aim!.z * this.aim!.power * COIL) : { x: 0, z: 0 }
      const mood: Mood = this.mood ? (this.mood.scorer === v.team ? 'cheer' : 'sulk') : null
      const dvx = v.vel.x - v.seen.x, dvz = v.vel.z - v.seen.z
      v.seen = v.vel
      applyPose(v.rig, v.motion.update({
        t, dt, dvx, dvz, look, coil, stunned: this.stunned.has(id), mood, moodT: this.mood ? t - this.mood.since : 0,
      }, toLocal, toWorld))
    }
  }

  private aimRay(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect()
    this.camera.updateMatrixWorld() // the camera may not have been rendered since the last resize
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera)
  }

  tableHit(clientX: number, clientY: number): { x: number; z: number } | null {
    this.aimRay(clientX, clientY)
    const hit = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3())
    return hit ? { x: hit.x, z: hit.z } : null
  }

  // Pieces under the pointer, nearest first: players click the figure, not the spot on the floor under it.
  piecesAt(clientX: number, clientY: number): string[] {
    this.aimRay(clientX, clientY)
    const ids: string[] = []
    for (const hit of this.ray.intersectObjects([...this.views.values()].map(v => v.group), true)) {
      let o: THREE.Object3D | null = hit.object
      while (o && !o.userData.id) o = o.parent
      if (o && !ids.includes(o.userData.id)) ids.push(o.userData.id)
    }
    return ids
  }

  setSelected(id: string | null): void {
    this.selected = id
  }

  // Pieces lying stunned, and the team that just scored (the other one sulks).
  setStunned(ids: ReadonlySet<string>): void {
    this.stunned = new Set(ids)
  }

  cheer(scorer: Team): void {
    this.mood = { scorer, since: this.lastT }
  }

  setAim(origin: { x: number; z: number } | null, dirX: number, dirZ: number, power: number, role: Role): void {
    this.aim = origin ? { x: dirX, z: dirZ, power } : null
    this.arrow.visible = !!origin
    if (!origin) return
    const len = arrowLength(power, role)
    this.arrow.position.set(origin.x, 0.03, origin.z)
    this.arrow.rotation.y = -Math.atan2(dirZ, dirX)
    this.shaft.scale.x = len
    this.head.position.x = len
    this.arrowMat.color.setHex(LINE).lerp(new THREE.Color(0xff2d55), power)
  }

  render(t: number): void {
    const dt = this.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this.lastT))
    this.lastT = t
    if (dt > 0) this.animate(t, dt)
    this.room.update(t)
    this.composer.render()
  }
}
