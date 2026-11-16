import { GOAL_DEPTH, TABLE_HALF_LENGTH, TABLE_HALF_WIDTH } from '../game/constants'

// Where the camera looks: on the ball, but never so far that the view leaves the table (zoom 1 = whole table).
export function framedFocus(ballX: number, ballZ: number, zoom: number): { x: number; z: number } {
  const slack = 1 - 1 / zoom
  const mx = (TABLE_HALF_LENGTH + GOAL_DEPTH) * slack, mz = TABLE_HALF_WIDTH * slack
  return { x: Math.max(-mx, Math.min(mx, ballX)) || 0, z: Math.max(-mz, Math.min(mz, ballZ)) || 0 }
}
