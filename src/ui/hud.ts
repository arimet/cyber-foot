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
    <button class="mode" type="button"></button>
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
  const mode = q<HTMLButtonElement>('.mode')
  const view = q<HTMLButtonElement>('.view')
  const mute = q<HTMLButtonElement>('.mute')
  const lang = q<HTMLButtonElement>('.lang')
  const end = q<HTMLDivElement>('.end')
  const menu = q<HTMLDivElement>('.menu')
  let last: HudState | null = null
  mode.addEventListener('click', h.onToggleMode)
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
    mode.textContent = s.mode === 'lob' ? d.lob : d.ground
    mode.classList.toggle('lob', s.mode === 'lob')
    mode.disabled = s.busy || s.thinking || !!s.winner
    mode.hidden = s.menu
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
