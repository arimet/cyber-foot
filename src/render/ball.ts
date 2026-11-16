import * as THREE from 'three'
import { BALL_RADIUS } from '../game/constants'

// A classic football: 12 pentagons and 20 hexagons. On a sphere they are the regions nearest to the icosahedron's
// 12 corners and to the centres of its 20 faces; seams run where two regions meet.
const PHI = (1 + Math.sqrt(5)) / 2
const norm = (v: number[]) => { const l = Math.hypot(...v); return v.map(c => c / l) }
const CORNERS = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]].map(norm)
const FACES: number[][] = []
for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
  const near = (i: number, j: number) => CORNERS[i].reduce((s, v, k) => s + v * CORNERS[j][k], 0) > 0.4 // neighbours
  if (near(a, b) && near(b, c) && near(a, c)) FACES.push(norm([0, 1, 2].map(k => CORNERS[a][k] + CORNERS[b][k] + CORNERS[c][k])))
}
const CENTRES = [...CORNERS.map(v => ({ v, pent: true })), ...FACES.map(v => ({ v, pent: false }))]
const SEAM = 0.012 // how close the two nearest centres must be, in cosine, to sit on a seam

export function panelAt(x: number, y: number, z: number): 'pentagon' | 'hexagon' | 'seam' {
  const [px, py, pz] = norm([x, y, z])
  let best = -2, second = -2, pent = false
  for (const c of CENTRES) {
    const d = px * c.v[0] + py * c.v[1] + pz * c.v[2]
    if (d > best) [second, best, pent] = [best, d, c.pent]
    else if (d > second) second = d
  }
  return best - second < SEAM ? 'seam' : pent ? 'pentagon' : 'hexagon'
}

// Pearl-white hexagons, gunmetal pentagons with a faint lit core, dark seams. Painted once into an
// equirectangular texture, which is how SphereGeometry lays out its UVs.
function paint(w: number, h: number) {
  const colour = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const glow = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const c = colour.getContext('2d')!, g = glow.getContext('2d')!
  const ci = c.createImageData(w, h), gi = g.createImageData(w, h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const phi = ((i + 0.5) / w) * 2 * Math.PI, theta = ((j + 0.5) / h) * Math.PI
    const x = -Math.cos(phi) * Math.sin(theta), y = Math.cos(theta), z = Math.sin(phi) * Math.sin(theta)
    const p = panelAt(x, y, z)
    const rgb = p === 'seam' ? [24, 26, 38] : p === 'pentagon' ? [34, 40, 60] : [236, 240, 250]
    let lit = 0
    if (p === 'pentagon') { // a small lit dot in the middle of each pentagon
      const near = Math.max(...CORNERS.map(v => v[0] * x + v[1] * y + v[2] * z))
      lit = near > 0.995 ? 1 : 0
    }
    const o = (j * w + i) * 4
    ci.data.set([...rgb, 255], o)
    gi.data.set(lit ? [180, 150, 255, 255] : [0, 0, 0, 255], o)
  }
  c.putImageData(ci, 0, 0)
  g.putImageData(gi, 0, 0)
  const tex = (cv: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(cv)
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  return { map: tex(colour, true), emissiveMap: tex(glow, true) }
}

export function createBall(): THREE.Mesh {
  const { map, emissiveMap } = paint(1024, 512)
  return new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 48, 32),
    new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.1 }),
  )
}
