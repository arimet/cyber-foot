import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

describe('sfx', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })

  it('muting is remembered', async () => {
    const { setMuted, isMuted } = await import('../src/audio/sfx')
    setMuted(true)
    expect(store.get('cyber-foot:muted')).toBe('1')
    expect(isMuted()).toBe(true)
    vi.resetModules()
    expect((await import('../src/audio/sfx')).isMuted()).toBe(true)
  })

  it('sounds are silent and harmless without Web Audio', async () => {
    const { sfx, unlockAudio } = await import('../src/audio/sfx')
    expect(() => {
      unlockAudio()
      sfx.shot(1)
      sfx.hit(3)
      sfx.ball(2)
      sfx.rail(2)
      sfx.goal()
      sfx.win()
      sfx.tip()
    }).not.toThrow()
  })

  it('unlocking resumes a context the system interrupted (iOS after a call)', async () => {
    let resumed = 0
    class FakeContext {
      state = 'interrupted'
      currentTime = 0
      destination = {}
      createGain() { return { gain: { value: 0 }, connect: () => ({}) } }
      resume() { resumed++; this.state = 'running'; return Promise.resolve() }
    }
    vi.stubGlobal('AudioContext', FakeContext)
    const { unlockAudio, audioRunning } = await import('../src/audio/sfx')
    unlockAudio()
    expect(resumed).toBe(1)
    expect(audioRunning()).toBe(true)
  })

  it('works without storage at all', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    const { setMuted, isMuted } = await import('../src/audio/sfx')
    expect(isMuted()).toBe(false)
    expect(() => setMuted(true)).not.toThrow()
  })
})
