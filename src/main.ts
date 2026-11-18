import './style.css'
import { audioRunning, isMuted, setMuted, sfx, unlockAudio } from './audio/sfx'
import { type Level, think } from './game/ai'
import { aimFromDrag } from './game/aim'
import { BASE_RADIUS, MAX_TURN_STEPS, PIECES } from './game/constants'
import { DRILLS, drillMet, setUpDrill } from './game/drills'
import { Match } from './game/match'
import { type Shot, type ShotMode, type Team, other } from './game/types'
import { bindInput } from './input'
import { Table } from './physics/table'
import { GameScene } from './render/scene'
import { createHud } from './ui/hud'
import { getLang } from './ui/i18n'

document.documentElement.lang = getLang()

const STEP = 1 / 60
const AFTER_GOAL_STEPS = 150 // 2.5 s of celebration before the kickoff reset
const PICK_SLACK = 0.25 // fingers are wider than the base
const AI_TEAM: Team = 'magenta'
const AI_AIM_MS = 700 // the AI shows its aim before shooting
const HELD_TURN = 0.25 // rad per frame a held ball turns round its holder to follow the aim

const canvas = document.getElementById('scene') as HTMLCanvasElement
const table = await Table.create()
const scene = new GameScene(canvas, PIECES)
let match = new Match(PIECES)
let mode: ShotMode = 'ground'
let busy = false
let steps = 0
let goal: { against: Team; left: number } | null = null
let origin: { x: number; z: number } | null = null
let aiming: { id: string; dirX: number; dirZ: number } | null = null // the player's aim under way, if any
let opponent: 'human' | Level | null = null // null: start menu
let close = true // camera follows the ball, zoomed in
let down = new Set<string>() // pieces lying down, to hear new falls
// Training: the drill under way (DRILLS.length is the closing rules card), instead of the match rules.
let training: { i: number; done: boolean; missed: boolean; shooter: string; passes: number } | null = null
let handDone = false // the ghost hand shows on the first drill until the player first grabs the piece
const TRAINED_KEY = 'cyber-foot:trained'
const DONE_MS = 1200, DONE_LONG_MS = 3500 // how long "Done!" shows before the next drill
let trained = (() => { try { return localStorage.getItem(TRAINED_KEY) === '1' } catch { return false } })()
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
  onTraining() {
    newGame('human')
    handDone = false
    startDrill(0)
  },
  onSkip: () => training && startDrill(training.i + 1),
  onNext: () => training && startDrill(training.i + 1),
  onPlayMatch: () => newGame('human'),
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
const refresh = () => {
  scene.setStunned(match.stunned)
  scene.setReceiver(training ? (training.passes ? training.shooter : null) : match.receiver)
  hud.update({ muted: isMuted(), close, score: match.score, turn: match.turn, mode, winner: match.winner, busy, thinking: thinking(), menu: !opponent,
    passes: match.passes,
    training: training && {
      key: training.i < DRILLS.length ? DRILLS[training.i].key : 'rules', done: training.done, missed: training.missed, passed: training.passes > 0,
    },
    trained,
  })
}
const roleOf = (id: string) => PIECES.find(p => p.id === id)!.role
const aiToPlay = () => !!opponent && opponent !== 'human' && match.turn === AI_TEAM && !match.winner

function newGame(vs: 'human' | Level | null) {
  opponent = vs
  match = new Match(PIECES)
  training = null
  table.setBenched(new Set())
  scene.setBenched(new Set())
  scene.celebrate(null)
  table.reset()
  mode = 'ground'
  busy = false
  goal = null
  aiThought = null
  aiAim = null
  clearAim()
  refresh()
}

// Sets drill i up from scratch, or shows the rules card after the last one.
function startDrill(i: number) {
  training = { i, done: false, missed: false, shooter: DRILLS[i]?.shooter ?? '', passes: 0 }
  busy = false
  goal = null
  clearAim()
  scene.celebrate(null)
  if (i < DRILLS.length) {
    setUpDrill(table, DRILLS[i])
    scene.setBenched(new Set(PIECES.map(p => p.id).filter(id => !(id in DRILLS[i].pieces))))
  } else {
    trained = true
    try { localStorage.setItem(TRAINED_KEY, '1') } catch { /* private mode: it is only a highlight */ }
  }
  refresh()
}

// The shot of a drill has played out: done, or set up again for another try. The match is left alone.
function endDrill(goalAgainst: Team | null) {
  const t = training!, d = DRILLS[t.i]
  busy = false
  goal = null
  const caught = table.capturedBy
  if (!goalAgainst && caught?.startsWith('cyan')) { // a pass: play on with the catcher
    t.shooter = caught
    t.passes++
  }
  else if (drillMet(d, { goalAgainst, tipped: table.tippedIds(), passes: t.passes })) {
    t.done = true
    // on to the next drill by itself, once "Done!" has been read (the tip drill's line is longer)
    setTimeout(() => { if (training === t) startDrill(t.i + 1) }, d.key === 'tip' ? DONE_LONG_MS : DONE_MS)
  }
  else {
    t.missed = true
    t.shooter = d.shooter
    t.passes = 0
    setUpDrill(table, d)
  }
  refresh()
}

const canShoot = (id: string) =>
  training ? training.i < DRILLS.length && !training.done && id === training.shooter : match.canShoot(id)

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

// Browsers start audio only after a gesture; for touch that is pointerup, not pointerdown. Keep trying until it runs.
const unlock = () => {
  unlockAudio()
  if (audioRunning()) for (const ev of ['pointerup', 'keydown']) removeEventListener(ev, unlock)
}
for (const ev of ['pointerup', 'keydown']) addEventListener(ev, unlock)

bindInput(canvas, scene, {
  pick(p, under) {
    if (busy || !opponent || thinking() || aiToPlay()) return null
    // The figure under the pointer first; else the nearest base around the floor point.
    let best: string | null = under.find(canShoot) ?? null, bestD = best ? -1 : Infinity
    for (const { id, role } of PIECES) {
      if (!canShoot(id)) continue
      const pose = table.piecePose(id)
      const d = Math.hypot(pose.x - p.x, pose.z - p.z)
      if (d <= BASE_RADIUS[role] + PICK_SLACK && d < bestD) [best, bestD] = [id, d]
    }
    if (best) {
      handDone = true
      const pose = table.piecePose(best)
      origin = { x: pose.x, z: pose.z }
      scene.setSelected(best)
    }
    return best
  },
  aim(id, p) {
    const a = origin && aimFromDrag(origin, p)
    aiming = a && { id, dirX: a.dirX, dirZ: a.dirZ }
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
  aiming = null
  scene.setSelected(null)
  scene.setAim(null, 0, 0, 0, 'light')
}

function endTurn(goalAgainst: Team | null) {
  if (training) return endDrill(goalAgainst)
  const out = match.endTurn({ goalAgainst, tipped: table.tippedIds(), captured: table.capturedBy })
  if (out.winner) {
    sfx.win()
    scene.celebrate(out.winner)
  }
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
  if (r.captured) sfx.catch()
  for (const id of table.tippedIds()) if (!down.has(id)) {
    down.add(id)
    sfx.tip()
  }
  if (goal) {
    if (--goal.left <= 0) endTurn(goal.against)
  } else if (r.goalAgainst) {
    goal = { against: r.goalAgainst, left: AFTER_GOAL_STEPS }
    scene.cheer(other(r.goalAgainst))
    hud.goal(other(r.goalAgainst))
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
  const held = aiming ?? (aiAim && { id: aiAim.shot.pieceId, dirX: aiAim.shot.dirX, dirZ: aiAim.shot.dirZ })
  if (held && !busy) table.aimHold(held.id, held.dirX, held.dirZ, HELD_TURN)
  const shooter = training?.i === 0 && !handDone && !busy ? table.piecePose(DRILLS[0].shooter) : null
  hud.hand(shooter && scene.toScreen(shooter.x, shooter.z), shooter ? scene.toScreen(shooter.x - 2, shooter.z) : undefined)
  scene.sync(table)
  scene.render(now / 1000)
  requestAnimationFrame(frame)
}
refresh()
requestAnimationFrame(frame)
if (import.meta.env.DEV) Object.assign(window, { __game: { table, scene, advance, aiFrame, frame, get match() { return match }, get busy() { return busy } } })
