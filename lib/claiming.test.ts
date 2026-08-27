import { describe, expect, it } from 'vitest'
import { compareClaiming, crossoverAge, textbookCrossover } from '@/lib/claiming'
import { DEFAULT_INPUTS, simulate, type PlanInputs } from '@/lib/retirement'
import {
  MIN_CLAIM_AGE,
  MAX_CLAIM_AGE,
  FULL_RETIREMENT_AGE,
  benefitFactor,
} from '@/lib/social-security'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  currentAge: 53,
  retirementAge: 65,
  endAge: 92,
  brokerageBalance: 100_000,
  balance401k: 400_000,
  traditionalIraBalance: 0,
  rothIraBalance: 0,
  monthlyContribution: 1_000,
  monthlyRetirementSpending: 7_100,
  socialSecurityMonthly: 5_000,
  socialSecurityAge: 67,
  ...over,
})

describe('textbookCrossover', () => {
  /**
   * These are the figures every article on claiming quotes. If this function
   * ever stops reproducing them it has stopped being the thing the card
   * contrasts its own answer against, and the contrast is the whole point.
   */
  it('reproduces the published break-even ages', () => {
    expect(textbookCrossover(62, 67)).toBeCloseTo(78.7, 1)
    expect(textbookCrossover(62, 70)).toBeCloseTo(80.4, 1)
    expect(textbookCrossover(67, 70)).toBeCloseTo(82.5, 1)
  })

  it('is the age where the two cumulative streams are equal', () => {
    // Checked from the definition rather than the formula, so an algebra slip
    // in the formula cannot pass.
    const t = textbookCrossover(62, 70)
    const paid = (claim: number) => benefitFactor(claim) * (t - claim)
    expect(paid(62)).toBeCloseTo(paid(70), 6)
  })
})

describe('compareClaiming', () => {
  it('says nothing to a plan with no benefit to claim', () => {
    expect(compareClaiming(plan({ socialSecurityMonthly: 0 }))).toBeNull()
  })

  it('says nothing once the decision has passed', () => {
    expect(compareClaiming(plan({ currentAge: MAX_CLAIM_AGE }))).toBeNull()
  })

  it('never offers an age the household is already past', () => {
    const c = compareClaiming(plan({ currentAge: 66, retirementAge: 66 }))!
    expect(Math.min(...c.options.map((o) => o.age))).toBeGreaterThanOrEqual(66)
  })

  it('keeps every option inside the range the law allows', () => {
    for (const o of compareClaiming(plan())!.options) {
      expect(o.age).toBeGreaterThanOrEqual(MIN_CLAIM_AGE)
      expect(o.age).toBeLessThanOrEqual(MAX_CLAIM_AGE)
    }
  })

  it('marks exactly one row as the plan as it stands, with no delta', () => {
    const c = compareClaiming(plan({ socialSecurityAge: 67 }))!
    const current = c.options.filter((o) => o.current)
    expect(current).toHaveLength(1)
    expect(current[0].age).toBe(67)
    expect(current[0].deltaEnd).toBeCloseTo(0, 6)
  })

  it('reads the entered benefit as the amount due at full retirement age', () => {
    // The input is labelled "Monthly benefit at 67" and the projection applies
    // the claim-age factor itself. Scaling it again here would show every row
    // a benefit adjusted twice, which is what this originally did.
    const c = compareClaiming(plan({ socialSecurityMonthly: 5_000 }))!
    const atFra = c.options.find((o) => o.age === FULL_RETIREMENT_AGE)!
    expect(atFra.monthly).toBeCloseTo(5_000, 6)
    expect(c.options.find((o) => o.age === 62)!.monthly).toBeCloseTo(3_500, 6)
    expect(c.options.find((o) => o.age === 70)!.monthly).toBeCloseTo(6_200, 6)
  })

  it('agrees with the projection it claims to be reporting', () => {
    const p = plan()
    for (const o of compareClaiming(p)!.options) {
      const rows = simulate({ ...p, socialSecurityAge: o.age }).rows
      expect(o.endBalance).toBeCloseTo(rows[rows.length - 1].endBalance, 4)
    }
  })

  it('matches the year-by-year table to the dollar, as the card promises', () => {
    // The glossary tells the reader they can check the highlighted row against
    // the last line of the Table tab and it will agree exactly. That is a
    // checkable promise, so it is checked here — the Table tab renders
    // `simulate(inputs).rows`, which is what this compares against.
    const p = plan()
    const rows = simulate(p).rows
    const shown = compareClaiming(p)!.options.find((o) => o.current)!
    expect(shown.endBalance).toBe(rows[rows.length - 1].endBalance)
  })

  it('leaves the plan it was given untouched', () => {
    const p = plan()
    const before = JSON.stringify(p)
    compareClaiming(p)
    expect(JSON.stringify(p)).toBe(before)
  })

  it('flags a married plan as having an unpriced survivor benefit', () => {
    // The card's loudest paragraph is gated on this. A couple shown the table
    // without it is being misled by omission.
    expect(compareClaiming(plan({ filingStatus: 'married' }))!.survivorUnpriced).toBe(true)
    expect(compareClaiming(plan({ filingStatus: 'single' }))!.survivorUnpriced).toBe(false)
  })
})

/**
 * The reason this card exists rather than a quoted constant.
 */
describe('the crossover this plan actually has', () => {
  it('lands later than the published figure, because waiting is paid for from savings', () => {
    const p = plan()
    const mine = crossoverAge(p, 67, 70)
    expect(mine).not.toBeNull()
    // Not asserting the exact age — returns and spending move it, and pinning
    // it would make this a change-detector. The direction is the finding.
    expect(mine!).toBeGreaterThan(textbookCrossover(67, 70))
  })

  it('is a genuine crossing: behind before it, ahead after', () => {
    const p = plan()
    const at = (claim: number, endAge: number) => {
      const rows = simulate({ ...p, socialSecurityAge: claim, endAge }).rows
      return rows[rows.length - 1].endBalance
    }
    const x = crossoverAge(p, 67, 70)!
    expect(at(70, x)).toBeGreaterThanOrEqual(at(67, x))
    expect(at(70, x - 1)).toBeLessThan(at(67, x - 1))
  })

  it('reports nothing rather than a number when waiting never catches up', () => {
    // A large married household whose benefit is small beside the pot, so the
    // savings spent bridging to 70 outweigh the larger cheque at every age up
    // to 100. Returning the search bound here would be a fabricated finding.
    //
    // The benefit had to come down to keep this true. On $3,000 and $2,000 the
    // same household used to have no crossover and now has one at 98, and the
    // reason is the IRMAA fade (`PREMIUM_EXCESS_FADES_BY`): bridging to 70 is
    // paid for out of the 401(k), which raises MAGI, which used to be charged
    // a surcharge growing 3.5 points over inflation for sixty straight years.
    // That assumption, not the claiming arithmetic, was what kept waiting
    // permanently behind. Worth knowing that the two interact at all.
    const rich = plan({
      currentAge: 30,
      retirementAge: 65,
      endAge: 90,
      filingStatus: 'married',
      brokerageBalance: 3_000_000,
      balance401k: 1_000_000,
      monthlyContribution: 0,
      monthlyRetirementSpending: 20_000,
      socialSecurityMonthly: 2_000,
      spouseBenefitMonthly: 1_300,
    })
    expect(crossoverAge(rich, 67, 70)).toBeNull()
    // The same household with a benefit worth waiting for does cross, which is
    // what shows the null above is a property of the plan and not of the
    // search giving up.
    expect(
      crossoverAge({ ...rich, socialSecurityMonthly: 3_000, spouseBenefitMonthly: 2_000 }, 67, 70),
    ).not.toBeNull()
  })

  it('refuses a comparison that runs backwards', () => {
    expect(crossoverAge(plan(), 70, 67)).toBeNull()
    expect(crossoverAge(plan(), 67, 67)).toBeNull()
  })
})
