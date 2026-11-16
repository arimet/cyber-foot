import './style.css'
import { aimFromDrag } from './game/aim'
import { BASE_RADIUS, MAX_TURN_STEPS, PIECES } from './game/constants'
import { Match } from './game/match'
import type { ShotMode, Team } from './game/types'
import { bindInput } from './input'
import { Table } from './physics/table'
import { GameScene } from './render/scene'
import { createHud } from './ui/hud'

const STEP = 1 / 60
const AFTER_GOAL_STEPS = 45 // let the ball hit the net before the kickoff reset
const PICK_SLACK = 0.25 // fingers are wider than the base

const canvas = document.getElementById('scene') as HTMLCanvasElement
const table = await Table.create()
const scene = new GameScene(canvas, PIECES)
let match = new Match(PIECES)
let mode: ShotMode = 'ground'
let busy = false
let steps = 0
let goal: { against: Team; left: number } | null = null
let origin: { x: number; z: number } | null = null

const hud = createHud(document.getElementById('ui')!, {
  onToggleMode() {
    mode = mode === 'ground' ? 'lob' : 'ground'
    refresh()
  },
  onReplay() {
    match = new Match(PIECES)
    table.reset()
    refresh()
  },
})
const refresh = () => hud.update({ score: match.score, turn: match.turn, mode, winner: match.winner, busy })
const roleOf = (id: string) => PIECES.find(p => p.id === id)!.role

bindInput(canvas, scene, {
  pick(p) {
    if (busy) return null
    let best: string | null = null, bestD = Infinity
    for (const { id, role } of PIECES) {
      if (!match.canShoot(id)) continue
      const pose = table.piecePose(id)
      const d = Math.hypot(pose.x - p.x, pose.z - p.z)
      if (d <= BASE_RADIUS[role] + PICK_SLACK && d < bestD) [best, bestD] = [id, d]
    }
    if (best) {
      const pose = table.piecePose(best)
      origin = { x: pose.x, z: pose.z }
      scene.setSelected(best)
    }
    return best
  },
  aim(id, p) {
    const a = origin && aimFromDrag(origin, p)
    scene.setAim(a ? origin : null, a?.dirX ?? 0, a?.dirZ ?? 0, a?.power ?? 0, roleOf(id))
  },
  release(id, p) {
    const a = origin && aimFromDrag(origin, p)
    clearAim()
    if (!a) return // a click or a tiny pull does not use the turn
    table.shoot({ pieceId: id, ...a, mode })
    mode = 'ground'
    busy = true
    steps = 0
    refresh()
  },
  cancel: clearAim,
})

function clearAim() {
  origin = null
  scene.setSelected(null)
  scene.setAim(null, 0, 0, 0, 'light')
}

function endTurn(goalAgainst: Team | null) {
  const out = match.endTurn({ goalAgainst, tipped: table.tippedIds() })
  if (out.kickoff) table.reset()
  for (const id of out.standUp) table.standUp(id)
  busy = false
  goal = null
  refresh()
}

function advance() {
  const r = table.step()
  steps++
  if (goal) {
    if (--goal.left <= 0) endTurn(goal.against)
  } else if (r.goalAgainst) goal = { against: r.goalAgainst, left: AFTER_GOAL_STEPS }
  else if (table.isSettled() || steps >= MAX_TURN_STEPS) endTurn(null)
}

let acc = 0, last = performance.now()
function frame(now: number) {
  acc = Math.min(acc + (now - last) / 1000, 5 * STEP) // drop time after a stall rather than fast-forward
  last = now
  while (acc >= STEP) {
    if (busy) advance()
    acc -= STEP
  }
  scene.sync(table)
  scene.render()
  requestAnimationFrame(frame)
}
refresh()
requestAnimationFrame(frame)
if (import.meta.env.DEV) Object.assign(window, { __game: { table, scene, advance, get match() { return match }, get busy() { return busy } } })
