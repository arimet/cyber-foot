import type { Level } from '../game/ai'
import type { DrillKey } from '../game/drills'
import { MAX_PASSES } from '../game/constants'
import type { ShotMode, Team } from '../game/types'
import { getLang, setLang, t } from './i18n'

export type HudState = {
  muted: boolean
  close: boolean
  score: Record<Team, number>
  turn: Team
  mode: ShotMode
  winner: Team | null
  busy: boolean
  thinking: boolean
  passes: number // passes made this turn: the turn goes on
  menu: boolean
  training: { key: DrillKey | 'rules'; done: boolean; missed: boolean; passed: boolean } | null
  trained: boolean // finished the training once: its menu button is no longer pushed
}

const NAME: Record<Team, string> = { cyan: 'Cyan', magenta: 'Magenta' }

// Every text comes from the dictionary on each update, so switching language mid-game just needs a refresh.
export function createHud(
  root: HTMLElement,
  h: {
    onToggleMode(): void; onReplay(): void; onMenu(): void; onStart(vs: 'human' | Level): void; onView(): void; onMute(): void
    onTraining(): void; onSkip(): void; onNext(): void; onPlayMatch(): void
  },
) {
  root.innerHTML = `
    <div class="hud-top">
      <div class="score"><span class="cyan">CYAN</span> <b data-s="cyan">0</b> — <b data-s="magenta">0</b> <span class="magenta">MAGENTA</span></div>
      <div class="turn"></div>
    </div>
    <div class="shot" role="group">
      <span class="shot-label"></span>
      <button type="button" data-m="ground"><svg viewBox="0 0 30 16" aria-hidden="true"><path d="M2 13H27M21 8l6 5-6 5"/></svg><span></span></button>
      <button type="button" data-m="lob"><svg viewBox="0 0 30 16" aria-hidden="true"><path d="M2 14Q14-6 26 13M20 11l6 2 0-6"/></svg><span></span></button>
    </div>
    <div class="corner"><button class="lang" type="button"></button><button class="mute" type="button"></button><button class="view" type="button"></button></div>
    <div class="goal-flash" hidden aria-live="polite"><b></b></div>
    <div class="end" hidden><p></p><div class="final"><b class="cyan"></b> – <b class="magenta"></b></div><div class="row"><button type="button" data-a="replay"></button><button type="button" data-a="menu"></button></div></div>
    <div class="drill" hidden aria-live="polite"><p></p><small></small><div class="row"><button type="button" data-a="skip"></button><button type="button" data-a="next"></button><button type="button" data-a="drill-menu"></button></div></div>
    <div class="rules" hidden><p></p><div class="row"><button type="button" data-a="play"></button><button type="button" data-a="rules-menu"></button></div></div>
    <div class="hand" hidden aria-hidden="true">👆</div>
    <div class="menu" hidden>
      <h1>cyber-foot</h1>
      <button type="button" data-a="training" data-t="training"></button>
      <button type="button" data-vs="human" data-t="twoPlayers"></button>
      <p data-t="vsAi"></p>
      <div class="row">
        <button type="button" data-vs="rookie" data-t="rookie"></button>
        <button type="button" data-vs="pro" data-t="pro"></button>
        <button type="button" data-vs="legend" data-t="legend"></button>
      </div>
    </div>
    <div class="rotate"><p data-t="rotate"></p></div>`
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!
  const shot = q<HTMLDivElement>('.shot')
  const modes = [...root.querySelectorAll<HTMLButtonElement>('[data-m]')]
  const view = q<HTMLButtonElement>('.view')
  const mute = q<HTMLButtonElement>('.mute')
  const lang = q<HTMLButtonElement>('.lang')
  const end = q<HTMLDivElement>('.end')
  const menu = q<HTMLDivElement>('.menu')
  let last: HudState | null = null
  for (const b of modes) b.addEventListener('click', () => { if (last && b.dataset.m !== last.mode) h.onToggleMode() })
  view.addEventListener('click', h.onView)
  mute.addEventListener('click', h.onMute)
  lang.addEventListener('click', () => {
    setLang(getLang() === 'fr' ? 'en' : 'fr')
    if (last) update(last)
  })
  q('[data-a="replay"]').addEventListener('click', h.onReplay)
  q('[data-a="menu"]').addEventListener('click', h.onMenu)
  q('[data-a="rules-menu"]').addEventListener('click', h.onMenu)
  q('[data-a="drill-menu"]').addEventListener('click', h.onMenu) // a way out of training at any time
  q('[data-a="training"]').addEventListener('click', h.onTraining)
  q('[data-a="skip"]').addEventListener('click', h.onSkip)
  q('[data-a="next"]').addEventListener('click', h.onNext)
  q('[data-a="play"]').addEventListener('click', h.onPlayMatch)
  const drill = q<HTMLDivElement>('.drill'), rules = q<HTMLDivElement>('.rules'), hand = q<HTMLDivElement>('.hand')
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-vs]'))
    b.addEventListener('click', () => h.onStart(b.dataset.vs as 'human' | Level))

  function update(s: HudState) {
    last = s
    const d = t()
    for (const el of root.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = d[el.dataset.t as 'rotate'] as string
    for (const team of ['cyan', 'magenta'] as const) q(`[data-s="${team}"]`).textContent = String(s.score[team])
    const turn = q<HTMLDivElement>('.turn')
    turn.textContent = s.winner || s.menu || s.training ? '' : s.thinking ? d.thinking(NAME[s.turn])
      : s.passes ? d.passTurn(NAME[s.turn], s.passes, MAX_PASSES) : d.toPlay(NAME[s.turn])
    turn.className = `turn ${s.turn}`
    // both shots on show, the chosen one lit: a switch, not a label to decode
    q('.shot-label').textContent = d.shot
    for (const b of modes) {
      const m = b.dataset.m as ShotMode
      b.querySelector('span')!.textContent = d[m]
      b.setAttribute('aria-pressed', String(s.mode === m))
      b.disabled = s.busy || s.thinking || !!s.winner
    }
    shot.hidden = s.menu
    view.hidden = s.menu
    view.textContent = s.close ? d.wideView : d.closeView
    mute.textContent = s.muted ? '🔇' : '🔊'
    mute.setAttribute('aria-label', s.muted ? d.unmute : d.mute)
    lang.textContent = d.switchTo
    q('[data-a="replay"]').textContent = d.replay
    q('[data-a="menu"]').textContent = d.menu
    menu.hidden = !s.menu
    end.hidden = !s.winner || s.menu
    q<HTMLElement>('.score').hidden = !!s.training
    q('[data-a="training"]').classList.toggle('suggested', !s.trained)
    const tr = s.training
    drill.hidden = !tr || tr.key === 'rules' || s.menu
    rules.hidden = !tr || tr.key !== 'rules' || s.menu
    if (tr && tr.key !== 'rules') {
      q('.drill p').textContent = d.drill[tr.key]
      q('.drill small').textContent = tr.done ? (tr.key === 'tip' ? d.tipDone : d.done) : tr.passed ? d.passCaught : tr.missed ? d.missed : ''
      q<HTMLButtonElement>('[data-a="skip"]').hidden = tr.done
      q<HTMLButtonElement>('[data-a="next"]').hidden = !tr.done
    }
    q('.rules p').textContent = d.rules
    q('[data-a="skip"]').textContent = d.skip
    q('[data-a="next"]').textContent = d.next
    q('[data-a="play"]').textContent = d.playMatch
    q('[data-a="rules-menu"]').textContent = d.menu
    q('[data-a="drill-menu"]').textContent = d.menu
    if (s.winner) {
      q('.end p').textContent = d.wins(NAME[s.winner])
      q('.final .cyan').textContent = String(s.score.cyan)
      q('.final .magenta').textContent = String(s.score.magenta)
      end.className = `end ${s.winner}`
    }
  }
  // The goal banner: restarts its animation each time, hides itself when done.
  const flash = q<HTMLDivElement>('.goal-flash')
  flash.addEventListener('animationend', e => { if (e.target === flash) flash.hidden = true })
  function goal(team: Team) {
    flash.querySelector('b')!.textContent = t().goal
    flash.className = `goal-flash ${team}`
    flash.hidden = false
    void flash.offsetWidth // restart the animation
    flash.classList.add('go')
  }
  // The ghost hand: drags from the piece back to the pull point, over and over. null hides it.
  function showHand(from: { x: number; y: number } | null, to?: { x: number; y: number }) {
    hand.hidden = !from
    if (!from || !to) return
    for (const [k, v] of Object.entries({ x0: from.x, y0: from.y, x1: to.x, y1: to.y })) hand.style.setProperty(`--${k}`, `${v}px`)
  }
  return { update, goal, hand: showHand }
}
