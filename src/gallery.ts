// Visual sign-off sheet for the voxel animals (not part of the game).
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { Team } from './game/types'
import { type Animal, TEAM_HEX, createAnimal } from './render/animals'

const animal = (new URLSearchParams(location.search).get('a') ?? 'rhino') as Animal
const canvas = document.getElementById('c') as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.shadowMap.enabled = true
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x05050c)
scene.add(new THREE.HemisphereLight(0x8a9cff, 0x1a0a24, 1.1))
const key = new THREE.DirectionalLight(0xffffff, 2.2)
key.position.set(-4, 8, 6)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -8, right: 8, top: 5, bottom: -5 })
scene.add(key)
const fill = new THREE.DirectionalLight(0xc8d8ff, 1.3)
fill.position.set(1, 2, 8)
scene.add(fill)
const rim = new THREE.DirectionalLight(0xff3df2, 1.2)
rim.position.set(5, 4, -6)
scene.add(rim)

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x0f1a2a, roughness: 0.85 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

const team = (new URLSearchParams(location.search).get('t') ?? 'cyan') as Team
// Front three-quarters, front, back three-quarters.
// ?a=all: the five animals side by side, at three-quarters.
const ALL: Animal[] = ['gorilla', 'rhino', 'bear', 'fox', 'cat']
const SPOTS = (new URLSearchParams(location.search).get('a') === 'all')
  ? ALL.map((who, i) => ({ who, x: (i - 2) * 1.5, z: 0, a: -0.45, s: who === 'fox' || who === 'cat' ? 0.7 : 0.85 }))
  : [
    { who: animal, x: -1.75, z: 0, a: -0.55, s: 1 },
    { who: animal, x: 0, z: 0, a: 0, s: 1 },
    { who: animal, x: 1.75, z: 0, a: Math.PI + 0.55, s: 1 },
  ]
for (const { who, x, z, a, s } of SPOTS) {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.86, 0.3, 40),
    new THREE.MeshStandardMaterial({ color: 0x0d1626, roughness: 0.5 }),
  )
  base.position.set(0, 0.15, 0)
  base.castShadow = base.receiveShadow = true
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.035, 8, 64).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_HEX[team]).multiplyScalar(1.35), toneMapped: false }),
  )
  ring.position.y = 0.05
  const fig = createAnimal(who, team)
  fig.position.y = 0.3
  fig.rotation.y = a
  const holder = new THREE.Group()
  holder.add(base, ring, fig)
  holder.position.set(x, 0, z)
  holder.scale.setScalar(s)
  scene.add(holder)
}

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
const far = SPOTS.length > 3 ? 1.7 : 1
camera.position.set(0, 3.4 * far, 4.4 * far) // about 45°, as in the game
camera.lookAt(0, 0.75, 0)

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.35, 0.6)
composer.addPass(bloom)
composer.addPass(new OutputPass())

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  composer.render()
}
addEventListener('resize', draw)
draw()
