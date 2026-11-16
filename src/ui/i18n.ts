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
  wins: (team: string) => `${team} gagne !`,
  ground: 'Ras',
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
}

const en: typeof fr = {
  switchTo: 'Français',
  toPlay: team => `${team} to play`,
  thinking: team => `${team} is thinking…`,
  wins: team => `${team} wins!`,
  ground: 'Ground',
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
