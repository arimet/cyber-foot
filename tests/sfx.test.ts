import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()

describe('sfx', () => {
  beforeEach(() => {
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

  it('works without storage at all', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    const { setMuted, isMuted } = await import('../src/audio/sfx')
    expect(isMuted()).toBe(false)
    expect(() => setMuted(true)).not.toThrow()
  })
})
