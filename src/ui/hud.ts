import type { Level } from '../game/ai'
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
  menu: boolean
}

const NAME: Record<Team, string> = { cyan: 'Cyan', magenta: 'Magenta' }

// Every text comes from the dictionary on each update, so switching language mid-game just needs a refresh.
export function createHud(
  root: HTMLElement,
  h: { onToggleMode(): void; onReplay(): void; onMenu(): void; onStart(vs: 'human' | Level): void; onView(): void; onMute(): void },
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
    <div class="end" hidden><p></p><div class="row"><button type="button" data-a="replay"></button><button type="button" data-a="menu"></button></div></div>
    <div class="menu" hidden>
      <h1>cyber-foot</h1>
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
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-vs]'))
    b.addEventListener('click', () => h.onStart(b.dataset.vs as 'human' | Level))

  function update(s: HudState) {
    last = s
    const d = t()
    for (const el of root.querySelectorAll<HTMLElement>('[data-t]')) el.textContent = d[el.dataset.t as 'rotate'] as string
    for (const team of ['cyan', 'magenta'] as const) q(`[data-s="${team}"]`).textContent = String(s.score[team])
    const turn = q<HTMLDivElement>('.turn')
    turn.textContent = s.winner || s.menu ? '' : s.thinking ? d.thinking(NAME[s.turn]) : d.toPlay(NAME[s.turn])
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
    if (s.winner) {
      q('.end p').textContent = d.wins(NAME[s.winner])
      end.className = `end ${s.winner}`
    }
  }
  return { update }
}
