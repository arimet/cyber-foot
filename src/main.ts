import './style.css'
import { audioRunning, isMuted, setMuted, sfx, unlockAudio } from './audio/sfx'
import { type Level, planOrders, think } from './game/ai'
import { aimFromDrag } from './game/aim'
import { BASE_RADIUS, MAX_TURN_STEPS, PIECES } from './game/constants'
import { DRILLS, drillMet, setUpDrill, STRATEGY_DRILLS } from './game/drills'
import { Match } from './game/match'
import { Strategy } from './game/strategy'
import { type Shot, type ShotMode, type Team, other } from './game/types'
import { bindInput } from './input'
import { Table } from './physics/table'
import { GameScene } from './render/scene'
import { createHud, type GameMode } from './ui/hud'
import { getLang } from './ui/i18n'

document.documentElement.lang = getLang()

const STEP = 1 / 60
const AFTER_GOAL_STEPS = 150 // 2.5 s of celebration before the kickoff reset
const PICK_SLACK = 0.25 // fingers are wider than the base
const AI_TEAM: Team = 'magenta'
const AI_AIM_MS = 700 // the AI shows its aim before shooting
const HELD_TURN = 0.25 // rad per frame a held ball turns round its holder to follow the aim
const LAUNCH_FRAMES = 12 // Strategy: the held ball turns to its kick's side, then every order starts

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
// Strategy mode: the game (in a Strategy drill, only its orders are used), the team giving orders (behind the
// hand-over card first, in a two-player game), the AI's orders being worked out, and the short turn before launch.
let gameMode: GameMode = 'classic'
let strat: Strategy | null = null
let planning: { team: Team; cover: boolean } | null = null
let aiPlan: Generator<void, Shot[]> | null = null
let launching: { left: number } | null = null
let roundOrders = 0 // orders the player gave this round: a Strategy drill may ask for several
const drills = () => (gameMode === 'strategy' ? STRATEGY_DRILLS : DRILLS)

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
  onGameMode(m) {
    gameMode = m
    refresh()
  },
  onReady() {
    if (!planning) return
    planning.cover = false
    refresh()
  },
  onLaunch() {
    if (!planning || !strat?.orders(planning.team).length) return
    if (planning.team === 'cyan' && !training) startPlanning('magenta')
    else launchRound()
  },
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
const thinking = () => !!aiThought || !!aiAim || !!aiPlan
const refresh = () => {
  const game = strat && !training ? strat : match
  scene.setStunned(game.stunned)
  scene.setReceiver(training ? (training.passes ? training.shooter : null) : strat ? null : match.receiver)
  const list = drills()
  hud.update({ muted: isMuted(), close, score: game.score, turn: planning?.team ?? (aiPlan ? AI_TEAM : match.turn), mode, winner: game.winner,
    busy, thinking: thinking(), menu: !opponent, passes: strat ? 0 : match.passes,
    training: training && {
      key: training.i < list.length ? list[training.i].key : 'rules', done: training.done, missed: training.missed, passed: training.passes > 0,
    },
    trained, gameMode,
    strategy: !strat ? null : planning ? { team: planning.team, orders: strat.orders(planning.team).length, cover: planning.cover }
      : busy || launching ? { playing: true } : null,
  })
  // the planning team's orders, drawn from where each piece stands; nobody else's
  const shown = planning && !planning.cover ? strat!.orders(planning.team) : []
  scene.setPlans(planning?.team ?? 'cyan', shown.map(o => ({ ...table.piecePose(o.pieceId), dirX: o.dirX, dirZ: o.dirZ, power: o.power, role: roleOf(o.pieceId) })))
}
const roleOf = (id: string) => PIECES.find(p => p.id === id)!.role
const aiToPlay = () => !strat && !!opponent && opponent !== 'human' && match.turn === AI_TEAM && !match.winner

// Strategy: a team gives its orders, the AI in the background, a player behind the hand-over card in a 2-player game.
function startPlanning(team: Team) {
  planning = null
  if (opponent !== 'human' && team === AI_TEAM && !training) aiPlan = planOrders(table, AI_TEAM, id => strat!.canOrder(AI_TEAM, id), opponent as Level)
  else planning = { team, cover: opponent === 'human' && !training }
  refresh()
}

function launchRound() {
  planning = null
  roundOrders = strat!.orders('cyan').length
  launching = { left: LAUNCH_FRAMES }
  clearAim()
  refresh()
}

// Every order of the round, and a drill's scripted ones, start at the same instant.
function fireRound() {
  const shots = [...strat!.allOrders(), ...(training ? drills()[training.i].script ?? [] : [])]
  table.shootAll(shots)
  sfx.shot(Math.max(...shots.map(s => s.power)))
  down = new Set(table.tippedIds())
  mode = 'ground'
  busy = true
  steps = 0
  refresh()
}

function newGame(vs: 'human' | Level | null) {
  opponent = vs
  match = new Match(PIECES)
  training = null
  strat = gameMode === 'strategy' && vs ? new Strategy(PIECES) : null
  planning = null
  aiPlan = null
  launching = null
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
  if (strat) startPlanning('cyan')
  refresh()
}

// Sets drill i up from scratch, or shows the rules card after the last one.
function startDrill(i: number) {
  const list = drills()
  training = { i, done: false, missed: false, shooter: list[i]?.shooter ?? '', passes: 0 }
  busy = false
  goal = null
  launching = null
  planning = null
  clearAim()
  scene.celebrate(null)
  if (i < list.length) {
    setUpDrill(table, list[i])
    scene.setBenched(new Set(PIECES.map(p => p.id).filter(id => !(id in list[i].pieces))))
    if (strat) {
      strat = new Strategy(PIECES)
      planning = { team: 'cyan', cover: false }
    }
  } else {
    trained = true
    try { localStorage.setItem(TRAINED_KEY, '1') } catch { /* private mode: it is only a highlight */ }
  }
  refresh()
}

// The shot of a drill has played out: done, or set up again for another try. The match is left alone.
function endDrill(goalAgainst: Team | null) {
  const t = training!, d = drills()[t.i]
  busy = false
  goal = null
  const caught = strat ? null : table.passedTo // Strategy: no extra shot after a pass
  if (!goalAgainst && caught?.startsWith('cyan')) { // a pass: play on with the catcher
    t.shooter = caught
    t.passes++
  }
  else if (drillMet(d, { goalAgainst, passes: t.passes, holder: table.holder, orders: strat ? roundOrders : 1 })) {
    t.done = true
    // on to the next drill by itself, once "Done!" has been read (the tackle drill's line is longer)
    setTimeout(() => { if (training === t) startDrill(t.i + 1) }, d.key === 'tackle' ? DONE_LONG_MS : DONE_MS)
  }
  else {
    t.missed = true
    t.shooter = d.shooter
    t.passes = 0
    setUpDrill(table, d)
  }
  if (strat && !t.done) {
    strat = new Strategy(PIECES)
    planning = { team: 'cyan', cover: false }
  }
  refresh()
}

const canShoot = (id: string) => {
  if (strat) return !!planning && !planning.cover && strat.canOrder(planning.team, id) && (!training || id in (drills()[training.i]?.pieces ?? {}))
  return training ? training.i < DRILLS.length && !training.done && id === training.shooter : match.canShoot(id)
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
  if (aiPlan) {
    const r = aiPlan.next()
    if (!r.done) return
    aiPlan = null
    for (const s of r.value) strat!.setOrder(AI_TEAM, s)
    return launchRound()
  }
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
    if (busy || launching || !opponent || thinking() || aiToPlay()) return null
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
    if (strat && planning) { // an order, kept until launch; a tap without a pull takes it back
      if (a) strat.setOrder(planning.team, { pieceId: id, ...a, mode })
      else strat.dropOrder(planning.team, id)
      mode = 'ground'
      return refresh()
    }
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
  if (strat) return endRound(goalAgainst)
  const out = match.endTurn({ goalAgainst, tipped: table.tippedIds(), captured: table.passedTo })
  if (out.winner) {
    sfx.win()
    scene.celebrate(out.winner)
  }
  if (out.kickoff) table.reset(match.turn)
  for (const id of out.standUp) table.standUp(id)
  busy = false
  goal = null
  refresh()
}

function endRound(goalAgainst: Team | null) {
  const out = strat!.endRound({ goalAgainst, tipped: table.tippedIds() })
  if (out.winner) {
    sfx.win()
    scene.celebrate(out.winner)
  }
  if (out.kickoff) table.reset(out.kickoff)
  for (const id of out.standUp) table.standUp(id)
  busy = false
  goal = null
  if (out.winner) refresh()
  else startPlanning('cyan')
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
  // the held ball follows the aim; in Strategy only at launch, so planning gives nothing away
  const kick = launching && table.holder ? strat!.allOrders().find(o => o.pieceId === table.holder) : null
  const held = strat ? kick && { id: kick.pieceId, dirX: kick.dirX, dirZ: kick.dirZ }
    : aiming ?? (aiAim && { id: aiAim.shot.pieceId, dirX: aiAim.shot.dirX, dirZ: aiAim.shot.dirZ })
  if (held && !busy) table.aimHold(held.id, held.dirX, held.dirZ, HELD_TURN)
  if (launching && --launching.left <= 0) {
    launching = null
    fireRound()
  }
  const shooter = gameMode === 'classic' && training?.i === 0 && !handDone && !busy ? table.piecePose(DRILLS[0].shooter) : null
  hud.hand(shooter && scene.toScreen(shooter.x, shooter.z), shooter ? scene.toScreen(shooter.x - 2, shooter.z) : undefined)
  scene.sync(table)
  scene.render(now / 1000)
  requestAnimationFrame(frame)
}
refresh()
requestAnimationFrame(frame)
if (import.meta.env.DEV) Object.assign(window, { __game: { table, scene, advance, aiFrame, frame, get match() { return match }, get busy() { return busy }, get strat() { return strat }, get planning() { return planning } } })
