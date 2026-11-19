import type { PieceSpec, Role, Team } from './types'

// Table frame: x along the length (cyan goal at -x, magenta at +x), z across, y up.
export const TABLE_HALF_LENGTH = 10
export const TABLE_HALF_WIDTH = 6.5
export const GOAL_HALF_WIDTH = 2
export const GOAL_HEIGHT = 1.6
export const GOAL_DEPTH = 1.2
export const RAIL_HEIGHT = 0.4 // visible rail
export const GLASS_HEIGHT = 6 // invisible glass walls and ceiling: nothing leaves the table
export const RAMP_RADIUS = 0.8 // the rails curve up from the floor, so a ball against one rolls back out
export const CORNER_RADIUS = 2 // rounded corners, seen from above
export const GLASS_CURVE = 1.8 // above the rails the invisible glass curves in, sending a climbing ball back to the middle
export const PIECE_INSET = 0.4 // pieces stop against an invisible wall this far in, off the ramp

export const BASE_RADIUS: Record<Role, number> = { heavy: 0.9, keeper: 0.75, light: 0.6 }
export const BODY_HEIGHT: Record<Role, number> = { heavy: 1.6, keeper: 1.5, light: 1.2 }
export const MASS: Record<Role, number> = { heavy: 3, keeper: 2, light: 1 }

export const BALL_RADIUS = 0.35
export const BALL_MASS = 0.3

export const MAX_IMPULSE = 16
export const SHOT_BOOST: Record<Role, number> = { heavy: 1.5, keeper: 1, light: 1 } // heavies flick harder: as fast as the keeper
export const LOB_ANGLE_DEG = 35
export const KICK_SPEED = 17.5 // ball speed of a full-power kick by the holder: what a light piece's full shot gives it
export const BALL_DAMPING = 1.6

export const SETTLE_SPEED = 0.12
export const SETTLE_STEPS = 30
export const MAX_TURN_STEPS = 480 // 8 s at 60 Hz
export const TIP_COS = 0.707 // tipped when leaning more than 45°

export const MIN_PULL = 0.3
export const MAX_PULL = 3

export const GOALS_TO_WIN = 5
export const MAX_PASSES = 3 // per turn: the shot after the third pass is the last
export const MAX_ORDERS = 4 // Strategy mode: orders per team and round, one per piece

const SLOTS: { slot: string; role: Role; x: number; z: number }[] = [
  { slot: 'keeper', role: 'keeper', x: -8.5, z: 0 },
  { slot: 'heavy1', role: 'heavy', x: -5.5, z: -2.5 },
  { slot: 'heavy2', role: 'heavy', x: -5.5, z: 2.5 },
  { slot: 'light1', role: 'light', x: -2.5, z: -3 },
  { slot: 'light2', role: 'light', x: -2.5, z: 3 },
]
const TEAMS: Team[] = ['cyan', 'magenta']

export const PIECES: PieceSpec[] = TEAMS.flatMap(team => SLOTS.map(s => ({ id: `${team}-${s.slot}`, team, role: s.role })))

// Cyan's layout, mirrored on x for magenta.
export const KICKOFF: Record<string, { x: number; z: number }> = Object.fromEntries(
  TEAMS.flatMap(team => SLOTS.map(s => [`${team}-${s.slot}`, { x: team === 'cyan' ? s.x : -s.x, z: s.z }])),
)
