import * as THREE from 'three'
import { TOP_HALF_LENGTH, TOP_HALF_WIDTH } from './pitch'
import { FLOOR_Y, createRain } from './rain'

// A rooftop at night, in the rain. The camera looks down at about 45°, so beyond the parapet it sees the city from
// above: a band of facades, signs and roofs below the roof's own level, fading into the haze.

const PARAPET_Z = -11 // just behind the table: the city starts right beyond it
const ROOF_HALF_X = 32
export const HAZE = 0x1b1030

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
  draw(canvas.getContext('2d')!)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Deterministic pseudo-random, so the city is the same on every load.
const rand = (() => {
  let s = 1337
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
})()

// 16 x 32 windows, a few of them lit
function windows(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 512, c => {
    c.fillStyle = '#0d0b17'
    c.fillRect(0, 0, 256, 512)
    for (let j = 0; j < 32; j++) for (let i = 0; i < 16; i++) {
      const r = rand()
      c.fillStyle = r < 0.1 ? '#ffd27a' : r < 0.14 ? '#7fe9ff' : r < 0.17 ? '#ff7ae8' : r < 0.22 ? '#3a3550' : '#15121f'
      c.fillRect(i * 16 + 3, j * 16 + 4, 10, 9)
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function sign(text: string, color: string, vertical = false): THREE.CanvasTexture {
  const w = vertical ? 160 : 512, h = vertical ? 512 : 160
  return canvasTexture(w, h, c => {
    c.font = '700 104px ui-monospace, Menlo, monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    const draw = (lw: number, stroke: string, blur: number) => {
      c.lineWidth = lw
      c.strokeStyle = stroke
      c.shadowColor = color
      c.shadowBlur = blur
      if (!vertical) c.strokeText(text, 256, 84)
      else [...text].forEach((ch, i) => c.strokeText(ch, 80, 70 + i * (380 / Math.max(1, text.length - 1))))
    }
    draw(10, color, 24)
    draw(3, '#ffffff', 0)
  })
}

// soft dark pool with smeared reflections of the signs
function puddleTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, c => {
    const g = c.createRadialGradient(128, 128, 20, 128, 128, 128)
    g.addColorStop(0, 'rgba(10, 12, 24, 0.9)')
    g.addColorStop(0.75, 'rgba(10, 12, 24, 0.7)')
    g.addColorStop(1, 'rgba(10, 12, 24, 0)')
    c.fillStyle = g
    c.fillRect(0, 0, 256, 256)
    c.globalCompositeOperation = 'lighter'
    for (const [x, col] of [[70, '#2cf6ff'], [150, '#ff3df2'], [200, '#ffd27a']] as const) {
      const s = c.createLinearGradient(x - 14, 0, x + 14, 0)
      s.addColorStop(0, 'rgba(0,0,0,0)')
      s.addColorStop(0.5, col)
      s.addColorStop(1, 'rgba(0,0,0,0)')
      c.globalAlpha = 0.6
      c.fillStyle = s
      c.beginPath()
      c.ellipse(x, 128, 14, 90, 0, 0, 2 * Math.PI)
      c.fill()
    }
  })
}

function concrete(): THREE.CanvasTexture {
  const tex = canvasTexture(512, 512, c => {
    c.fillStyle = '#26232e'
    c.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 5000; i++) {
      c.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '120,110,140'}, ${rand() * 0.12})`
      c.fillRect(rand() * 512, rand() * 512, 1 + rand() * 4, 1 + rand() * 4)
    }
    c.strokeStyle = 'rgba(0,0,0,0.5)' // slab joints
    c.lineWidth = 3
    for (let i = 0; i <= 512; i += 128) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 512); c.stroke()
      c.beginPath(); c.moveTo(0, i); c.lineTo(512, i); c.stroke()
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(16, 10)
  return tex
}

export function createRoom(): { group: THREE.Group; update(t: number, dt: number): void } {
  const group = new THREE.Group()
  const mat = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
  const glow = (color: number, power = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), toneMapped: false })
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
    mesh.position.set(x, y, z)
    parent.add(mesh)
    return mesh
  }

  // the roof: wet concrete, puddles, a parapet all round
  const roofDepth = 45
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOF_HALF_X, roofDepth).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: concrete(), roughness: 0.55, metalness: 0.1 }))
  floor.position.set(0, FLOOR_Y, PARAPET_Z + roofDepth / 2)
  group.add(floor)
  const pud = new THREE.MeshBasicMaterial({ map: puddleTexture(), transparent: true, depthWrite: false })
  for (const [x, z, w, d] of [[-18, -8, 6, 3], [17, -8.5, 7, 3], [-14, 11, 9, 5], [12, 13, 11, 4.5], [-1, 15, 8, 3.5], [-26, 2, 5, 6], [25, 3, 6, 7]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), pud)
    p.position.set(x, FLOOR_Y + 0.01, z)
    group.add(p)
  }
  const wall = mat(0x2a2633, 0.8)
  const capMat = mat(0x3b3646, 0.4)
  box(2 * ROOF_HALF_X + 1, 1.3, 0.8, wall, 0, FLOOR_Y + 0.65, PARAPET_Z)
  box(2 * ROOF_HALF_X + 1.2, 0.15, 1, capMat, 0, FLOOR_Y + 1.35, PARAPET_Z)
  for (const s of [-1, 1]) box(0.8, 1.3, roofDepth, wall, s * ROOF_HALF_X, FLOOR_Y + 0.65, PARAPET_Z + roofDepth / 2)

  // the table's stand
  const L = TOP_HALF_LENGTH, W = TOP_HALF_WIDTH
  const steel = mat(0x2b2f3a, 0.35, 0.4)
  box(2 * L, 0.6, 2 * W, steel, 0, -0.5, 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.8, -FLOOR_Y - 0.8, 0.8, steel, sx * (L - 2), (FLOOR_Y - 0.8) / 2, sz * (W - 1.5))

  // floodlights on poles behind the table, aimed at the pitch
  const lamps: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const x = s * (L + 2.5), z = -W - 2
    box(0.3, 8, 0.3, steel, x, FLOOR_Y + 4, z)
    const head = new THREE.Group()
    head.position.set(x, FLOOR_Y + 8, z)
    head.lookAt(s * 3, 0, 1)
    box(2, 1.1, 0.5, mat(0x1a1c22, 0.5), 0, 0, 0, head)
    box(1.7, 0.85, 0.05, glow(0xfff4e0, 1.6), 0, 0, 0.27, head)
    group.add(head)
    const spot = new THREE.SpotLight(0xfff1dc, 1.1, 0, 0.9, 0.7, 0) // no falloff: an even wash over the pitch
    spot.position.copy(head.position)
    spot.target.position.set(0, 0, 0)
    group.add(spot, spot.target)
    lamps.push(head)
  }

  // roof clutter: air-con units with turning fans, a stair housing, an antenna with a red light, cables
  const fans: THREE.Mesh[] = []
  for (const [x, z] of [[-19, -4], [-23, -1], [21, 7]]) {
    box(3, 2, 2.4, mat(0x4a4d58, 0.5, 0.3), x, FLOOR_Y + 1, z)
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.08, 6), mat(0x15161c, 0.6))
    fan.position.set(x, FLOOR_Y + 2.05, z)
    group.add(fan)
    fans.push(fan)
  }
  box(6, 4.5, 4.5, mat(0x332f3c, 0.8), 23, FLOOR_Y + 2.25, -7)
  box(1.6, 2.6, 0.1, glow(0xffb347, 1.2), 22, FLOOR_Y + 1.3, -4.7) // a lit doorway
  box(1, 0.35, 0.05, glow(0x3dff7a, 2), 22, FLOOR_Y + 2.9, -4.7) // exit light
  const mast = mat(0x3a3d48, 0.5, 0.4)
  box(0.2, 12, 0.2, mast, -27, FLOOR_Y + 6, -8)
  for (const y of [3, 6, 9]) box(2.5 - y * 0.15, 0.1, 0.1, mast, -27, FLOOR_Y + y, -8)
  const beacon = box(0.35, 0.35, 0.35, glow(0xff2d2d, 3), -27, FLOOR_Y + 12.2, -8)
  const bulb = new THREE.SphereGeometry(0.13, 8, 6), bulbMat = glow(0xffb85c, 2.2)
  const cable = (a: THREE.Vector3, b: THREE.Vector3, sag: number, bulbs = false) => {
    const pts = Array.from({ length: 17 }, (_, i) => {
      const k = i / 16
      return a.clone().lerp(b, k).setY(a.y + (b.y - a.y) * k - sag * 4 * k * (1 - k))
    })
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x05050a })))
    if (bulbs) for (const p of pts.slice(1, -1)) { // a string of warm bulbs hanging off it
      const b = new THREE.Mesh(bulb, bulbMat)
      b.position.copy(p).setY(p.y - 0.15)
      group.add(b)
    }
  }
  cable(new THREE.Vector3(-27, FLOOR_Y + 10, -8), lamps[0].position.clone(), 2, true)
  cable(new THREE.Vector3(-27, FLOOR_Y + 9, -8), new THREE.Vector3(-ROOF_HALF_X - 8, FLOOR_Y - 4, -24), 2)
  cable(lamps[1].position.clone(), new THREE.Vector3(23, FLOOR_Y + 4.5, -7), 1.5, true)
  cable(lamps[0].position.clone(), lamps[1].position.clone(), 2.5, true)

  // the city beyond the parapet
  const winTex = windows()
  const tower = (x: number, z: number, w: number, d: number, top: number) => {
    const h = top + 120
    const tex = winTex.clone()
    tex.repeat.set(w / 11, h / 22)
    tex.offset.set(rand(), rand())
    tex.needsUpdate = true
    const m = box(w, h, d, new THREE.MeshBasicMaterial({ map: tex, color: 0x9a94b0 }), x, top - h / 2, z)
    box(w + 0.4, 0.3, d + 0.4, new THREE.MeshBasicMaterial({ color: 0x0a0812 }), x, top, z) // roof edge
    return m
  }
  for (const row of [{ z: -24, top: [-22, -9] }, { z: -40, top: [-20, 12] }, { z: -62, top: [-15, 30] }]) {
    for (let x = -110; x < 110;) {
      const w = 7 + rand() * 9
      tower(x + w / 2, row.z - rand() * 6, w, 8 + rand() * 6, row.top[0] + rand() * (row.top[1] - row.top[0]))
      x += w + 1 + rand() * 4
    }
  }
  // the landmark towers carry the signs
  tower(-23, -25, 12, 10, 30)
  tower(27, -26, 14, 10, 30)

  const signs: { mat: THREE.MeshBasicMaterial; power: number }[] = []
  const place = (tex: THREE.CanvasTexture, x: number, y: number, z: number, w: number, h: number, power = 1.6) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color().setScalar(power) })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
    mesh.position.set(x, y, z)
    group.add(mesh)
    signs.push({ mat: m, power })
    return mesh
  }
  place(sign('ARCADE', '#2cf6ff', true), -18.5, -6, -19.8, 2.2, 7)
  place(sign('24H', '#ffe14d'), -24, -4.5, -19.8, 4.5, 1.4)
  place(sign('NOODLES', '#ff3df2'), 29, -13.5, -20.8, 8, 2.5)
  place(sign('GOAL', '#ff2d55'), -24, -8, -19.8, 5, 1.6)
  // the holographic billboard: scrolling scanlines over a title, now and then a glitch
  const holoTex = canvasTexture(512, 256, c => {
    const g = c.createLinearGradient(0, 0, 512, 0)
    g.addColorStop(0, 'rgba(44,246,255,0.35)')
    g.addColorStop(1, 'rgba(255,61,242,0.35)')
    c.fillStyle = g
    c.fillRect(0, 0, 512, 256)
    c.font = '700 70px ui-monospace, Menlo, monospace'
    c.textAlign = 'center'
    c.fillStyle = '#ffffff'
    c.fillText('CYBER-FOOT', 256, 120)
    c.font = '700 30px ui-monospace, Menlo, monospace'
    c.fillText('CYAN  vs  MAGENTA', 256, 180)
    for (let y = 0; y < 256; y += 4) {
      c.fillStyle = 'rgba(0,0,0,0.35)'
      c.fillRect(0, y, 512, 2)
    }
  })
  holoTex.wrapS = THREE.RepeatWrapping
  const holo = place(holoTex, 22, -4, -16.5, 9, 4.5, 1.1)
  box(0.25, 10, 0.25, mat(0x1c1a26, 0.5), 22, -11.25, -16.7) // its mast, from a lower roof
  ;(holo.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending

  // a flying car crossing now and then
  const car = new THREE.Group()
  box(2.4, 0.6, 1.1, mat(0x1c1a26, 0.4, 0.5), 0, 0, 0, car)
  for (const u of [-0.35, 0.35]) {
    box(0.1, 0.15, 0.25, glow(0xffffff, 4), 1.25, 0, u, car)
    box(0.1, 0.12, 0.3, glow(0xff2d2d, 3), -1.25, 0, u, car)
  }
  box(1.6, 0.05, 0.9, glow(0x2cf6ff, 1.5), 0, -0.33, 0, car)
  group.add(car)

  const rain = createRain()
  group.add(rain.group)

  return {
    group,
    update(t: number, dt: number) {
      rain.update(dt)
      for (const f of fans) f.rotation.y += dt * 9
      beacon.visible = t % 1.6 < 0.25
      holoTex.offset.y = (t * 0.15) % 1
      holoTex.offset.x = Math.sin(t * 0.9) > 0.97 ? (Math.sin(t * 61) * 0.02) : 0
      const flicker = Math.sin(t * 0.7) > 0.93 && Math.sin(t * 47) > 0 // the GOAL sign stutters
      signs[3].mat.color.setScalar(flicker ? 0.2 : signs[3].power)
      const k = (t % 18) / 18 // the car: across in 9 s, then 9 s away
      car.position.set(-120 + k * 480, -4 + Math.sin(t * 0.8) * 0.4, -15)
    },
  }
}
