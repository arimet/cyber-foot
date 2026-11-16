import * as THREE from 'three'
import type { Team } from '../game/types'
import { VoxelGrid, meshVoxels } from './voxel'

// Named colours. `team` and `teamDim` are swapped for the team's colour; GLOW names go into the light-emitting mesh.
const PALETTE = {
  rhino: '#a4adbd',
  rhinoDark: '#6c7484',
  bear: '#8f5d3c',
  bearDark: '#5e3a24',
  tan: '#c49a6c',
  gorilla: '#4c4c5c',
  gorillaFace: '#9a8a80',
  fox: '#ff8a2a',
  foxDark: '#c9601a',
  cream: '#f4efe6',
  cat: '#9ea4b4',
  catStripe: '#6a7080',
  pink: '#e89aa8',
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
// Glow colours pushed above 1 so the bloom pass picks them up; magenta reads darker to it, so it gets more.
const GLOW_BOOST: Record<Team, number> = { cyan: 1, magenta: 1.3 }
export const VOXEL = 0.05 // world units per voxel

// Moving parts. Every voxel belongs to the part being drawn when it was last set.
export const BODY = 0, HEAD = 1, TAIL = 2
const PARTS = [BODY, HEAD, TAIL]
class PartGrid extends VoxelGrid {
  part = BODY
  readonly parts: Uint8Array
  readonly pivots: ([number, number, number] | null)[] = [[0, 0, 0], null, null] // in voxels; null: no such part
  constructor(sx: number, sy: number, sz: number) {
    super(sx, sy, sz)
    this.parts = new Uint8Array(sx * sy * sz)
  }
  override set(x: number, y: number, z: number, c: number): void {
    super.set(x, y, z, c)
    if (x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz) this.parts[(y * this.sz + z) * this.sx + x] = this.part
  }
  // What follows is drawn into `part`, which turns about `pivot`.
  begin(part: number, pivot: [number, number, number]) {
    this.part = part
    this.pivots[part] = pivot
  }
}

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

type Build = 'heavy' | 'light' | 'keeper'
type Skin = ColorName

// The shared cyberpunk outfit: boots, trousers with lit knee strips, arms with lit cuffs, black jacket with a lit zip,
// chest LEDs and a lit collar ring. Returns where the head sits. Facing +z.
function suit(g: VoxelGrid, cx: number, cz: number, build: Build, skin: Skin): number {
  const d = {
    heavy: { leg: [3.4, 4.2, 2.6, 2.8, 2.6], boot: [1.4, 2.7, 1.5, 3.3], arm: [8.3, 9.8, 2.2, 3.8, 2.4], hand: [5.4, 2, 1.8, 2.2], torso: [10.4, 7, 4.8, 4.8], pad: 7, collar: [15, 4.3] },
    keeper: { leg: [3.4, 4, 2.6, 2.6, 2.6], boot: [1.4, 2.7, 1.5, 3.2], arm: [9, 9.4, 2.8, 4.6, 3], hand: [3.6, 2.8, 2.4, 3], torso: [10.6, 7.4, 5, 5], pad: 7.4, collar: [15.4, 4.4] },
    light: { leg: [2.4, 3.4, 1.8, 2.3, 1.9], boot: [1.1, 1.9, 1.2, 2.4], arm: [5.9, 8, 1.5, 3, 1.7], hand: [4.6, 1.4, 1.3, 1.5], torso: [8.6, 4.8, 3.8, 3.6], pad: 0, collar: [12.4, 2.6] },
  }[build]
  for (const s of [-1, 1]) {
    const x = cx + s * d.leg[0]
    blob(g, x, d.leg[1], cz, d.leg[2], d.leg[3], d.leg[4], C('pants'))
    blob(g, x, d.boot[0], cz + 0.7, d.boot[1], d.boot[2], d.boot[3], C('chrome'))
    front(g, Math.round(x - d.boot[1] + 0.7), Math.round(x + d.boot[1] - 0.7), 0, 0, C('chromeDark'))
    front(g, Math.round(x) - 1, Math.round(x) + 1, Math.round(d.leg[1]), Math.round(d.leg[1]), C('team')) // knee strip
    const ax = cx + s * d.arm[0]
    blob(g, ax, d.arm[1], cz, d.arm[2], d.arm[3], d.arm[4], C('jacket'))
    const cuff = Math.round(d.arm[1] - d.arm[3] + 1)
    front(g, Math.round(ax) - 1, Math.round(ax) + 1, cuff, cuff, C('team'))
    blob(g, ax, d.hand[0], cz + 0.6, d.hand[1], d.hand[2], d.hand[3], C(skin))
    if (d.pad) {
      blob(g, cx + s * d.pad, d.torso[0] + 3.2, cz, 3, 2, 3.6, C('chrome')) // shoulder plate
      front(g, Math.round(cx + s * d.pad) - 2, Math.round(cx + s * d.pad) + 2, Math.round(d.torso[0] + 3), Math.round(d.torso[0] + 3), C('teamDim'))
    }
  }
  const [ty, trx, try_, trz] = d.torso
  blob(g, cx, ty, cz, trx, try_, trz, C('jacket'))
  const belt = Math.round(ty - try_ + 1.4)
  front(g, Math.round(cx - trx), Math.round(cx + trx), belt, belt, C('jacketHi'))
  front(g, cx, cx, belt + 1, Math.round(ty + try_ - 1), C('team')) // zip
  const chest = Math.round(ty + try_ * 0.35)
  for (const s of [-1, 1]) front(g, Math.round(cx + s * trx * 0.55), Math.round(cx + s * trx * 0.55), chest, chest, C('led'))
  back(g, Math.round(cx - trx * 0.4), Math.round(cx + trx * 0.4), Math.round(ty - 2), Math.round(ty + 2), C('jacketHi')) // back patch
  back(g, Math.round(cx - trx * 0.25), Math.round(cx + trx * 0.25), Math.round(ty), Math.round(ty), C('teamDim'))
  const [cy, cr] = d.collar
  disk(g, cx, cy, cz, cr, C('team'))
  disk(g, cx, cy, cz, cr - 1.1, C('black'))
  return cy
}

// Light the first solid voxel met from each side, at the given rows: wrap-around visor bands.
function wrap(g: VoxelGrid, cx: number, rows: number[], z0: number, z1: number, c: number) {
  for (const s of [-1, 1]) for (let z = z0; z <= z1; z++) for (const y of rows)
    for (let x = s < 0 ? 0 : g.sx - 1; s < 0 ? x < cx : x > cx; x -= s) if (g.get(x, y, z)) { g.set(x, y, z, c); break }
}

// Heavy. Big head, square muzzle carrying a chrome horn with a red LED tip, team visor, chrome shoulder plates.
function drawRhino(): PartGrid {
  const g = new PartGrid(27, 32, 24)
  const cx = 13, cz = 9
  const neck = suit(g, cx, cz, 'heavy', 'rhino')
  g.begin(HEAD, [cx, neck, cz])
  for (const s of [-1, 1]) {
    blob(g, cx + s * 5.2, 25.6, cz - 1.5, 1.3, 1.7, 1, C('rhino'), 2) // small round ears
    g.set(Math.round(cx + s * 5.2), 26, cz - 1, C('rhinoDark'))
  }
  blob(g, cx, 21, cz, 6.2, 5.4, 5.6, C('rhino'), 2.5)
  blob(g, cx, 18.2, cz + 5.8, 5, 3.8, 4.6, C('rhino'), 3)
  front(g, cx - 2, cx - 2, 19, 19, C('rhinoDark')) // nostrils
  front(g, cx + 2, cx + 2, 19, 19, C('rhinoDark'))
  front(g, cx - 3, cx + 3, 16, 16, C('rhinoDark')) // mouth
  back(g, cx - 5, cx + 5, 17, 18, C('rhinoDark')) // neck fold
  front(g, cx - 6, cx + 6, 23, 23, C('team'), cz + 5) // visor, kept off the muzzle
  wrap(g, cx, [23], cz - 1, cz + 4, C('team'))
  for (let i = 0; i <= 9; i++) disk(g, cx, 21 + i, Math.round(cz + 8.5 + Math.sqrt(i) * 0.9), 2.7 * (1 - i / 10.5), C(i >= 8 ? 'ledRed' : 'chrome'))
  for (let i = 0; i <= 3; i++) disk(g, cx, 23 + i, cz + 4.5, 1.6 * (1 - i / 4.5), C('chromeDark'))
  g.part = BODY
  for (const s of [-1, 1]) for (let y = 15; y <= 20; y++) g.set(cx + s * 2, y, cz - 5 - (y < 18 ? 0 : 1), C('black')) // cables
  return g
}

// Heavy. Punk bear: round ears, short tan muzzle, a lit mohawk, one team cyber-eye and a red monocle.
function drawBear(): PartGrid {
  const g = new PartGrid(27, 32, 22)
  const cx = 13, cz = 9
  const neck = suit(g, cx, cz, 'heavy', 'bear')
  g.begin(HEAD, [cx, neck, cz])
  blob(g, cx, 20.6, cz, 6.2, 5.4, 5.6, C('bear'), 2.4)
  for (const s of [-1, 1]) {
    blob(g, cx + s * 5, 25.4, cz - 0.5, 2, 2, 1.3, C('bear'), 2)
    front(g, cx + s * 5 - 1, cx + s * 5 + 1, 25, 26, C('bearDark'))
  }
  blob(g, cx, 18.6, cz + 5.2, 3.2, 2.4, 2.4, C('tan'), 2.5)
  front(g, cx - 1, cx + 1, 20, 20, C('black')) // nose
  front(g, cx - 1, cx + 1, 17, 17, C('bearDark')) // mouth
  front(g, cx - 4, cx - 2, 22, 22, C('team'), cz + 5) // cyber-eye
  front(g, cx + 2, cx + 4, 21, 23, C('chrome'), cz + 5) // monocle rim
  front(g, cx + 3, cx + 3, 22, 22, C('ledRed'), cz + 5)
  for (let z = cz - 4; z <= cz + 3; z += 2) for (let h = 0; h <= 2; h++) g.set(cx, 25 + h, z, C(h === 2 ? 'team' : 'teamDim')) // mohawk spikes
  g.part = BODY
  for (const s of [-1, 1]) for (let y = 15; y <= 19; y++) g.set(cx + s * 3, y, cz - 5, C('black')) // cables
  return g
}

// Keeper. Gorilla: heavy brow, pale face, round team goggles, a chrome headset with a mic, huge padded gloves.
function drawGorilla(): PartGrid {
  const g = new PartGrid(29, 32, 22)
  const cx = 14, cz = 9
  const neck = suit(g, cx, cz, 'keeper', 'gorilla')
  for (const s of [-1, 1]) {
    blob(g, cx + s * 9, 3.6, cz + 0.6, 3.1, 2.6, 3.2, C('chrome')) // keeper gloves
    front(g, cx + s * 9 - 2, cx + s * 9 + 2, 3, 4, C('team'))
  }
  g.begin(HEAD, [cx, neck, cz])
  blob(g, cx, 21, cz - 0.5, 5.6, 5.2, 5.2, C('gorilla'), 2.4)
  blob(g, cx, 19.4, cz + 4, 4.4, 3.6, 2.8, C('gorillaFace'), 2.4) // face
  blob(g, cx, 17.8, cz + 5.4, 3.4, 2, 1.8, C('gorillaFace'), 2.4) // muzzle
  front(g, cx - 1, cx - 1, 18, 18, C('black')) // nostrils
  front(g, cx + 1, cx + 1, 18, 18, C('black'))
  front(g, cx - 2, cx + 2, 16, 16, C('black')) // mouth
  blob(g, cx, 22.4, cz + 4.4, 5.2, 1.2, 1.8, C('gorilla'), 3) // brow ridge
  for (const s of [-1, 1]) {
    front(g, cx + s * 2.6 - 1, cx + s * 2.6 + 1, 22, 23, C('chrome')) // goggle rims on the brow
    front(g, Math.round(cx + s * 2.6), Math.round(cx + s * 2.6), 22, 22, C('team'))
    blob(g, cx + s * 5.8, 20.5, cz - 0.5, 1, 1.6, 1.6, C('chrome'), 2) // headset cups
  }
  for (let x = cx - 6; x <= cx + 6; x++) g.set(x, Math.round(26.4 - ((x - cx) / 6) ** 2 * 2.4), cz - 0.5, C('chromeDark')) // headband
  for (let i = 0; i <= 3; i++) g.set(cx - 6 + i, 19 - Math.floor(i / 2), cz + 1 + i, C('chromeDark')) // mic boom from the left cup
  g.set(cx - 2, 17, cz + 5, C('ledRed'))
  return g
}

// Light. Fox: tall black-tipped ears (one cybernetic), pointed snout, team visor, bushy tail with lit rings.
function drawFox(): PartGrid {
  const g = new PartGrid(19, 26, 22)
  const cx = 9, cz = 8
  const neck = suit(g, cx, cz, 'light', 'fox')
  g.begin(HEAD, [cx, neck, cz])
  blob(g, cx, 16.4, cz, 4.3, 3.8, 4, C('fox'), 2.4)
  blob(g, cx, 14.9, cz + 4.6, 1.9, 1.4, 3.1, C('fox'), 2.4) // long snout
  front(g, cx - 3, cx + 3, 13, 14, C('cream')) // cheeks and chin
  front(g, cx, cx, 15, 15, C('black')) // nose tip
  // tall triangular ears, black tips; the right one is cybernetic (chrome with a lit band)
  for (const s of [-1, 1]) for (let i = 0; i <= 6; i++) {
    const w = 1.9 * (1 - i / 7)
    const c = i >= 5 ? 'black' : s > 0 ? (i === 2 ? 'team' : 'chrome') : 'fox'
    for (let x = Math.round(cx + s * 2.8 - w); x <= Math.round(cx + s * 2.8 + w); x++)
      for (let z = cz - 1; z <= cz; z++) g.set(x, 19 + i, z, C(c as ColorName))
  }
  front(g, cx - 4, cx + 4, 17, 17, C('team'), cz + 3) // visor
  wrap(g, cx, [17], cz - 1, cz + 2, C('team'))
  g.begin(TAIL, [cx + 1.5, 3, cz - 4])
  for (let i = 0; i <= 10; i++) { // bushy tail sweeping up behind, white tip, two lit rings
    const r = 1.6 + Math.sin((i / 10) * Math.PI) * 1.3
    const c = i >= 9 ? 'cream' : i === 3 || i === 6 ? 'team' : 'fox'
    blob(g, cx + 1.5, 3 + i * 1.05, cz - 4.5 - Math.sin((i / 10) * Math.PI * 0.9) * 2.5, r, 1, r, C(c as ColorName), 2)
  }
  return g
}

// Light. Tabby cat: small pink-lined ears, round face with whiskers, yellow slit eyes under lit cat-ear headphones,
// thin tail curling up with a lit tip.
function drawCat(): PartGrid {
  const g = new PartGrid(19, 26, 20)
  const cx = 9, cz = 8
  const neck = suit(g, cx, cz, 'light', 'cat')
  g.begin(HEAD, [cx, neck, cz])
  blob(g, cx, 16.4, cz, 4.6, 3.9, 4.2, C('cat'), 2.2)
  for (const y of [18, 19]) front(g, cx - 3, cx + 3, y, y, C(y === 19 ? 'catStripe' : 'cat'), cz + 4)
  back(g, cx - 3, cx + 3, 15, 19, C('catStripe'))
  blob(g, cx, 14.8, cz + 3.6, 2.2, 1.4, 1.4, C('cream'), 2)
  front(g, cx, cx, 15, 15, C('pink')) // nose
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 2; i++) blob(g, cx + s * (3 - i * 0.2), 20 + i, cz - 0.5, 1.4 - i * 0.4, 0.6, 1 - i * 0.25, C(i === 0 ? 'cat' : 'pink'), 2)
    blob(g, cx + s * 4.4, 17, cz, 0.9, 1.4, 1.4, C('team'), 2) // headphone cups
    g.set(cx + s * 2, 17, cz + 4, C('led')) // slit eyes
    g.set(cx + s * 2, 16, cz + 4, C('led'))
    for (let i = 0; i <= 2; i++) g.set(cx + s * (3 + i), 14 + (i === 2 ? 1 : 0), cz + 4 - Math.floor(i / 2), C('cream')) // whiskers
  }
  for (let x = cx - 4; x <= cx + 4; x++) g.set(x, Math.round(20.6 - ((x - cx) / 4.4) ** 2 * 1.4), cz, C('teamDim')) // headband
  g.begin(TAIL, [cx + 1.5, 3, cz - 4])
  for (let i = 0; i <= 9; i++) { // tail
    const c = i % 3 === 0 ? 'catStripe' : 'cat'
    blob(g, cx + 1.5, 3 + i, cz - 4 - Math.sin((i / 9) * Math.PI) * 2, 0.9, 0.7, 0.9, C(c as ColorName), 2)
    if (i === 9) g.set(Math.round(cx + 1.5), 13, Math.round(cz - 4), C('team')) // lit tip
  }
  return g
}

const DRAW = { rhino: drawRhino, bear: drawBear, gorilla: drawGorilla, fox: drawFox, cat: drawCat }
export type Animal = keyof typeof DRAW

const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 })
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
type PartGeo = { solid: THREE.BufferGeometry; glow: THREE.BufferGeometry; pivot: THREE.Vector3 } | null
const cache = new Map<string, PartGeo[]>()

function palette(team: Team, glow: boolean): string[] {
  const teamColor = new THREE.Color(TEAM_HEX[team])
  return ['', ...NAMES.map(n => {
    if (GLOW.has(n) !== glow) return ''
    if (n === 'team') return '#' + teamColor.getHexString()
    if (n === 'teamDim') return '#' + teamColor.clone().multiplyScalar(0.45).getHexString()
    return PALETTE[n]
  })]
}

function buildParts(animal: Animal, team: Team): PartGeo[] {
  const src = DRAW[animal]()
  return PARTS.map(part => {
    const pv = src.pivots[part]
    if (!pv) return null
    // Solid voxels and glowing voxels go to two meshes; the glow mesh is unlit and bright enough to bloom.
    const split = (glow: boolean) => {
      const g = new VoxelGrid(src.sx, src.sy, src.sz)
      for (let i = 0; i < src.data.length; i++) {
        const c = src.data[i]
        if (c && src.parts[i] === part && GLOW.has(NAMES[c - 1]) === glow) g.data[i] = c
      }
      return meshVoxels(g, palette(team, glow), { voxelSize: VOXEL, jitter: glow ? 0 : 0.03 })
    }
    const glow = split(true)
    const colors = glow.getAttribute('color') as THREE.BufferAttribute
    for (let i = 0; i < colors.array.length; i++) (colors.array as Float32Array)[i] *= GLOW_BOOST[team]
    const pivot = new THREE.Vector3((pv[0] + 0.5 - src.sx / 2) * VOXEL, pv[1] * VOXEL, (pv[2] + 0.5 - src.sz / 2) * VOXEL)
    return { solid: split(false), glow, pivot }
  })
}

// The figure, standing at the origin and facing +z. `body` turns about the feet and carries `head` and `tail`,
// each turning about its own pivot (neck, root of the tail). Animals not split yet have no head or tail.
export type Rig = { root: THREE.Group; body: THREE.Group; head: THREE.Group | null; tail: THREE.Group | null }

export function createAnimal(animal: Animal, team: Team): Rig {
  const key = `${animal}-${team}`
  let parts = cache.get(key)
  if (!parts) cache.set(key, parts = buildParts(animal, team))
  const root = new THREE.Group(), body = new THREE.Group()
  root.add(body)
  const groups = parts.map((geo, part): THREE.Group | null => {
    if (!geo) return null
    const holder = part === BODY ? body : new THREE.Group()
    const solid = new THREE.Mesh(geo.solid, solidMat), glow = new THREE.Mesh(geo.glow, glowMat)
    solid.castShadow = solid.receiveShadow = true
    if (part !== BODY) {
      holder.position.copy(geo.pivot)
      solid.position.copy(geo.pivot).negate()
      glow.position.copy(geo.pivot).negate()
      body.add(holder)
    }
    holder.add(solid, glow)
    return holder
  })
  return { root, body, head: groups[HEAD], tail: groups[TAIL] }
}
