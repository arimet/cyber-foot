import type { DrillKey } from '../game/drills'

export type Lang = 'fr' | 'en'
const LANG_KEY = 'cyber-foot:lang'

// A saved choice wins; otherwise French for French-speaking browsers, English for everyone else.
export function detectLang(saved: string | null, browser: readonly string[]): Lang {
  if (saved === 'fr' || saved === 'en') return saved
  return browser.some(l => l.toLowerCase().startsWith('fr')) ? 'fr' : 'en'
}

const fr = {
  switchTo: 'English',
  toPlay: (team: string) => `À ${team} de jouer`,
  thinking: (team: string) => `${team} réfléchit…`,
  passTurn: (team: string, n: number, max: number) => `Passe ${n}/${max} : ${team} rejoue avec ce pion`,
  wins: (team: string) => `${team} gagne !`,
  goal: 'But !',
  shot: 'Tir',
  ground: 'Au sol',
  lob: 'Lob',
  wideView: 'Vue large',
  closeView: 'Vue rapprochée',
  mute: 'Couper le son',
  unmute: 'Remettre le son',
  replay: 'Rejouer',
  menu: 'Menu',
  twoPlayers: '2 joueurs',
  vsAi: "Contre l'IA",
  rookie: 'Recrue',
  pro: 'Pro',
  legend: 'Légende',
  rotate: 'Tourne ton téléphone pour jouer',
  training: 'Entraînement',
  skip: 'Passer',
  next: 'Suivant',
  playMatch: 'Jouer un match',
  missed: 'Raté, réessaie !',
  passCaught: 'Captée ! Le chat garde la balle et ne bouge plus : tire depuis lui, la balle suit ta visée et part seule.',
  done: 'Réussi !',
  tackleDone: 'Réussi ! Un tacle trop fort peut renverser un pion : il passe alors le prochain tour de son équipe.',
  rules: "Un pion qui touche la balle la garde. Si ton équipe a la balle, le porteur passe ou tire sans bouger, ou un autre pion glisse pour se placer. Sinon, glisse un pion pour tacler ou ramasser la balle. Une passe captée te fait rejouer (3 max). Le gardien attrape tout. Le premier à 5 buts gagne.",
  drill: {
    empty: 'Ton renard a la balle. Tire-le en arrière et lâche : il ne bouge pas, la balle part seule. Plus tu tires, plus elle va loin. Marque !',
    penalty: 'Le gardien attrape tout ce qui le touche, et il couvre un côté : vise le côté ouvert.',
    lob: 'Le rhino arrête les tirs au sol : choisis Lob pour passer par-dessus.',
    pass: 'Le rhino bloque le but. Fais une passe douce au chat : il garde la balle, puis tire avec lui.',
    tackle: 'Le chat adverse a la balle. Fonce dans lui avec ton renard pour la lui faire perdre.',
  } as Record<DrillKey, string>,
}

const en: typeof fr = {
  switchTo: 'Français',
  toPlay: team => `${team} to play`,
  thinking: team => `${team} is thinking…`,
  passTurn: (team, n, max) => `Pass ${n}/${max}: ${team} plays again with this piece`,
  wins: team => `${team} wins!`,
  goal: 'Goal!',
  shot: 'Shot',
  ground: 'Along the ground',
  lob: 'Lob',
  wideView: 'Wide view',
  closeView: 'Close view',
  mute: 'Mute',
  unmute: 'Unmute',
  replay: 'Play again',
  menu: 'Menu',
  twoPlayers: '2 players',
  vsAi: 'Against the AI',
  rookie: 'Rookie',
  pro: 'Pro',
  legend: 'Legend',
  rotate: 'Turn your phone to play',
  training: 'Training',
  skip: 'Skip',
  next: 'Next',
  playMatch: 'Play a match',
  missed: 'Missed, try again!',
  passCaught: 'Caught! The cat keeps the ball and stays put: pull from it, the ball follows your aim and goes off alone.',
  done: 'Done!',
  tackleDone: "Done! Too hard a tackle can knock a piece over: it then sits out its team's next turn.",
  rules: 'A piece that touches the ball keeps it. If your team has the ball, the holder passes or shoots without moving, or another piece slides into place. If not, slide a piece to tackle or pick the ball up. A caught pass gives you another shot (3 at most). The keeper catches everything. First to 5 goals wins.',
  drill: {
    empty: 'Your fox has the ball. Pull it back and let go: it stays put, the ball goes off alone. The further you pull, the further it goes. Score!',
    penalty: 'The keeper catches whatever touches it, and covers one side: aim for the open side.',
    lob: 'The rhino stops shots along the ground: pick Lob to go over it.',
    pass: 'The rhino blocks the goal. Pass softly to the cat: it keeps the ball, then shoot with it.',
    tackle: "The other team's cat has the ball. Run your fox into it to win the ball.",
  },
}

export const DICT: Record<Lang, typeof fr> = { fr, en }

let lang: Lang = detectLang(
  (() => { try { return localStorage.getItem(LANG_KEY) } catch { return null } })(),
  typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language],
)

export const getLang = () => lang
export const t = () => DICT[lang]

export function setLang(l: Lang) {
  lang = l
  try { localStorage.setItem(LANG_KEY, l) } catch { /* not persisted */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l
}
