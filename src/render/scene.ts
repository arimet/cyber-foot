import * as THREE from 'three'
import { arrowLength } from '../game/aim'
import {
  BALL_RADIUS, BASE_RADIUS, BODY_HEIGHT, GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT, RAIL_HEIGHT, TABLE_HALF_LENGTH,
  TABLE_HALF_WIDTH,
} from '../game/constants'
import type { PieceSpec, Role, Team } from '../game/types'
import type { Table } from '../physics/table'

export const TEAM_COLOR: Record<Team, number> = { cyan: 0x2cf6ff, magenta: 0xff3df2 }
const BODY_COLOR: Record<Role, number> = { heavy: 0x8d96a8, light: 0xff8a2a, keeper: 0x4a3328 }
const LINE = 0x2cf6ff
const BASE_H = 0.4

const neon = (color: number, intensity = 1.6) =>
  new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity })

type PieceView = { group: THREE.Group; ring: THREE.MeshStandardMaterial }

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer
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

  constructor(private readonly canvas: HTMLCanvasElement, pieces: readonly PieceSpec[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.scene.background = new THREE.Color(0x05050c)
    this.scene.add(new THREE.HemisphereLight(0x8090ff, 0x100818, 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(-6, 14, 10)
    this.scene.add(key)

    this.buildTable()
    for (const p of pieces) this.views.set(p.id, this.buildPiece(p))
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x334455, roughness: 0.4 }),
    )
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
    const edge = neon(LINE, 1.2)
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
      const mat = neon(TEAM_COLOR[team], 2)
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

  // Placeholder figure until the voxel animals: glowing base ring, a block body with a team-colour visor.
  private buildPiece(p: PieceSpec): PieceView {
    const r = BASE_RADIUS[p.role], h = BODY_HEIGHT[p.role] - BASE_H
    const group = new THREE.Group()
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.92, r, BASE_H, 32),
      new THREE.MeshStandardMaterial({ color: 0x0d1626, roughness: 0.5 }),
    )
    base.position.y = BASE_H / 2
    const ring = neon(TEAM_COLOR[p.team], 1.2)
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 48).rotateX(Math.PI / 2), ring)
    ringMesh.position.y = 0.06
    const w = r * 1.05
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), new THREE.MeshStandardMaterial({ color: BODY_COLOR[p.role], roughness: 0.7 }))
    body.position.y = BASE_H + h / 2
    const visor = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, h * 0.12, w * 0.84), neon(TEAM_COLOR[p.team], 2))
    visor.position.y = BASE_H + h * 0.8
    group.add(base, ringMesh, body, visor)
    this.scene.add(group)
    return { group, ring }
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Fit the whole table, goals included, whatever the screen shape. Tilted 45°.
    const v = THREE.MathUtils.degToRad(this.camera.fov / 2)
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect)
    const dist = Math.max((TABLE_HALF_LENGTH + GOAL_DEPTH + 0.8) / Math.tan(hfov), (TABLE_HALF_WIDTH + 1.5) / Math.tan(v)) * 1.05
    this.camera.position.set(0, dist * Math.SQRT1_2, dist * Math.SQRT1_2)
    this.camera.lookAt(0, 0, 0.6)
    this.camera.updateProjectionMatrix()
  }

  sync(table: Table): void {
    for (const [id, v] of this.views) {
      const p = table.piecePose(id)
      v.group.position.set(p.x, p.y, p.z)
      v.group.quaternion.set(p.qx, p.qy, p.qz, p.qw)
      v.ring.emissiveIntensity = id === this.selected ? 4 : 1.2
    }
    const b = table.ballPose()
    this.ball.position.set(b.x, b.y, b.z)
    this.ball.quaternion.set(b.qx, b.qy, b.qz, b.qw)
  }

  tableHit(clientX: number, clientY: number): { x: number; z: number } | null {
    const r = this.canvas.getBoundingClientRect()
    this.camera.updateMatrixWorld() // the camera may not have been rendered since the last resize
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera)
    const hit = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3())
    return hit ? { x: hit.x, z: hit.z } : null
  }

  setSelected(id: string | null): void {
    this.selected = id
  }

  setAim(origin: { x: number; z: number } | null, dirX: number, dirZ: number, power: number, role: Role): void {
    this.arrow.visible = !!origin
    if (!origin) return
    const len = arrowLength(power, role)
    this.arrow.position.set(origin.x, 0.03, origin.z)
    this.arrow.rotation.y = -Math.atan2(dirZ, dirX)
    this.shaft.scale.x = len
    this.head.position.x = len
    this.arrowMat.color.setHex(LINE).lerp(new THREE.Color(0xff2d55), power)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }
}
