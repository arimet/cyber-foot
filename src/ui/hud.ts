import type { ShotMode, Team } from '../game/types'

export type HudState = { score: Record<Team, number>; turn: Team; mode: ShotMode; winner: Team | null; busy: boolean }

const NAME: Record<Team, string> = { cyan: 'Cyan', magenta: 'Magenta' }

export function createHud(root: HTMLElement, h: { onToggleMode(): void; onReplay(): void }) {
  root.innerHTML = `
    <div class="hud-top">
      <div class="score"><span class="cyan">CYAN</span> <b data-s="cyan">0</b> — <b data-s="magenta">0</b> <span class="magenta">MAGENTA</span></div>
      <div class="turn"></div>
    </div>
    <button class="mode" type="button"></button>
    <div class="end" hidden><p></p><button type="button">Rejouer</button></div>`
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!
  const mode = q<HTMLButtonElement>('.mode')
  const end = q<HTMLDivElement>('.end')
  mode.addEventListener('click', h.onToggleMode)
  q<HTMLButtonElement>('.end button').addEventListener('click', h.onReplay)

  return {
    update(s: HudState) {
      for (const t of ['cyan', 'magenta'] as const) q(`[data-s="${t}"]`).textContent = String(s.score[t])
      const turn = q<HTMLDivElement>('.turn')
      turn.textContent = s.winner ? '' : `À ${NAME[s.turn]} de jouer`
      turn.className = `turn ${s.turn}`
      mode.textContent = s.mode === 'lob' ? 'Lob' : 'Ras'
      mode.classList.toggle('lob', s.mode === 'lob')
      mode.disabled = s.busy || !!s.winner
      end.hidden = !s.winner
      if (s.winner) {
        q('.end p').textContent = `${NAME[s.winner]} gagne !`
        end.className = `end ${s.winner}`
      }
    },
  }
}
