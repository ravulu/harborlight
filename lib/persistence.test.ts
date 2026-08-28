import { describe, expect, it } from 'vitest'

import { modeFrom } from '@/lib/persistence'

/**
 * The switch, and the direction it fails in.
 *
 * This is four lines of code and it decides whether a household's finances are
 * written to a database we operate. The failure worth defending against is the
 * silent one: invert the coercion and every deployment that has not set the
 * variable starts storing everything, works perfectly, and says nothing.
 */
describe('the persistence mode', () => {
  it('is cloud only when it is asked for, by name', () => {
    expect(modeFrom('cloud')).toBe('cloud')
  })

  it('is local for anything else at all', () => {
    for (const raw of [
      undefined,
      '',
      'local',
      'Cloud',
      'CLOUD',
      ' cloud',
      'cloud ',
      'db',
      'postgres',
      'true',
      '1',
    ]) {
      expect(modeFrom(raw), `${JSON.stringify(raw)} must not mean cloud`).toBe(
        'local',
      )
    }
  })

  /**
   * Stated as its own case because it is the whole point, and because a future
   * refactor that "tidies" the comparison into something case-insensitive or
   * trimmed would make a typo mean cloud again.
   */
  it('treats a misspelling as local rather than guessing', () => {
    expect(modeFrom('clould')).toBe('local')
    expect(modeFrom('cloud=true')).toBe('local')
  })
})
