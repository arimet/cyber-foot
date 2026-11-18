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
  passCaught: 'Passe captée ! Tire avec le chat.',
  done: 'Réussi !',
  tipDone: 'Réussi ! Un pion renversé passe le prochain tour de son équipe.',
  rules: 'Un tir chacun son tour, mais une passe captée par un coéquipier te fait rejouer (3 max). Le premier à 5 buts gagne.',
  drill: {
    empty: 'Tire ton pion en arrière et lâche : plus tu tires, plus il part fort. Marque !',
    penalty: 'Le gardien couvre un côté : vise le côté ouvert.',
    lob: 'Un défenseur bloque le tir au sol : choisis Lob pour passer par-dessus.',
    pass: 'Le rhino bloque le but. Fais une passe douce au chat : il capte le ballon, puis tire avec lui.',
    tip: 'Renverse le chat adverse en fonçant dessus.',
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
  passCaught: 'Caught! Now shoot with the cat.',
  done: 'Done!',
  tipDone: "Done! A piece knocked over sits out its team's next turn.",
  rules: 'One shot each, in turn, but a pass caught by a teammate gives you another shot (3 at most). First to 5 goals wins.',
  drill: {
    empty: 'Pull your piece back and let go: the further you pull, the harder it goes. Score!',
    penalty: 'The keeper covers one side: aim for the open side.',
    lob: 'A defender blocks shots along the ground: pick Lob to go over him.',
    pass: 'The rhino blocks the goal. Pass softly to the cat: it catches the ball, then shoot with it.',
    tip: "Knock the other team's cat over by running into it.",
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
