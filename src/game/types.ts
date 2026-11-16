export type Team = 'cyan' | 'magenta'
export const other = (t: Team): Team => (t === 'cyan' ? 'magenta' : 'cyan')

export type Role = 'heavy' | 'light' | 'keeper'
export type PieceSpec = { id: string; team: Team; role: Role }

export type ShotMode = 'ground' | 'lob'
// dir is normalised, power in [0, 1]
export type Shot = { pieceId: string; dirX: number; dirZ: number; power: number; mode: ShotMode }
