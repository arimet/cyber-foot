// Sound effects synthesised with Web Audio (no files). Silent when Web Audio is missing or muted.
const MUTE_KEY = 'cyber-foot:muted'
const MAX_PER_FRAME = 6

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } })()
let frameCount = 0, frameTime = -1

function audio(): { ac: AudioContext; out: GainNode } | null {
  if (muted) return null
  if (!ctx) {
    const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state !== 'running') void ctx.resume() // 'suspended' before a gesture, 'interrupted' on iOS after a call
  // a pile-up of contacts in one frame would just be noise
  if (ctx.currentTime !== frameTime) [frameTime, frameCount] = [ctx.currentTime, 0]
  if (++frameCount > MAX_PER_FRAME) return null
  return { ac: ctx, out: master! }
}

// Browsers only start audio after a user gesture.
export function unlockAudio() {
  if (!muted) audio()
}

export const audioRunning = () => ctx?.state === 'running'
export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* not persisted */ }
}

const vol = (strength: number, scale: number, max = 0.35) => Math.min(max, strength * scale)

function tone(type: OscillatorType, from: number, to: number, dur: number, volume = 0.3, delay = 0) {
  const a = audio()
  if (!a) return
  const t = a.ac.currentTime + delay
  const o = a.ac.createOscillator(), g = a.ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, from: number, to: number, volume: number, type: BiquadFilterType = 'bandpass', delay = 0) {
  const a = audio()
  if (!a) return
  const t = a.ac.currentTime + delay
  const buf = a.ac.createBuffer(1, Math.ceil(a.ac.sampleRate * dur), a.ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = a.ac.createBufferSource(), f = a.ac.createBiquadFilter(), g = a.ac.createGain()
  src.buffer = buf
  f.type = type
  f.Q.value = 0.8
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.02, dur * 0.3))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.out)
  src.start(t)
}

export const sfx = {
  // rising "whee", higher with power
  shot: (power: number) => tone('sawtooth', 180, 380 + power * 700, 0.18 + power * 0.1, 0.12),
  // dull thud between figures
  hit: (strength: number) => noise(0.12, 260, 90, vol(strength, 0.06), 'lowpass'),
  // "tok" of the ball
  ball: (strength: number) => tone('square', 900, 520, 0.05, vol(strength, 0.04, 0.2)),
  // metallic click on the rails
  rail: (strength: number) => tone('triangle', 2200, 1500, 0.04, vol(strength, 0.03, 0.15)),
  // arpeggio and a crowd's whoosh
  goal() {
    ;[392, 523, 659, 784, 1047].forEach((f, i) => tone('sawtooth', f, f, 0.18, 0.12, i * 0.07))
    noise(1.4, 500, 1800, 0.25, 'bandpass', 0.05)
  },
  win() {
    ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.24, 0.2, i * 0.13))
  },
  // magnetic "zip": a piece catches the ball
  catch: () => tone('sine', 300, 1200, 0.16, 0.14),
  // falling "bloop" when a figure goes down
  tip: () => tone('sine', 520, 140, 0.3, 0.2),
}
