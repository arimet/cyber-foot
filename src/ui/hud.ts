import type { Level } from '../game/ai'
import type { ShotMode, Team } from '../game/types'

export type HudState = {
  score: Record<Team, number>
  turn: Team
  mode: ShotMode
  winner: Team | null
  busy: boolean
  thinking: boolean
  menu: boolean
}

const NAME: Record<Team, string> = { cyan: 'Cyan', magenta: 'Magenta' }

export function createHud(
  root: HTMLElement,
  h: { onToggleMode(): void; onReplay(): void; onMenu(): void; onStart(vs: 'human' | Level): void },
) {
  root.innerHTML = `
    <div class="hud-top">
      <div class="score"><span class="cyan">CYAN</span> <b data-s="cyan">0</b> — <b data-s="magenta">0</b> <span class="magenta">MAGENTA</span></div>
      <div class="turn"></div>
    </div>
    <button class="mode" type="button"></button>
    <div class="end" hidden><p></p><div class="row"><button type="button" data-a="replay">Rejouer</button><button type="button" data-a="menu">Menu</button></div></div>
    <div class="menu" hidden>
      <h1>cyber-foot</h1>
      <button type="button" data-vs="human">2 joueurs</button>
      <p>Contre l'IA</p>
      <div class="row">
        <button type="button" data-vs="rookie">Recrue</button>
        <button type="button" data-vs="pro">Pro</button>
        <button type="button" data-vs="legend">Légende</button>
      </div>
    </div>`
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!
  const mode = q<HTMLButtonElement>('.mode')
  const end = q<HTMLDivElement>('.end')
  const menu = q<HTMLDivElement>('.menu')
  mode.addEventListener('click', h.onToggleMode)
  q('[data-a="replay"]').addEventListener('click', h.onReplay)
  q('[data-a="menu"]').addEventListener('click', h.onMenu)
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-vs]'))
    b.addEventListener('click', () => h.onStart(b.dataset.vs as 'human' | Level))

  return {
    update(s: HudState) {
      for (const t of ['cyan', 'magenta'] as const) q(`[data-s="${t}"]`).textContent = String(s.score[t])
      const turn = q<HTMLDivElement>('.turn')
      turn.textContent = s.winner || s.menu ? '' : s.thinking ? `${NAME[s.turn]} réfléchit…` : `À ${NAME[s.turn]} de jouer`
      turn.className = `turn ${s.turn}`
      mode.textContent = s.mode === 'lob' ? 'Lob' : 'Ras'
      mode.classList.toggle('lob', s.mode === 'lob')
      mode.disabled = s.busy || s.thinking || !!s.winner
      mode.hidden = s.menu
      menu.hidden = !s.menu
      end.hidden = !s.winner || s.menu
      if (s.winner) {
        q('.end p').textContent = `${NAME[s.winner]} gagne !`
        end.className = `end ${s.winner}`
      }
    },
  }
}
