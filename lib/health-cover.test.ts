import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUTS, simulate, type PlanInputs } from '@/lib/retirement'
import { MEDICARE_AGE, CLIFF, povertyLine } from '@/lib/aca'

const early = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  currentAge: 55,
  retirementAge: 58,
  endAge: 90,
  brokerageBalance: 100_000,
  balance401k: 1_200_000,
  traditionalIraBalance: 0,
  rothIraBalance: 0,
  monthlyRetirementSpending: 5_000,
  // No benefit, so a withdrawal is the only thing funding the year and the
  // arithmetic below is about the premium rather than about Social Security.
  socialSecurityMonthly: 0,
  spouseBenefitMonthly: 0,
  ...over,
})

const rows = (p: PlanInputs) => simulate(p).rows
const beforeMedicare = (p: PlanInputs) =>
  rows(p).filter((r) => r.phase === 'retirement' && r.age < MEDICARE_AGE)

describe('health cover before Medicare', () => {
  it('charges the marketplace only between stopping work and 65', () => {
    const r = rows(early())
    // Working: cover comes with the job.
    for (const row of r.filter((x) => x.phase === 'accumulation')) {
      expect(row.healthPremium, `age ${row.age}`).toBe(0)
    }
    // Retired and under 65: charged.
    expect(beforeMedicare(early()).every((x) => x.healthPremium > 0)).toBe(true)
    // From 65 it is Medicare, whose surcharge is charged separately.
    for (const row of r.filter((x) => x.age >= MEDICARE_AGE)) {
      expect(row.healthPremium, `age ${row.age}`).toBe(0)
    }
  })

  it('charges nothing at all when cover is already arranged', () => {
    const p = early({ healthCoverBefore65: 'none' })
    expect(rows(p).every((x) => x.healthPremium === 0)).toBe(true)
    expect(simulate(p).totalHealthPremium).toBe(0)
  })

  it('charges what was entered for a plan of their own, and only until 65', () => {
    const p = early({ healthCoverBefore65: 'own', healthPremiumMonthly: 900 })
    // Reported on the row like any other cover, in today's dollars — so it is
    // the figure typed rather than an inflated one, and the Tax tab shows it
    // beside the projected kind rather than burying it in the spending.
    for (const row of beforeMedicare(p)) {
      expect(row.healthPremium, `age ${row.age}`).toBeCloseTo(900 * 12, 6)
    }
    // Charged as part of the need rather than as a premium line: the
    // household already knows this cost, so nothing is being worked out for
    // them and there is nothing to show on its own row.
    const end = (i: PlanInputs) => {
      const r = simulate(i).rows
      return r[r.length - 1].endBalance
    }
    expect(end(p)).toBeLessThan(end(early({ healthCoverBefore65: 'none' })))
    // And the year withdraws more for it, by about what was entered.
    const age = early().retirementAge
    const drew = (i: PlanInputs) =>
      simulate(i).rows.find((r) => r.age === age)!.withdrawals
    expect(drew(p) - drew(early({ healthCoverBefore65: 'none' }))).toBeGreaterThan(
      900 * 12 * 0.9,
    )
  })

  it('charges Medicare-side costs from 65 and never a day before', () => {
    // The bug this input exists to fix: one spending figure covers the whole
    // of retirement, so Medigap and Part D entered there were charged from the
    // retirement age — ten years early for someone stopping at 55, and on top
    // of the marketplace cover already charged for those same years.
    const p = early({ healthCoverBefore65: 'none', healthAfter65Monthly: 543 })
    for (const row of beforeMedicare(p)) {
      expect(row.healthPremium, `age ${row.age}`).toBe(0)
    }
    for (const row of rows(p).filter((r) => r.age >= MEDICARE_AGE)) {
      expect(row.healthPremium, `age ${row.age}`).toBeCloseTo(543 * 12, 6)
    }
  })

  it('costs the plan real money, not a rounding difference', () => {
    const covered = simulate(early())
    const not = simulate(early({ healthCoverBefore65: 'none' }))
    // Seven years of cover before Medicare: worth more than a single year of
    // it, and nothing like a rounding difference.
    expect(covered.totalHealthPremium).toBeGreaterThan(
      beforeMedicare(early())[0].healthPremium * 2,
    )
    // And it comes out of the balance, so the plan ends poorer for it.
    const end = (r: typeof covered) => r.rows[r.rows.length - 1].endBalance
    expect(end(covered)).toBeLessThan(end(not))
  })
})

/**
 * The premium is set by the same year's income, and paying for it changes that
 * income. The year is solved repeatedly until the two agree; these are the
 * properties that has to have.
 */
describe('the year settling on its own premium', () => {
  it('leaves the row adding up: the withdrawal funds every charge on it', () => {
    // A row reporting a premium larger than the withdrawal raised to pay for
    // it would be telling the reader something untrue about its own
    // arithmetic, and the year-by-year table would show the difference.
    for (const row of rows(early()).filter((r) => r.phase === 'retirement')) {
      // `surplus` comes off too: from 75 the required distribution forces out
      // more than the year needs, and the excess is not spending.
      expect(
        row.withdrawals -
          row.taxes -
          row.surplus -
          row.healthPremium -
          row.irmaaSurcharge,
        `age ${row.age}`,
      ).toBeCloseTo(row.spending, 0)
    }
  })

  it('raises the withdrawal by roughly the premium, not by nothing', () => {
    const covered = beforeMedicare(early())[0]
    const not = rows(early({ healthCoverBefore65: 'none' })).find(
      (r) => r.age === covered.age,
    )!
    expect(covered.withdrawals - not.withdrawals).toBeGreaterThan(
      covered.healthPremium * 0.9,
    )
  })

  it('terminates on a plan sitting right at the subsidy cliff', () => {
    // The step at 400% of the poverty line is not gradual: a household just
    // under it that withdraws to pay its premium is pushed over by doing so.
    // The iteration must settle rather than oscillate across that edge.
    const line = povertyLine(1) * CLIFF
    const p = early({
      brokerageBalance: 0,
      balance401k: 2_000_000,
      monthlyRetirementSpending: Math.round((line * 0.95) / 12),
    })
    const charged = beforeMedicare(p)
    expect(charged.length).toBeGreaterThan(0)
    for (const row of charged) {
      expect(Number.isFinite(row.healthPremium), `age ${row.age}`).toBe(true)
      expect(row.healthPremium, `age ${row.age}`).toBeGreaterThan(0)
      // Still coherent even where it did not converge.
      expect(
        row.withdrawals - row.taxes - row.healthPremium,
        `age ${row.age}`,
      ).toBeCloseTo(row.spending, 0)
    }
  })

  it('keeps a low-income household on Medicaid rather than charging it', () => {
    // Below the poverty line the marketplace credit does not apply. Drawing
    // from a brokerage keeps countable income low, which is a real effect and
    // not a modelling accident.
    const p = early({
      balance401k: 0,
      traditionalIraBalance: 0,
      brokerageBalance: 900_000,
      brokerageGainShare: 5,
      monthlyRetirementSpending: 1_100,
    })
    const first = beforeMedicare(p)[0]
    expect(first.healthPremium).toBe(0)
  })
})
