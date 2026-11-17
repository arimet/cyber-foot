import * as THREE from 'three'
import { GOAL_DEPTH, GOAL_HALF_WIDTH, GOAL_HEIGHT } from '../game/constants'

// A real goal: white posts and crossbar, a stanchion frame behind, and a net on the back, sides and roof, tinted in the
// defending team's colour. Built facing +x with its mouth at x = 0, as deep and tall as the physics box.
const R = 0.07

let netTex: THREE.CanvasTexture | null = null
function net(): THREE.CanvasTexture {
  if (netTex) return netTex
  const cv = Object.assign(document.createElement('canvas'), { width: 64, height: 64 })
  const c = cv.getContext('2d')!
  c.strokeStyle = '#ffffff'
  c.lineWidth = 3
  c.beginPath() // a diamond mesh
  c.moveTo(0, 32); c.lineTo(32, 0); c.lineTo(64, 32); c.lineTo(32, 64); c.closePath()
  c.stroke()
  netTex = new THREE.CanvasTexture(cv)
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping
  netTex.anisotropy = 4
  return netTex
}

export function createGoal(color: number): THREE.Group {
  const g = new THREE.Group()
  const D = GOAL_DEPTH, H = GOAL_HEIGHT, W = GOAL_HALF_WIDTH
  const white = new THREE.MeshStandardMaterial({ color: 0xeef2f6, roughness: 0.3, metalness: 0.2 })
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.5, metalness: 0.3 })
  const tube = (a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) => {
    const len = a.distanceTo(b)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
    g.add(mesh)
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  for (const u of [-1, 1]) {
    tube(v(0, 0, u * W), v(0, H, u * W), R, white) // post
    tube(v(0, H, u * W), v(D, H, u * W), R * 0.5, frame) // top of the side frame
    tube(v(D, 0, u * W), v(D, H, u * W), R * 0.5, frame) // back stanchion
  }
  tube(v(0, H, -W - R), v(0, H, W + R), R, white) // crossbar
  tube(v(D, H, -W), v(D, H, W), R * 0.5, frame)
  tube(v(D, 0, -W), v(D, 0, W), R * 0.5, frame)

  // the net, a little inside the frame
  const panel = (w: number, h: number) => {
    const tex = net().clone()
    tex.repeat.set(w / 0.35, h / 0.35)
    tex.needsUpdate = true
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
    }))
  }
  const back = panel(2 * W, H)
  back.rotation.y = Math.PI / 2
  back.position.set(D - 0.03, H / 2, 0)
  const roof = panel(D, 2 * W)
  roof.rotation.x = -Math.PI / 2
  roof.position.set(D / 2, H - 0.03, 0)
  g.add(back, roof)
  for (const u of [-1, 1]) {
    const side = panel(D, H)
    side.position.set(D / 2, H / 2, u * (W - 0.03))
    g.add(side)
  }
  // a glowing goal line, so each end still reads as its team's
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 2 * W),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1.2 }))
  line.position.set(0, 0.012, 0)
  g.add(line)
  return g
}
