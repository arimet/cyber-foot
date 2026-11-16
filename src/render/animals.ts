import * as THREE from 'three'
import type { Team } from '../game/types'
import { VoxelGrid, meshVoxels } from './voxel'

// Named colours. `team` and `teamDim` are swapped for the team's colour; GLOW names go into the light-emitting mesh.
const PALETTE = {
  rhino: '#a4adbd',
  rhinoDark: '#6c7484',
  jacket: '#1b1d26',
  jacketHi: '#2c303e',
  pants: '#23262f',
  chrome: '#d3dce8',
  chromeDark: '#8f9aab',
  black: '#0b0c10',
  team: '#ffffff',
  teamDim: '#ffffff',
  led: '#ffe14d',
  ledRed: '#ff2d55',
}
type ColorName = keyof typeof PALETTE
const NAMES = Object.keys(PALETTE) as ColorName[]
const C = (n: ColorName) => NAMES.indexOf(n) + 1
const GLOW = new Set<ColorName>(['team', 'led', 'ledRed'])

export const TEAM_HEX: Record<Team, string> = { cyan: '#2cf6ff', magenta: '#ff3df2' }
const GLOW_BOOST = 1.35 // glow colours pushed above 1 so the bloom pass picks them up
export const VOXEL = 0.05 // world units per voxel

// Rounded box (superellipsoid).
function blob(g: VoxelGrid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, p = 3) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (Math.abs((x - cx) / rx) ** p + Math.abs((y - cy) / ry) ** p + Math.abs((z - cz) / rz) ** p <= 1) g.set(x, y, z, c)
}

function disk(g: VoxelGrid, cx: number, y: number, cz: number, r: number, c: number) {
  for (let z = Math.floor(cz - r); z <= cz + r; z++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) g.set(x, y, z, c)
}

// Recolour the front-most voxel (largest z, at most zMax) of each column in the x/y range: stripes, visors, LEDs.
function front(g: VoxelGrid, x0: number, x1: number, y0: number, y1: number, c: number, zMax = g.sz - 1) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = zMax; z >= 0; z--)
        if (g.get(x, y, z)) {
          g.set(x, y, z, c)
          break
        }
}

// Same, from behind (smallest z).
function back(g: VoxelGrid, x0: number, x1: number, y0: number, y1: number, c: number) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = 0; z < g.sz; z++)
        if (g.get(x, y, z)) {
          g.set(x, y, z, c)
          break
        }
}

// Heavy. Facing +z, toy proportions (big head). Long muzzle carrying a chrome horn with a red LED tip, team visor,
// black jacket with a lit zip and collar, chrome shoulder plates and boots.
function drawRhino(): VoxelGrid {
  const g = new VoxelGrid(27, 32, 24)
  const cx = 13, cz = 9
  for (const s of [-1, 1]) {
    const x = cx + s * 3.4
    blob(g, x, 4.2, cz, 2.6, 2.8, 2.6, C('pants'))
    blob(g, x, 1.4, cz + 0.7, 2.7, 1.5, 3.3, C('chrome'))
    front(g, x - 2, x + 2, 0, 0, C('chromeDark'))
    front(g, x - 1, x + 1, 4, 4, C('team')) // knee strip
    const ax = cx + s * 8.3
    blob(g, ax, 9.8, cz, 2.2, 3.8, 2.4, C('jacket'))
    front(g, ax - 1, ax + 1, 7, 7, C('team')) // cuff
    blob(g, ax, 5.4, cz + 0.6, 2, 1.8, 2.2, C('rhino'))
    blob(g, cx + s * 7, 13.6, cz, 3, 2, 3.6, C('chrome')) // shoulder plate
    front(g, cx + s * 7 - 2, cx + s * 7 + 2, 13, 13, C('teamDim'))
    // ears: small and round, high on the sides
    blob(g, cx + s * 5.2, 25.6, cz - 1.5, 1.3, 1.7, 1, C('rhino'), 2)
    g.set(Math.round(cx + s * 5.2), 26, cz - 1, C('rhinoDark'))
  }
  blob(g, cx, 10.4, cz, 7, 4.8, 4.8, C('jacket'))
  front(g, cx - 7, cx + 7, 6, 6, C('jacketHi')) // belt
  front(g, cx, cx, 7, 14, C('team')) // zip
  front(g, cx - 4, cx - 4, 12, 12, C('led'))
  front(g, cx + 4, cx + 4, 12, 12, C('led'))
  back(g, cx - 3, cx + 3, 8, 13, C('jacketHi'))
  back(g, cx - 2, cx + 2, 10, 11, C('teamDim'))
  disk(g, cx, 15, cz, 4.3, C('team')) // lit collar
  disk(g, cx, 15, cz, 3.2, C('black'))
  // big head, then the muzzle pushing forward and down from it
  blob(g, cx, 21, cz, 6.2, 5.4, 5.6, C('rhino'), 2.5)
  blob(g, cx, 18.2, cz + 5.8, 5, 3.8, 4.6, C('rhino'), 3)
  front(g, cx - 2, cx - 2, 19, 19, C('rhinoDark')) // nostrils
  front(g, cx + 2, cx + 2, 19, 19, C('rhinoDark'))
  front(g, cx - 3, cx + 3, 16, 16, C('rhinoDark')) // mouth
  back(g, cx - 5, cx + 5, 17, 18, C('rhinoDark')) // neck fold
  // visor wrapping the upper head, kept off the muzzle
  front(g, cx - 6, cx + 6, 23, 23, C('team'), cz + 5)
  for (const s of [-1, 1]) for (let z = cz - 1; z <= cz + 4; z++) for (const y of [23]) {
    const x = s < 0 ? 0 : g.sx - 1
    for (let xx = x; s < 0 ? xx < cx : xx > cx; xx -= s) if (g.get(xx, y, z)) { g.set(xx, y, z, C('team')); break }
  }
  // main horn rising from the muzzle tip, red LED point; small horn behind it
  for (let i = 0; i <= 9; i++) disk(g, cx, 21 + i, Math.round(cz + 8.5 + Math.sqrt(i) * 0.9), 2.7 * (1 - i / 10.5), C(i >= 8 ? 'ledRed' : 'chrome'))
  for (let i = 0; i <= 3; i++) disk(g, cx, 23 + i, cz + 4.5, 1.6 * (1 - i / 4.5), C('chromeDark'))
  // cables from the back of the head into the collar
  for (const s of [-1, 1]) for (let y = 15; y <= 20; y++) g.set(cx + s * 2, y, cz - 5 - (y < 18 ? 0 : 1), C('black'))
  return g
}

const DRAW = { rhino: drawRhino }
export type Animal = keyof typeof DRAW

const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 })
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
const cache = new Map<string, { solid: THREE.BufferGeometry; glow: THREE.BufferGeometry }>()

function palette(team: Team, glow: boolean): string[] {
  const teamColor = new THREE.Color(TEAM_HEX[team])
  return ['', ...NAMES.map(n => {
    if (GLOW.has(n) !== glow) return ''
    if (n === 'team') return '#' + teamColor.getHexString()
    if (n === 'teamDim') return '#' + teamColor.clone().multiplyScalar(0.45).getHexString()
    return PALETTE[n]
  })]
}

// Solid voxels and glowing voxels go to two meshes; the glow mesh is unlit and bright enough to bloom.
export function createAnimal(animal: Animal, team: Team): THREE.Group {
  const key = `${animal}-${team}`
  let geo = cache.get(key)
  if (!geo) {
    const src = DRAW[animal]()
    const split = (glow: boolean) => {
      const g = new VoxelGrid(src.sx, src.sy, src.sz)
      for (let i = 0; i < src.data.length; i++) {
        const c = src.data[i]
        if (c && GLOW.has(NAMES[c - 1]) === glow) g.data[i] = c
      }
      return meshVoxels(g, palette(team, glow), { voxelSize: VOXEL, jitter: glow ? 0 : 0.03 })
    }
    const glow = split(true)
    const colors = glow.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < colors.array.length; i++) (colors.array as Float32Array)[i] *= GLOW_BOOST
    geo = { solid: split(false), glow }
    cache.set(key, geo)
  }
  const group = new THREE.Group()
  const solid = new THREE.Mesh(geo.solid, solidMat)
  solid.castShadow = solid.receiveShadow = true
  group.add(solid, new THREE.Mesh(geo.glow, glowMat))
  return group
}
