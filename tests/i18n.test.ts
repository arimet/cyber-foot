import { describe, expect, it } from 'vitest'
import { DICT, detectLang } from '../src/ui/i18n'

describe('i18n', () => {
  it('a saved choice wins', () => {
    expect(detectLang('en', ['fr-FR'])).toBe('en')
    expect(detectLang('fr', ['en-US'])).toBe('fr')
  })

  it('French browsers get French, others English', () => {
    expect(detectLang(null, ['fr-CA'])).toBe('fr')
    expect(detectLang(null, ['de-DE', 'fr'])).toBe('fr')
    expect(detectLang(null, ['de-DE'])).toBe('en')
    expect(detectLang('xx', [])).toBe('en')
  })

  it('both dictionaries have the same keys', () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.fr).sort())
  })
})
