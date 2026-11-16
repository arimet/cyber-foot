import * as THREE from 'three'
import { GOAL_DEPTH, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH } from '../game/constants'

// The night room around the table: a rainy window onto a city, neon signs, the table's stand. Kept dark and behind the
// table so it never competes with the pitch; the bloom pass makes the signs glow.

const FLOOR_Y = -6
// The camera looks down at 45°: of the back wall it only sees a band just above the table (about y -4.5 to 3.5 at
// z = -14 in the wide view), so the window and the signs live in that band.
const BACK_Z = -14
const WINDOW = { w: 24, h: 9, y: -0.5 }

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// Deterministic pseudo-random, so the skyline is the same on every load.
const rand = (() => {
  let s = 1337
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
})()

function city(): THREE.CanvasTexture {
  return canvasTexture(1024, 384, c => {
    const sky = c.createLinearGradient(0, 0, 0, 384)
    sky.addColorStop(0, '#0a0618')
    sky.addColorStop(1, '#2a0f3a')
    c.fillStyle = sky
    c.fillRect(0, 0, 1024, 384)
    for (const layer of [{ shade: '#120c22', hMax: 220, lit: 0.05 }, { shade: '#0a0814', hMax: 300, lit: 0.08 }]) {
      for (let x = 0; x < 1024;) {
        const w = 30 + rand() * 70, h = 80 + rand() * layer.hMax
        c.fillStyle = layer.shade
        c.fillRect(x, 384 - h, w, h)
        for (let wy = 384 - h + 8; wy < 380; wy += 10)
          for (let wx = x + 5; wx < x + w - 5; wx += 8)
            if (rand() < layer.lit) {
              c.fillStyle = ['#ffd27a', '#2cf6ff', '#ff3df2', '#9ad0ff'][Math.floor(rand() * 4)]
              c.fillRect(wx, wy, 3, 4)
            }
        x += w + rand() * 6
      }
    }
  })
}

function rain(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 256, c => {
    c.clearRect(0, 0, 256, 256)
    for (let i = 0; i < 140; i++) {
      const x = rand() * 256, y = rand() * 256, len = 10 + rand() * 26
      c.strokeStyle = `rgba(180, 210, 255, ${0.08 + rand() * 0.18})`
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x - 2, y + len)
      c.stroke()
    }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 2)
  return tex
}

function sign(text: string, color: string): THREE.CanvasTexture {
  return canvasTexture(512, 160, c => {
    c.clearRect(0, 0, 512, 160)
    c.font = '700 104px ui-monospace, Menlo, monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.lineWidth = 10
    c.strokeStyle = color
    c.shadowColor = color
    c.shadowBlur = 24
    c.strokeText(text, 256, 84)
    c.lineWidth = 3
    c.strokeStyle = '#ffffff'
    c.shadowBlur = 0
    c.strokeText(text, 256, 84)
  })
}

export function createRoom(): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group()
  const dark = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set(x, y, z)
    group.add(m)
    return m
  }

  // floor, back wall around the window, side walls
  box(120, 0.2, 80, dark(0x07070d), 0, FLOOR_Y, -4)
  const wall = dark(0x0b0a14)
  const wy = WINDOW.y, ww = WINDOW.w, wh = WINDOW.h
  box(120, 40, 0.5, wall, 0, wy + wh / 2 + 20, BACK_Z) // above the window
  box(120, 20, 0.5, wall, 0, wy - wh / 2 - 10, BACK_Z) // below
  for (const s of [-1, 1]) {
    box((120 - ww) / 2, wh, 0.5, wall, s * (ww / 2 + (120 - ww) / 4), wy, BACK_Z)
    box(0.5, 50, 80, wall, s * 40, 15, -4)
  }

  // window: city, rain sliding over it, frame bars
  const view = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: city(), color: 0x8a8a9a }))
  view.position.set(0, wy, BACK_Z - 0.3)
  const rainTex = rain()
  const drops = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: rainTex, transparent: true, depthWrite: false }))
  drops.position.set(0, wy, BACK_Z + 0.05)
  group.add(view, drops)
  const frame = dark(0x05050a)
  for (const x of [-ww / 4, 0, ww / 4]) box(0.4, wh, 0.4, frame, x, wy, BACK_Z + 0.2)
  box(ww, 0.4, 0.4, frame, 0, wy, BACK_Z + 0.2)

  // neon signs; one of them flickers
  const signs: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = []
  const place = (text: string, color: string, x: number, y: number, z: number, w: number, rotY = 0) => {
    const base = new THREE.Color(1.6, 1.6, 1.6)
    const mat = new THREE.MeshBasicMaterial({ map: sign(text, color), transparent: true, depthWrite: false, toneMapped: false, color: base.clone() })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 160 / 512), mat)
    m.position.set(x, y, z)
    m.rotation.y = rotY
    group.add(m)
    signs.push({ mat, base })
  }
  place('ARCADE', '#2cf6ff', -ww / 2 - 4, wy - 0.8, BACK_Z + 0.4, 7)
  place('NOODLES', '#ff3df2', ww / 2 + 4, wy - 0.8, BACK_Z + 0.4, 7)
  place('24H', '#ffe14d', -ww / 2 - 4, wy + 1.6, BACK_Z + 0.4, 3.5)
  place('GOAL', '#ff2d55', ww / 2 + 4, wy + 1.6, BACK_Z + 0.4, 4)

  // the table's stand
  const L = TABLE_HALF_LENGTH + GOAL_DEPTH + 1, W = TABLE_HALF_WIDTH + 1
  box(2 * L, 0.6, 2 * W, dark(0x10141f), 0, -0.5, 0)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(1, -FLOOR_Y, 1, dark(0x0c0f18), sx * (L - 2), FLOOR_Y / 2, sz * (W - 1.5))

  return {
    group,
    update(t: number) {
      rainTex.offset.y = (t * 0.6) % 1
      rainTex.offset.x = (t * 0.05) % 1
      // the GOAL sign stutters now and then
      const flicker = Math.sin(t * 0.7) > 0.93 && Math.sin(t * 47) > 0
      signs[3].mat.color.copy(signs[3].base).multiplyScalar(flicker ? 0.15 : 1)
    },
  }
}
