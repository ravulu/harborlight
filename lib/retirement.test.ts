import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INPUTS,
  type PlanInputs,
  monthlySpendingAt,
  simulate,
} from '@/lib/retirement'

/** The default plan, with a state named so the derived tax engine is used. */
const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  taxState: 'CA',
  ...over,
})

/**
 * Invariants rather than fixtures.
 *
 * A projection is a long chain of arithmetic and pinning its output to
 * literals would mean rewriting the test every time a rate moves. What is
 * worth holding is the set of statements that must be true of every row of
 * every plan — the ones the tax tab and the charts read off and present as
 * fact. If one of these breaks, a number on screen is lying.
 */
describe('every row accounts for itself', () => {
  const plans: Array<[string, PlanInputs]> = [
    ['the default plan', plan()],
    ['a plan already in retirement', plan({ currentAge: 68, retirementAge: 68 })],
    [
      'a plan spending down a large brokerage',
      plan({ brokerageBalance: 1_200_000, balance401k: 200_000, currentAge: 60, retirementAge: 62 }),
    ],
    [
      'a married plan with a spouse and a pension',
      plan({
        filingStatus: 'married',
        spouseBenefitMonthly: 1_400,
        spouseClaimAge: 65,
        pensionMonthly: 900,
        pensionStartAge: 65,
      }),
    ],
    [
      'a plan that runs out of money',
      plan({ balance401k: 40_000, brokerageBalance: 0, monthlyRetirementSpending: 9_000 }),
    ],
    [
      'a plan with a hand-entered tax rate',
      plan({ taxState: 'CUSTOM', federalTaxRate: 18, stateTaxRate: 5 }),
    ],
    ['a plan in a state with no income tax', plan({ taxState: 'TX' })],
    [
      'a plan with an employer match and an HSA',
      plan({
        currentAge: 45,
        retirementAge: 65,
        endAge: 88,
        annualSalary: 120_000,
        employerMatchPercent: 100,
        employerMatchLimitPercent: 4,
        hsaBalance: 30_000,
        hsaMonthlyContribution: 250,
      }),
    ],
    [
      'a plan that spends its HSA down',
      plan({
        currentAge: 66,
        retirementAge: 66,
        endAge: 80,
        brokerageBalance: 60_000,
        balance401k: 80_000,
        rothIraBalance: 250_000,
        hsaBalance: 120_000,
        monthlyRetirementSpending: 6_000,
        socialSecurityMonthly: 1_500,
      }),
    ],
  ]

  it.each(plans)('%s', (_label, inputs) => {
    const { rows } = simulate(inputs)
    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      const where = `age ${row.age}`

      // The bill splits exactly two ways, and the halves add to the whole.
      // This is the claim the tax tab makes in prose on every plan.
      expect(row.federalTax + row.stateTax, `taxes split at ${where}`).toBeCloseTo(
        row.taxes,
        6,
      )

      // Every dollar withdrawn came out of one of the three pots, in every
      // year of every plan — including the years after the money runs out,
      // where the answer is that nothing was withdrawn at all.
      const sources =
        row.fromBrokerage + row.fromDeferred + row.fromRoth + row.fromHsa
      expect(sources, `withdrawal sources at ${where}`).toBeCloseTo(row.withdrawals, 4)

      // A shortfall is a figure in its own right, never a withdrawal.
      expect(row.unfunded, `unfunded at ${where}`).toBeGreaterThanOrEqual(0)
      if (row.phase === 'accumulation') {
        expect(row.unfunded, `unfunded at ${where}`).toBe(0)
      }

      // The pots add up to the balance the charts plot.
      expect(
        row.brokerageBalance +
          row.deferredBalance +
          row.rothBalance +
          row.hsaBalance,
        `pot balances at ${where}`,
      ).toBeCloseTo(row.endBalance, 4)

      // The gains half of the federal bill is a part of it, not a figure
      // standing beside it.
      expect(row.federalGainsTax, `gains tax within federal at ${where}`).toBeLessThanOrEqual(
        row.federalTax + 1e-6,
      )

      // At most 85% of the benefit is ever taxable, per Pub 915.
      expect(
        row.taxableSocialSecurity,
        `taxable benefit at ${where}`,
      ).toBeLessThanOrEqual(row.socialSecurity * 0.85 + 1e-6)

      // Nothing anywhere goes negative.
      for (const key of [
        'withdrawals',
        'taxes',
        'federalTax',
        'stateTax',
        'fromBrokerage',
        'fromDeferred',
        'fromRoth',
        'brokerageBalance',
        'deferredBalance',
        'rothBalance',
        'endBalance',
        'socialSecurity',
        'unfunded',
      ] as const) {
        expect(row[key], `${key} at ${where}`).toBeGreaterThanOrEqual(0)
      }

      // Every figure is a number someone could be shown.
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${key} at ${where} is finite`).toBe(true)
        }
      }
    }
  })
})

describe('the shape of a plan', () => {
  it('accumulates then retires, once, in order', () => {
    const { rows } = simulate(plan())
    const phases = rows.map((r) => r.phase)
    const firstRetirement = phases.indexOf('retirement')
    expect(firstRetirement).toBeGreaterThan(0)
    // No going back: everything after the switch is retirement.
    expect(phases.slice(firstRetirement).every((p) => p === 'retirement')).toBe(true)
    expect(rows[firstRetirement].age).toBe(DEFAULT_INPUTS.retirementAge)
  })

  it('never withdraws or taxes during accumulation', () => {
    const { rows } = simulate(plan())
    for (const row of rows.filter((r) => r.phase === 'accumulation')) {
      expect(row.withdrawals).toBe(0)
      expect(row.taxes).toBe(0)
      expect(row.contributions).toBeGreaterThan(0)
    }
  })

  it('reports no depletion age for a plan that comfortably lasts', () => {
    const lasts = simulate(plan({ balance401k: 3_000_000 }))
    expect(lasts.depletionAge).toBeNull()
    expect(lasts.lastsThroughRetirement).toBe(true)
    expect(lasts.rows.every((r) => r.unfunded === 0)).toBe(true)
  })

  /**
   * The regression this pair exists for.
   *
   * Depletion used to be called from `endBalance <= 0`, which never happens:
   * the mid-year growth convention credits return on half of each year's
   * outflow, so a pot drawn to nothing is handed a little back and the
   * balance approaches zero without reaching it. Plans that ran out at 72
   * reported that they lasted, and the summary and confidence badge said so.
   */
  it('reports a depletion age at the first year it cannot fund', () => {
    const result = simulate(
      plan({ balance401k: 40_000, brokerageBalance: 0, monthlyRetirementSpending: 9_000 }),
    )
    expect(result.lastsThroughRetirement).toBe(false)
    expect(result.depletionAge).not.toBeNull()

    // The age reported is the first year with a shortfall, and no year before
    // it had one.
    const firstShort = result.rows.find((r) => r.unfunded > 0)
    expect(result.depletionAge).toBe(firstShort?.age)
    for (const row of result.rows) {
      if (row.age < result.depletionAge!) expect(row.unfunded).toBe(0)
    }
  })

  it('never withdraws more than the pots held', () => {
    const result = simulate(
      plan({ balance401k: 40_000, brokerageBalance: 0, monthlyRetirementSpending: 9_000 }),
    )
    for (const row of result.rows) {
      expect(row.withdrawals, `withdrawal at age ${row.age}`).toBeLessThanOrEqual(
        row.startBalance + 1e-6,
      )
    }

    // The tail is what the fix is for. This plan is broke from 72, and used
    // to go on reporting withdrawals of roughly $83,000 a year out of empty
    // accounts — taxed, charted, and counted into totalTaxes. What is left
    // now is the few pennies the balance actually asymptotes to, against a
    // shortfall that names the whole unmet year.
    for (const row of result.rows.slice(-5)) {
      expect(row.withdrawals, `withdrawal at age ${row.age}`).toBeLessThan(1)
      expect(row.unfunded, `unfunded at age ${row.age}`).toBeGreaterThan(50_000)
    }
  })

  it('pays no benefit before it is claimed, and pays one after', () => {
    const claimAt = 70
    const { rows } = simulate(plan({ socialSecurityAge: claimAt }))
    for (const row of rows.filter((r) => r.age < claimAt)) {
      expect(row.socialSecurity).toBe(0)
    }
    expect(rows.find((r) => r.age === claimAt)?.socialSecurity).toBeGreaterThan(0)
  })

  it('totals what the rows contain', () => {
    const result = simulate(plan())
    const summed = result.rows.reduce((a, r) => a + r.taxes, 0)
    expect(result.totalTaxes).toBeCloseTo(summed, 4)
    expect(result.totalSocialSecurity).toBeCloseTo(
      result.rows.reduce((a, r) => a + r.socialSecurity, 0),
      4,
    )
    expect(result.totalContributions).toBeCloseTo(
      result.rows.reduce((a, r) => a + r.contributions, 0),
      4,
    )
  })
})

describe('the drawdown order', () => {
  it('spends the brokerage before touching the 401(k)', () => {
    const rows = simulate(
      plan({
        currentAge: 65,
        retirementAge: 65,
        brokerageBalance: 600_000,
        balance401k: 600_000,
        rothIraBalance: 200_000,
      }),
    ).rows
      // The order governs what a household chooses to draw. A required
      // distribution is not chosen, so the years it applies to are not
      // evidence either way.
      .filter((r) => r.requiredDistribution === 0)

    const firstDeferred = rows.findIndex((r) => r.fromDeferred > 0)
    const firstRoth = rows.findIndex((r) => r.fromRoth > 0)

    if (firstDeferred > 0) {
      // Nothing came out of the 401(k) while the brokerage still had a
      // balance worth drawing.
      expect(rows[firstDeferred - 1]?.brokerageBalance ?? 0).toBeLessThan(1_000)
    }
    if (firstRoth >= 0 && firstDeferred >= 0) {
      expect(firstRoth).toBeGreaterThanOrEqual(firstDeferred)
    }
  })

  it('taxes a Roth-only plan at nothing', () => {
    const { rows } = simulate(
      plan({
        currentAge: 68,
        retirementAge: 68,
        brokerageBalance: 0,
        balance401k: 0,
        traditionalIraBalance: 0,
        rothIraBalance: 1_500_000,
        socialSecurityMonthly: 0,
      }),
    )
    for (const row of rows.filter((r) => r.phase === 'retirement')) {
      expect(row.taxes).toBe(0)
    }
  })
})

describe('monthlySpendingAt', () => {
  const stepped = plan({
    monthlyRetirementSpending: 4_000,
    spendingStep1Age: 75,
    spendingStep1Monthly: 3_000,
    spendingStep2Age: 85,
    spendingStep2Monthly: 5_000,
  })

  it('holds the base figure until the first step', () => {
    expect(monthlySpendingAt(stepped, 70)).toBe(4_000)
    expect(monthlySpendingAt(stepped, 74)).toBe(4_000)
  })

  it('takes each step from the age it is set at', () => {
    expect(monthlySpendingAt(stepped, 75)).toBe(3_000)
    expect(monthlySpendingAt(stepped, 84)).toBe(3_000)
    expect(monthlySpendingAt(stepped, 85)).toBe(5_000)
    expect(monthlySpendingAt(stepped, 95)).toBe(5_000)
  })

  it('ignores a step set to zero, which is what "no step" means', () => {
    const flat = plan({ monthlyRetirementSpending: 4_000, spendingStep1Monthly: 0 })
    for (const age of [65, 75, 85, 90]) {
      expect(monthlySpendingAt(flat, age)).toBe(4_000)
    }
  })
})

/**
 * Required minimum distributions.
 *
 * A slice of last year's closing deferred balance has to come out each year
 * from the start age, whether or not the household wants the money. Before
 * this was modelled the projection drew only what was spent, so a plan with a
 * large 401(k) reported paying no tax at all on it.
 */
describe('required minimum distributions', () => {
  const bigDeferred = plan({
    currentAge: 80,
    retirementAge: 80,
    endAge: 92,
    balance401k: 2_000_000,
    brokerageBalance: 0,
    rothIraBalance: 0,
    monthlyRetirementSpending: 1_000,
    socialSecurityMonthly: 3_000,
    socialSecurityAge: 67,
  })

  it('forces a distribution even when income already covers the spending', () => {
    const { rows } = simulate(bigDeferred)
    const retired = rows.filter((r) => r.phase === 'retirement')

    // Social Security covers the $12,000 of spending outright, so under the
    // old behaviour nothing was withdrawn and nothing was taxed.
    expect(retired.every((r) => r.requiredDistribution > 0)).toBe(true)
    expect(retired.every((r) => r.fromDeferred > 0)).toBe(true)
    expect(retired.every((r) => r.taxes > 0)).toBe(true)
  })

  it('sizes the first one off the balance carried into the year', () => {
    const { rows } = simulate(bigDeferred)
    const first = rows[0]
    // $2,000,000 at 80 divides by 20.2.
    expect(first.requiredDistribution).toBeCloseTo(2_000_000 / 20.2, 0)
    // Nothing else is drawn, because nothing else is needed.
    expect(first.withdrawals).toBeCloseTo(first.requiredDistribution, 0)
  })

  it('moves the leftover into the brokerage rather than losing it', () => {
    const { rows } = simulate(bigDeferred)
    for (const row of rows) {
      expect(row.surplus, `surplus at ${row.age}`).toBeGreaterThan(0)
    }
    // The taxable account grows out of nothing, funded entirely by the part
    // of the distributions the household did not need to spend.
    expect(rows[0].brokerageBalance).toBeGreaterThan(0)
    const last = rows.at(-1)!
    expect(last.brokerageBalance).toBeGreaterThan(rows[0].brokerageBalance)
    // And the sheltered balance falls, which is the point of the rule.
    expect(last.deferredBalance).toBeLessThan(2_000_000)
  })

  it('starts at the age the birth year sets, not before', () => {
    // Born 1966, so distributions begin at 75.
    const { rows } = simulate(
      plan({
        currentAge: 60,
        retirementAge: 60,
        endAge: 80,
        balance401k: 1_500_000,
        brokerageBalance: 500_000,
        rothIraBalance: 0,
        monthlyRetirementSpending: 2_000,
      }),
    )
    for (const row of rows) {
      if (row.age < 75) expect(row.requiredDistribution, `age ${row.age}`).toBe(0)
      else expect(row.requiredDistribution, `age ${row.age}`).toBeGreaterThan(0)
    }
  })

  it('takes a rising share of the deferred balance as the years pass', () => {
    const { rows } = simulate(bigDeferred)
    // Measured against the deferred pot the distribution is due from, not
    // against the whole plan: the brokerage is meanwhile growing out of the
    // surplus, so the share of total savings can fall while the share of the
    // account being emptied rises. It is the second that the table governs.
    const shares = rows
      .slice(1)
      .map((r, i) => r.requiredDistribution / rows[i].deferredBalance)
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i], `age ${rows[i + 1].age}`).toBeGreaterThan(shares[i - 1])
    }
  })

  it('never forces more out than the account holds', () => {
    const { rows } = simulate(
      plan({
        currentAge: 88,
        retirementAge: 88,
        endAge: 95,
        balance401k: 20_000,
        brokerageBalance: 0,
        rothIraBalance: 0,
        monthlyRetirementSpending: 6_000,
      }),
    )
    for (const row of rows) {
      expect(row.fromDeferred, `age ${row.age}`).toBeLessThanOrEqual(
        row.startBalance + 1e-6,
      )
    }
  })

  it('reports no surplus at all on a plan with no distributions due', () => {
    // The column in the yearly table keys off this, so a few spurious cents
    // from the fixed point would put a row of near-zeroes in front of every
    // reader whose plan has nothing to do with distributions.
    const { rows } = simulate(
      plan({
        currentAge: 62,
        retirementAge: 62,
        endAge: 72,
        balance401k: 800_000,
        brokerageBalance: 200_000,
      }),
    )
    for (const row of rows) {
      expect(row.requiredDistribution, `age ${row.age}`).toBe(0)
      expect(row.surplus, `age ${row.age}`).toBe(0)
    }
  })

  it('costs a plan real tax it did not pay before', () => {
    const withRmd = simulate(bigDeferred)
    expect(withRmd.totalTaxes).toBeGreaterThan(100_000)
  })
})

/**
 * The 10% additional tax under IRC §72(t), charged on a tax-deferred
 * withdrawal taken before 59½.
 *
 * `PENALTY_FREE_AGE` and the tax tab's prose have always named it; nothing
 * charged it, so a plan that retired at 55 was projected at a rate it could
 * not have achieved.
 */
describe('the early-withdrawal penalty', () => {
  const earlyRetirement = plan({
    currentAge: 55,
    retirementAge: 55,
    endAge: 66,
    balance401k: 900_000,
    brokerageBalance: 0,
    rothIraBalance: 0,
    socialSecurityMonthly: 0,
    monthlyRetirementSpending: 4_000,
    taxState: 'TX',
  })

  it('charges a tenth of the deferred draw before 59½', () => {
    const { rows } = simulate(earlyRetirement)
    for (const row of rows.filter((r) => r.age < 59.5)) {
      expect(row.earlyWithdrawalPenalty, `age ${row.age}`).toBeCloseTo(
        row.fromDeferred * 0.1,
        4,
      )
    }
  })

  it('stops charging it from 60 on', () => {
    const { rows } = simulate(earlyRetirement)
    for (const row of rows.filter((r) => r.age >= 59.5)) {
      expect(row.earlyWithdrawalPenalty, `age ${row.age}`).toBe(0)
    }
  })

  it('grosses the withdrawal up to cover it, so spending is still met', () => {
    const { rows } = simulate(earlyRetirement)
    for (const row of rows.filter((r) => r.phase === 'retirement')) {
      // The whole point of solving for it: net of every charge, the year
      // still delivers what the plan meant to spend. Compared against
      // `spending`, which like every flow on the row is in today's dollars —
      // `spendingThatYear` is the same figure inflated to the dollars of the
      // year, and is the one column that is not.
      expect(row.withdrawals - row.taxes, `age ${row.age}`).toBeCloseTo(
        row.spending,
        0,
      )
    }
  })

  it('makes the early years visibly more expensive than the later ones', () => {
    const { rows } = simulate(earlyRetirement)
    const rate = (r: (typeof rows)[number]) => r.taxes / r.withdrawals
    const at55 = rows.find((r) => r.age === 55)!
    const at60 = rows.find((r) => r.age === 60)!
    expect(rate(at55)).toBeGreaterThan(rate(at60) + 0.09)
    expect(at60.withdrawals).toBeLessThan(at55.withdrawals)
  })

  it('is counted inside the federal bill, not beside it', () => {
    const { rows } = simulate(earlyRetirement)
    for (const row of rows.filter((r) => r.earlyWithdrawalPenalty > 0)) {
      expect(row.earlyWithdrawalPenalty).toBeLessThan(row.federalTax)
      expect(row.federalTax + row.stateTax).toBeCloseTo(row.taxes, 6)
    }
  })

  it('charges nothing on a brokerage or Roth draw at the same age', () => {
    const { rows } = simulate(
      plan({
        ...earlyRetirement,
        balance401k: 0,
        brokerageBalance: 500_000,
        rothIraBalance: 400_000,
      }),
    )
    for (const row of rows) {
      expect(row.earlyWithdrawalPenalty, `age ${row.age}`).toBe(0)
    }
  })
})
