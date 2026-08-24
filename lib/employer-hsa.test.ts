import { describe, expect, it } from 'vitest'
import { buildInsights } from '@/lib/insights'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { DEFAULT_INPUTS, type PlanInputs, simulate } from '@/lib/retirement'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  taxState: 'CA',
  ...over,
})

/**
 * The employer match.
 *
 * It was insight prose for a long time — a card telling everyone the same
 * thing, because nothing in the plan knew what anyone's match was. Computing
 * it needs the salary and the limit as well as the contribution: a match is a
 * share of pay up to a line, so contributing past that line earns nothing more
 * and contributing under it leaves money behind.
 */
describe('the employer match', () => {
  const matched = (monthly: number) =>
    simulate(
      plan({
        currentAge: 40,
        retirementAge: 65,
        endAge: 88,
        monthlyContribution: monthly,
        annualSalary: 100_000,
        employerMatchPercent: 50,
        employerMatchLimitPercent: 6,
      }),
    )

  it('is nothing at all when no arrangement is stated', () => {
    const none = simulate(plan({ currentAge: 40, retirementAge: 65 }))
    expect(none.totalEmployerMatch).toBe(0)
    expect(none.matchLeftBehind).toBe(0)
    expect(none.rows.every((r) => r.employerMatch === 0)).toBe(true)
  })

  it('pays half of what you put in, up to the limit', () => {
    // $100,000 of pay at 6% is $6,000 matchable; half of that is $3,000.
    const full = matched(500) // $6,000 a year, exactly the limit
    const first = full.rows[0]
    expect(first.employerMatch).toBeCloseTo(3_000, 0)
    expect(full.matchLeftBehind).toBe(0)
  })

  it('stops at the limit however much more you contribute', () => {
    const atLimit = matched(500).rows[0].employerMatch
    const wayOver = matched(1_500).rows[0].employerMatch
    expect(wayOver).toBeCloseTo(atLimit, 6)
  })

  it('says what a smaller contribution leaves behind', () => {
    // $2,400 contributed against $6,000 matchable: $3,600 unmatched, and half
    // of that — $1,800 — is money the employer would have paid.
    expect(matched(200).matchLeftBehind).toBeCloseTo(1_800, 0)
    expect(matched(250).matchLeftBehind).toBeCloseTo(1_500, 0)
    expect(matched(500).matchLeftBehind).toBe(0)
  })

  it('stops when the working years do', () => {
    const { rows } = matched(500)
    for (const row of rows) {
      if (row.phase === 'retirement') expect(row.employerMatch, `age ${row.age}`).toBe(0)
      else expect(row.employerMatch, `age ${row.age}`).toBeGreaterThan(0)
    }
  })

  it('lands in the 401(k) and grows there', () => {
    const withMatch = matched(500)
    const without = simulate(
      plan({
        currentAge: 40,
        retirementAge: 65,
        endAge: 88,
        monthlyContribution: 500,
      }),
    )
    const a = withMatch.rows.find((r) => r.age === 64)!
    const b = without.rows.find((r) => r.age === 64)!
    expect(a.deferredBalance).toBeGreaterThan(b.deferredBalance)
    // And it is not counted as the household's own saving.
    expect(withMatch.totalContributions).toBeCloseTo(without.totalContributions, 4)
  })

  it('is worth more than the contribution that earned it', () => {
    // The point of the card: a 50% match is an immediate 50% return, which
    // nothing else in the plan pays.
    const first = matched(500).rows[0]
    expect(first.employerMatch / first.contributions).toBeCloseTo(0.5, 6)
  })
})

/**
 * The HSA.
 *
 * Taxed at neither end when it pays for care, which nothing else is. Modelled
 * as a pot of its own rather than folded into the Roth because nothing is ever
 * forced out of it, and because it is the one earmarked for the medical costs
 * retirement brings — which is why the plan spends it before the Roth.
 */
describe('the HSA', () => {
  const spender = plan({
    currentAge: 66,
    retirementAge: 66,
    endAge: 80,
    brokerageBalance: 60_000,
    balance401k: 80_000,
    rothIraBalance: 250_000,
    hsaBalance: 120_000,
    monthlyRetirementSpending: 6_000,
    socialSecurityMonthly: 1_500,
    socialSecurityAge: 67,
  })

  it('is absent from a plan that has none', () => {
    const { rows } = simulate(plan({ currentAge: 66, retirementAge: 66 }))
    for (const row of rows) {
      expect(row.hsaBalance).toBe(0)
      expect(row.fromHsa).toBe(0)
      expect(row.hsaContribution).toBe(0)
    }
  })

  it('grows on contributions while working', () => {
    const { rows } = simulate(
      plan({
        currentAge: 40,
        retirementAge: 65,
        hsaBalance: 20_000,
        hsaMonthlyContribution: 300,
      }),
    )
    expect(rows[0].hsaContribution).toBeCloseTo(3_600, 6)
    const atRetirement = rows.find((r) => r.age === 64)!
    expect(atRetirement.hsaBalance).toBeGreaterThan(20_000)
    // Contributions stop when work does.
    expect(rows.find((r) => r.age === 70)?.hsaContribution ?? 0).toBe(0)
  })

  it('counts towards the balance the plan reports', () => {
    const { rows } = simulate(spender)
    for (const row of rows) {
      expect(
        row.brokerageBalance + row.deferredBalance + row.rothBalance + row.hsaBalance,
        `age ${row.age}`,
      ).toBeCloseTo(row.endBalance, 4)
    }
  })

  it('is emptied before the Roth is touched', () => {
    const { rows } = simulate(spender)
    // Compared against the balance carried into the year, not the one left at
    // the end of it: a pot drawn to nothing still keeps the sliver of mid-year
    // growth every other pot does.
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (row.fromRoth <= 1) continue
      const carriedIn = rows[i - 1].hsaBalance
      expect(row.fromHsa, `age ${row.age}`).toBeGreaterThanOrEqual(carriedIn - 1)
    }
    // And it really is spent — this plan is not one that leaves it untouched.
    expect(rows.some((r) => r.fromHsa > 1_000)).toBe(true)
  })

  it('costs nothing in tax when it is the only thing drawn', () => {
    const { rows } = simulate(spender)
    const untaxedOnly = rows.filter(
      (r) => r.fromHsa > 1 && r.fromDeferred < 1 && r.fromBrokerage < 1,
    )
    expect(untaxedOnly.length).toBeGreaterThan(0)
    for (const row of untaxedOnly) {
      expect(row.taxes, `age ${row.age}`).toBeCloseTo(0, 6)
    }
  })

  it('is never forced out, unlike the 401(k)', () => {
    const { rows } = simulate(
      plan({
        currentAge: 80,
        retirementAge: 80,
        endAge: 90,
        balance401k: 0,
        brokerageBalance: 0,
        rothIraBalance: 0,
        hsaBalance: 500_000,
        monthlyRetirementSpending: 1_000,
        socialSecurityMonthly: 3_000,
        socialSecurityAge: 67,
      }),
    )
    for (const row of rows) {
      expect(row.requiredDistribution, `age ${row.age}`).toBe(0)
      expect(row.fromHsa, `age ${row.age}`).toBe(0)
    }
  })

  it('leaves every per-row invariant standing', () => {
    for (const row of simulate(spender).rows) {
      expect(row.federalTax + row.stateTax).toBeCloseTo(row.taxes, 6)
      expect(
        row.fromBrokerage + row.fromDeferred + row.fromRoth + row.fromHsa,
      ).toBeCloseTo(row.withdrawals, 4)
      expect(Number.isFinite(row.hsaBalance)).toBe(true)
    }
  })
})

/**
 * The two cards this phase existed to fix.
 *
 * Both used to say the same thing to everyone, because nothing in the plan
 * knew anyone's terms. They now read the figures — and when the figures are
 * absent they say so and ask, rather than pretending to a finding.
 */
describe('the insight cards', () => {
  const cardFor = (inputs: PlanInputs, key: string) =>
    buildInsights(inputs, simulate(inputs), runMonteCarlo(inputs, 300)).find(
      (i) => i.key === key,
    )

  const worker = plan({
    currentAge: 40,
    retirementAge: 65,
    endAge: 88,
    monthlyContribution: 200,
    annualSalary: 100_000,
    employerMatchPercent: 50,
    employerMatchLimitPercent: 6,
  })

  it('names the money being left behind, and what to raise the contribution to', () => {
    const card = cardFor(worker, 'match')!
    expect(card.title).toMatch(/leaving \$1,800 a year/)
    // The contribution that would collect all of it: $6,000 a year, $500 a month.
    expect(card.body).toMatch(/\$500 a month/)
    // And it is urgent, so it sorts above everything else.
    expect(card.priority).toBeLessThan(10)
  })

  it('says so plainly when the whole match is already being collected', () => {
    const card = cardFor({ ...worker, monthlyContribution: 500 }, 'match')!
    expect(card.title).toMatch(/collecting the whole/)
    expect(card.body).toMatch(/nothing is being left behind/)
    // No longer urgent: it is a confirmation, not an action.
    expect(card.priority).toBeGreaterThan(50)
  })

  it('asks for the terms rather than inventing them', () => {
    const card = cardFor({ ...worker, annualSalary: 0, employerMatchPercent: 0 }, 'match')!
    expect(card.body).toMatch(/does not know yours/)
    expect(card.body).toMatch(/fill in your salary/)
    // It must not quote a figure it cannot know.
    expect(card.title).not.toMatch(/\$/)
  })

  it('quotes the HSA balance the plan actually reaches', () => {
    const inputs = plan({
      currentAge: 40,
      retirementAge: 65,
      endAge: 88,
      hsaBalance: 30_000,
      hsaMonthlyContribution: 300,
    })
    const card = cardFor(inputs, 'hsa')!
    const atRetirement = simulate(inputs).rows.find((r) => r.phase === 'retirement')!
    expect(card.title).toContain(String(atRetirement.age))
    expect(card.body).toMatch(/spends it before the Roth/)
  })

  it('falls back to the general case when there is no HSA', () => {
    const card = cardFor(plan({ currentAge: 40, retirementAge: 65 }), 'hsa')!
    expect(card.title).toMatch(/only account taxed at neither end/)
    expect(card.body).toMatch(/Add yours under Saving/)
  })
})

/**
 * Survivor benefits are not modelled — see the note above `simulate`.
 *
 * The tests that covered it were removed with it rather than left skipped: a
 * skipped block reads as something broken. What is worth keeping is the one
 * assertion that the parked input genuinely does nothing, so that carrying it
 * on the type cannot quietly start having an effect.
 */
describe('the parked survivor input', () => {
  it('changes nothing, whatever it is set to', () => {
    const couple = plan({
      filingStatus: 'married',
      currentAge: 70,
      retirementAge: 70,
      endAge: 88,
      balance401k: 900_000,
      brokerageBalance: 200_000,
      socialSecurityMonthly: 3_000,
      spouseBenefitMonthly: 1_600,
      monthlyRetirementSpending: 6_500,
    })
    const off = simulate(couple)
    const set = simulate({ ...couple, survivorFromAge: 78 })
    expect(set.totalTaxes).toBeCloseTo(off.totalTaxes, 6)
    expect(set.totalIrmaa).toBeCloseTo(off.totalIrmaa, 6)
    for (let i = 0; i < off.rows.length; i++) {
      expect(set.rows[i].socialSecurity, `age ${off.rows[i].age}`).toBeCloseTo(
        off.rows[i].socialSecurity,
        6,
      )
    }
  })
})
