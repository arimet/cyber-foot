import './style.css'
import { isMuted, setMuted, sfx, unlockAudio } from './audio/sfx'
import { type Level, think } from './game/ai'
import { aimFromDrag } from './game/aim'
import { BASE_RADIUS, MAX_TURN_STEPS, PIECES } from './game/constants'
import { Match } from './game/match'
import type { Shot, ShotMode, Team } from './game/types'
import { bindInput } from './input'
import { Table } from './physics/table'
import { GameScene } from './render/scene'
import { createHud } from './ui/hud'

const STEP = 1 / 60
const AFTER_GOAL_STEPS = 45 // let the ball hit the net before the kickoff reset
const PICK_SLACK = 0.25 // fingers are wider than the base
const AI_TEAM: Team = 'magenta'
const AI_AIM_MS = 700 // the AI shows its aim before shooting

const canvas = document.getElementById('scene') as HTMLCanvasElement
const table = await Table.create()
const scene = new GameScene(canvas, PIECES)
let match = new Match(PIECES)
let mode: ShotMode = 'ground'
let busy = false
let steps = 0
let goal: { against: Team; left: number } | null = null
let origin: { x: number; z: number } | null = null
let opponent: 'human' | Level | null = null // null: start menu
let close = true // camera follows the ball, zoomed in
let down = new Set<string>() // pieces lying down, to hear new falls
// AI turn: thinking (a generator stepped once per frame), then showing its aim, then shooting.
// Starting a new game or opening the menu drops both, so a stale AI never shoots into the next game.
let aiThought: Generator<void, Shot> | null = null
let aiAim: { shot: Shot; at: number } | null = null

const hud = createHud(document.getElementById('ui')!, {
  onToggleMode() {
    mode = mode === 'ground' ? 'lob' : 'ground'
    refresh()
  },
  onReplay: () => newGame(opponent),
  onMenu: () => newGame(null),
  onStart: vs => newGame(vs),
  onMute() {
    setMuted(!isMuted())
    unlockAudio()
    refresh()
  },
  onView() {
    close = !close
    scene.setClose(close)
    refresh()
  },
})
const thinking = () => !!aiThought || !!aiAim
const refresh = () =>
  hud.update({ muted: isMuted(), close, score: match.score, turn: match.turn, mode, winner: match.winner, busy, thinking: thinking(), menu: !opponent })
const roleOf = (id: string) => PIECES.find(p => p.id === id)!.role
const aiToPlay = () => !!opponent && opponent !== 'human' && match.turn === AI_TEAM && !match.winner

function newGame(vs: 'human' | Level | null) {
  opponent = vs
  match = new Match(PIECES)
  table.reset()
  mode = 'ground'
  busy = false
  goal = null
  aiThought = null
  aiAim = null
  clearAim()
  refresh()
}

function shoot(shot: Shot) {
  table.shoot(shot)
  sfx.shot(shot.power)
  down = new Set(table.tippedIds())
  mode = 'ground'
  busy = true
  steps = 0
  refresh()
}

// One slice of AI work per frame.
function aiFrame(now: number) {
  if (!busy && !thinking() && aiToPlay()) {
    aiThought = think(table, id => match.canShoot(id), AI_TEAM, opponent as Level)
    refresh()
  }
  if (aiThought) {
    const r = aiThought.next()
    if (!r.done) return
    aiThought = null
    aiAim = { shot: r.value, at: now + AI_AIM_MS }
    const pose = table.piecePose(r.value.pieceId)
    scene.setSelected(r.value.pieceId)
    scene.setAim({ x: pose.x, z: pose.z }, r.value.dirX, r.value.dirZ, r.value.power, roleOf(r.value.pieceId))
  } else if (aiAim && now >= aiAim.at) {
    const { shot } = aiAim
    aiAim = null
    clearAim()
    shoot(shot)
  }
}

addEventListener('pointerdown', unlockAudio, { once: true }) // browsers start audio only after a gesture

bindInput(canvas, scene, {
  pick(p, under) {
    if (busy || !opponent || thinking() || aiToPlay()) return null
    // The figure under the pointer first; else the nearest base around the floor point.
    let best: string | null = under.find(id => match.canShoot(id)) ?? null, bestD = best ? -1 : Infinity
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
    shoot({ pieceId: id, ...a, mode })
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
  if (out.winner) sfx.win()
  if (out.kickoff) table.reset()
  for (const id of out.standUp) table.standUp(id)
  busy = false
  goal = null
  refresh()
}

function advance() {
  const r = table.step()
  steps++
  for (const c of r.contacts) sfx[c.kind === 'piece' ? 'hit' : c.kind](c.strength)
  for (const id of table.tippedIds()) if (!down.has(id)) {
    down.add(id)
    sfx.tip()
  }
  if (goal) {
    if (--goal.left <= 0) endTurn(goal.against)
  } else if (r.goalAgainst) {
    goal = { against: r.goalAgainst, left: AFTER_GOAL_STEPS }
    sfx.goal()
  }
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
  aiFrame(now)
  scene.sync(table)
  scene.render(now / 1000)
  requestAnimationFrame(frame)
}
refresh()
requestAnimationFrame(frame)
if (import.meta.env.DEV) Object.assign(window, { __game: { table, scene, advance, aiFrame, get match() { return match }, get busy() { return busy } } })
