import type { GameScene } from './render/scene'

type P = { x: number; z: number }
export type InputHandlers = {
  pick(p: P, under: string[]): string | null
  aim(id: string, p: P): void
  release(id: string, p: P): void
  cancel(): void
}

// One pointer path for mouse and touch: press on a piece, pull back, let go.
export function bindInput(canvas: HTMLCanvasElement, scene: GameScene, h: InputHandlers): void {
  let active: { id: string; pointer: number } | null = null
  const at = (e: PointerEvent) => scene.tableHit(e.clientX, e.clientY)

  canvas.addEventListener('pointerdown', e => {
    if (active) return
    const p = at(e)
    const id = p && h.pick(p, scene.piecesAt(e.clientX, e.clientY))
    if (!id) return
    active = { id, pointer: e.pointerId }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', e => {
    const p = at(e)
    if (active && e.pointerId === active.pointer && p) h.aim(active.id, p)
  })
  canvas.addEventListener('pointerup', e => {
    if (!active || e.pointerId !== active.pointer) return
    const { id } = active
    active = null
    const p = at(e)
    if (p) h.release(id, p)
    else h.cancel()
  })
  const abort = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.pointer) return
    active = null
    h.cancel()
  }
  canvas.addEventListener('pointercancel', abort)
  canvas.addEventListener('lostpointercapture', abort)
}
