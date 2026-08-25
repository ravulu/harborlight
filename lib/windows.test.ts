import { describe, expect, it } from 'vitest'
import { MAX_WINDOWS, openWindows } from '@/lib/windows'
import { DEFAULT_INPUTS, simulate, type PlanInputs } from '@/lib/retirement'
import { MAX_CLAIM_AGE } from '@/lib/social-security'
import { PENALTY_FREE_AGE } from '@/lib/tax'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  ...over,
})

const open = (over: Partial<PlanInputs> = {}) => {
  const p = plan(over)
  return openWindows(p, simulate(p))
}

const keys = (over: Partial<PlanInputs> = {}) => open(over).map((w) => w.key)

describe('openWindows', () => {
  it('never shows more than a card can carry', () => {
    // Every trigger satisfied at once, which is the case that would otherwise
    // produce the wall this cap exists to prevent.
    const all = open({
      currentAge: 50,
      retirementAge: 56,
      balance401k: 500_000,
      traditionalIraBalance: 200_000,
      rothIraBalance: 0,
      socialSecurityMonthly: 2_500,
    })
    expect(all.length).toBeLessThanOrEqual(MAX_WINDOWS)
  })

  it('shows them in priority order, most pressing first', () => {
    const ps = open({ currentAge: 50, retirementAge: 56, balance401k: 500_000 }).map(
      (w) => w.priority,
    )
    expect(ps).toEqual([...ps].sort((a, b) => a - b))
  })

  it('gives every window a date, which is the reason it is on the card', () => {
    for (const w of open({ currentAge: 55, balance401k: 400_000 })) {
      expect(w.window, w.key).not.toBe('')
      expect(w.title, w.key).not.toBe('')
      expect(w.body, w.key).not.toBe('')
    }
  })

  it('is a pure read of the plan and leaves it untouched', () => {
    const p = plan({ currentAge: 50 })
    const before = JSON.stringify(p)
    openWindows(p, simulate(p))
    expect(JSON.stringify(p)).toBe(before)
  })
})

/**
 * Each window is a claim about a rule. A trigger that fires for a household
 * the rule does not apply to is worse than no card at all — it is a confident
 * statement about someone else's life.
 */
describe('what each window is triggered by', () => {
  it('offers no conversion window to a plan with nothing deferred', () => {
    expect(keys({ balance401k: 0, traditionalIraBalance: 0 })).not.toContain(
      'conversion-window',
    )
  })

  it('closes the conversion window once distributions have started', () => {
    // Past RMD age there is no stretch left to talk about.
    expect(keys({ currentAge: 78, retirementAge: 78, balance401k: 500_000 })).not.toContain(
      'conversion-window',
    )
  })

  it('names the rule of 55 only for someone who stops inside it', () => {
    expect(keys({ currentAge: 50, retirementAge: 57, balance401k: 300_000 })).toContain(
      'rule-of-55',
    )
    // Leaving at 54 is too early for the exception and 62 is past needing it.
    expect(keys({ currentAge: 50, retirementAge: 54, balance401k: 300_000 })).not.toContain(
      'rule-of-55',
    )
    expect(keys({ currentAge: 50, retirementAge: 62, balance401k: 300_000 })).not.toContain(
      'rule-of-55',
    )
  })

  it('does not offer the rule of 55 to a plan with no 401(k) to draw on', () => {
    // It is an exception belonging to an employer's plan. An IRA cannot use it.
    expect(
      keys({ currentAge: 50, retirementAge: 57, balance401k: 0, traditionalIraBalance: 400_000 }),
    ).not.toContain('rule-of-55')
  })

  it('stops talking about claiming once the credits have stopped', () => {
    expect(keys({ currentAge: 68, socialSecurityMonthly: 2_000 })).toContain('claiming-range')
    expect(keys({ currentAge: MAX_CLAIM_AGE, socialSecurityMonthly: 2_000 })).not.toContain(
      'claiming-range',
    )
    expect(keys({ currentAge: 60, socialSecurityMonthly: 0 })).not.toContain('claiming-range')
  })

  it('drops the lookback once Medicare has already started', () => {
    expect(keys({ currentAge: 60 })).toContain('irmaa-lookback')
    expect(keys({ currentAge: 66, retirementAge: 66 })).not.toContain('irmaa-lookback')
  })

  it('does not raise the lookback with someone decades away from it', () => {
    // True at 30, but "33 years away" is trivia rather than a deadline, and it
    // would crowd out a window that is actually live.
    expect(keys({ currentAge: 30, retirementAge: 65 })).not.toContain('irmaa-lookback')
    expect(keys({ currentAge: 53 })).toContain('irmaa-lookback')
  })

  it('mentions the Roth clock only where none is running', () => {
    expect(keys({ rothIraBalance: 0, balance401k: 200_000 })).toContain('roth-five-year')
    expect(keys({ rothIraBalance: 50_000, balance401k: 200_000 })).not.toContain(
      'roth-five-year',
    )
  })

  it('mentions QCDs only to someone holding the account they work from', () => {
    // Lowest priority of the six, so it only appears once something above it
    // has dropped out — here, a Roth that already exists. That it is first to
    // be cut is deliberate: it is the narrowest of them, and only matters to
    // someone who gives.
    const room = { currentAge: 60, rothIraBalance: 50_000 }
    expect(keys({ ...room, traditionalIraBalance: 300_000 })).toContain('qcd')
    // The rule is IRA-only, so a 401(k) balance must not trigger it.
    expect(
      keys({ ...room, traditionalIraBalance: 0, balance401k: 300_000 }),
    ).not.toContain('qcd')
    // And 71 is past the door rather than in front of it.
    expect(keys({ ...room, currentAge: 71, traditionalIraBalance: 300_000 })).not.toContain('qcd')
  })
})

/**
 * The section's entire claim is that it states deadlines and stops. Copy that
 * drifts into naming an amount belongs in Suggested Actions, where the
 * alternatives are shown beside it.
 */
describe('the promise the section makes', () => {
  const everything = open({
    currentAge: 50,
    retirementAge: 56,
    balance401k: 500_000,
    traditionalIraBalance: 200_000,
    socialSecurityMonthly: 2_500,
  })

  it('never tells the reader to do anything', () => {
    const directive =
      /\b(you should|we recommend|the best|is best|consider converting|we suggest|you ought)\b/i
    for (const w of everything) {
      expect(directive.test(w.title), `${w.key} title`).toBe(false)
      expect(directive.test(w.body), `${w.key} body`).toBe(false)
      expect(directive.test(w.oneWay ?? ''), `${w.key} oneWay`).toBe(false)
    }
  })

  it('never names a dollar amount, because that is a different card', () => {
    for (const w of everything) {
      expect(w.body, w.key).not.toMatch(/\$[\d,]/)
      expect(w.oneWay ?? '', w.key).not.toMatch(/\$[\d,]/)
    }
  })

  it('keeps the penalty age it quotes tied to the one the projection charges', () => {
    // The rule-of-55 copy is only true up to 59½. If that constant ever moves,
    // this window's whole premise moves with it.
    expect(PENALTY_FREE_AGE).toBe(59.5)
  })
})
