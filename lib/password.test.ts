import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MIN,
  PASSWORD_RULES,
  failedRules,
  isPasswordAcceptable,
  passwordProblem,
} from '@/lib/password'

describe('what counts as a password', () => {
  it('takes one that meets every rule', () => {
    expect(isPasswordAcceptable('Harbour7!')).toBe(true)
    expect(passwordProblem('Harbour7!')).toBeNull()
    expect(failedRules('Harbour7!')).toEqual([])
  })

  it('turns down each rule on its own', () => {
    // One near-miss per rule, so a rule that stops being checked fails here
    // rather than quietly letting a weaker password through.
    const cases: [string, string][] = [
      ['Harb7!', 'length'],
      ['harbour7!', 'upper'],
      ['HARBOUR7!', 'lower'],
      ['Harbourss!', 'number'],
      ['Harbour77', 'symbol'],
    ]
    for (const [password, ruleId] of cases) {
      const failed = failedRules(password)
      expect(failed.map((r) => r.id), password).toEqual([ruleId])
      expect(isPasswordAcceptable(password), password).toBe(false)
    }
  })

  it('names everything missing at once, not the first thing', () => {
    // Four rejections for four reasons in turn is the same password four
    // times, and the reader learns the rule one humiliation at a time.
    // Empty is the only string that fails all five — "short" is already
    // lowercase, so it cannot be used to show the lowercase rule firing.
    const problem = passwordProblem('')!
    expect(problem).toContain('at least 8 characters')
    expect(problem).toContain('an uppercase letter')
    expect(problem).toContain('a lowercase letter')
    expect(problem).toContain('a number')
    expect(problem).toContain('a symbol')
    expect(problem.endsWith('.')).toBe(true)
  })

  it('reads as a sentence whether one rule fails or several', () => {
    expect(passwordProblem('Harbour77')).toBe(
      'Your password needs a symbol, such as ! ? # or -.',
    )
    expect(passwordProblem('harbour77')).toBe(
      'Your password needs an uppercase letter and a symbol, such as ! ? # or -.',
    )
    // Uppercase alone is not enough: requiring one case and not the other
    // lets PASSWORD1! through, which is not what a case rule is for.
    expect(passwordProblem('HARBOUR77!')).toBe(
      'Your password needs a lowercase letter.',
    )
  })

  it('counts anything that is not a letter or a digit as a symbol', () => {
    // Naming a permitted set is how a rule ends up rejecting the character
    // somebody's password manager has just generated.
    for (const symbol of ['!', '?', '#', '-', '_', '£', '§', ' ', '·', '\\']) {
      expect(isPasswordAcceptable(`Harbour7${symbol}`), symbol).toBe(true)
    }
  })

  it('holds the floor at the number the server is configured with', () => {
    expect(PASSWORD_MIN).toBe(8)
    expect(isPasswordAcceptable('Harb7!aa')).toBe(true)
    expect(isPasswordAcceptable('Harb7!a')).toBe(false)
  })

  it('lets a long passphrase through without being clever about it', () => {
    // Length beats character classes, and a rule set that turns away
    // "correct horse battery staple" teaches people to write P@ssw0rd1.
    expect(isPasswordAcceptable('Correct horse battery staple 7')).toBe(true)
  })

  it('keeps rule ids stable, because the list is keyed by them', () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual([
      'length',
      'upper',
      'lower',
      'number',
      'symbol',
    ])
  })
})
