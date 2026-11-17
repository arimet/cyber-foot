import * as THREE from 'three'
import { GOAL_DEPTH, GOAL_HALF_WIDTH, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH } from '../game/constants'

// The table top: synthetic turf in mown stripes, a shade lighter than the dark bases so the pieces stand out, with
// worn white lines painted on. Outside the rails, black rubber.
const PX = 64 // texture pixels per world unit
export const TOP_HALF_LENGTH = TABLE_HALF_LENGTH + GOAL_DEPTH + 1
export const TOP_HALF_WIDTH = TABLE_HALF_WIDTH + 1

const rand = (() => {
  let s = 4242
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
})()

export function createPitch(): THREE.Mesh {
  const w = 2 * TOP_HALF_LENGTH, h = 2 * TOP_HALF_WIDTH
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(w * PX), height: Math.round(h * PX) })
  const c = cv.getContext('2d')!
  // world (x, z) -> canvas pixels
  const X = (x: number) => (x + TOP_HALF_LENGTH) * PX, Z = (z: number) => (z + TOP_HALF_WIDTH) * PX
  const L = TABLE_HALF_LENGTH, W = TABLE_HALF_WIDTH

  c.fillStyle = '#15171d'
  c.fillRect(0, 0, cv.width, cv.height)
  const stripes = 10
  for (let i = 0; i < stripes; i++) {
    c.fillStyle = i % 2 ? '#2b5d57' : '#37736b'
    c.fillRect(X(-L + (2 * L * i) / stripes), Z(-W), (2 * L * PX) / stripes + 1, 2 * W * PX)
  }
  c.fillStyle = '#2b5d57' // the goal mouths
  for (const s of [-1, 1]) c.fillRect(X(s < 0 ? -L - GOAL_DEPTH : L), Z(-GOAL_HALF_WIDTH), GOAL_DEPTH * PX, 2 * GOAL_HALF_WIDTH * PX)
  // turf grain
  const img = c.getImageData(0, 0, cv.width, cv.height)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 14
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  c.putImageData(img, 0, 0)

  // lines
  const m = 0.35 // touchlines sit a little inside the rails
  c.strokeStyle = 'rgba(225, 232, 230, 0.75)'
  c.fillStyle = c.strokeStyle
  c.lineWidth = 0.08 * PX
  const rect = (x0: number, z0: number, x1: number, z1: number) => c.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0))
  const arc = (x: number, z: number, r: number, a0 = 0, a1 = 2 * Math.PI) => {
    c.beginPath()
    c.arc(X(x), Z(z), r * PX, a0, a1)
    c.stroke()
  }
  const dot = (x: number, z: number) => {
    c.beginPath()
    c.arc(X(x), Z(z), 0.12 * PX, 0, 2 * Math.PI)
    c.fill()
  }
  const lx = L - m, lz = W - m
  rect(-lx, -lz, lx, lz)
  c.beginPath()
  c.moveTo(X(0), Z(-lz))
  c.lineTo(X(0), Z(lz))
  c.stroke()
  arc(0, 0, 2.4)
  dot(0, 0)
  for (const s of [-1, 1]) {
    const edge = s * lx
    rect(Math.min(edge, edge - s * 3.2), -4.2, Math.max(edge, edge - s * 3.2), 4.2) // penalty box
    rect(Math.min(edge, edge - s * 1.2), -GOAL_HALF_WIDTH - 0.6, Math.max(edge, edge - s * 1.2), GOAL_HALF_WIDTH + 0.6) // goal area
    dot(edge - s * 2.3, 0)
    const a = Math.acos(0.9 / 1.7) // the arc outside the box
    arc(edge - s * 2.3, 0, 1.7, s < 0 ? -a : Math.PI - a, s < 0 ? a : Math.PI + a)
    c.save() // corner arcs: only their quarter inside the lines
    c.beginPath()
    c.rect(X(-lx), Z(-lz), X(lx) - X(-lx), Z(lz) - Z(-lz))
    c.clip()
    for (const u of [-1, 1]) arc(edge, u * lz, 0.5)
    c.restore()
  }

  // wear: scuffs where the paint and the turf have worn
  for (let i = 0; i < 900; i++) {
    c.fillStyle = `rgba(${rand() < 0.5 ? '20, 40, 38' : '70, 110, 100'}, ${0.05 + rand() * 0.1})`
    const x = X(-L + rand() * 2 * L), z = Z(-W + rand() * 2 * W), r = 2 + rand() * 10
    c.fillRect(x, z, r, r * (0.3 + rand()))
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
  )
  return top
}
