import { describe, expect, it } from 'vitest'
import { spendingLeverage } from '@/lib/spending-lever'
import { earliestRetirement } from '@/lib/earliest'
import { DEFAULT_INPUTS, type PlanInputs } from '@/lib/retirement'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  currentAge: 45,
  retirementAge: 62,
  endAge: 92,
  brokerageBalance: 250_000,
  balance401k: 800_000,
  monthlyContribution: 2_000,
  monthlyRetirementSpending: 6_000,
  ...over,
})

describe('spendingLeverage', () => {
  it('has nothing to say to someone who has already stopped', () => {
    expect(spendingLeverage(plan({ currentAge: 62, retirementAge: 62 }))).toBeNull()
    expect(spendingLeverage(plan({ monthlyRetirementSpending: 0 }))).toBeNull()
  })

  it('offers cuts somebody could actually make, in round numbers', () => {
    const l = spendingLeverage(plan())!
    // "Spend $287 less" is arithmetic; "spend $250 less" is a decision.
    for (const c of l.cuts) expect(c.monthly % 25).toBe(0)
    // Scaled to the household, so the smallest step is meaningful at any size.
    const big = spendingLeverage(plan({ monthlyRetirementSpending: 20_000 }))!
    expect(big.cuts[0].monthly).toBeGreaterThan(l.cuts[0].monthly)
  })

  it('never offers a cut larger than the spending it comes out of', () => {
    const l = spendingLeverage(plan({ monthlyRetirementSpending: 1_200 }))!
    for (const c of l.cuts) expect(c.monthly).toBeLessThan(1_200)
  })

  it('brings the date forward, and further for a larger cut', () => {
    const l = spendingLeverage(plan())!
    expect(l.baseAge).not.toBeNull()
    const years = l.cuts.map((c) => c.yearsEarlier)
    // Monotone: a bigger cut can never buy fewer years than a smaller one.
    expect(years).toEqual([...years].sort((a, b) => a - b))
    expect(years[years.length - 1]).toBeGreaterThan(0)
  })

  it('agrees with the solver it reports, cut for cut', () => {
    // The card claims each row is the youngest age that still clears the bar
    // on that plan. That is checkable, so it is checked.
    const p = plan()
    const l = spendingLeverage(p)!
    for (const c of l.cuts) {
      const direct = earliestRetirement({
        ...p,
        monthlyRetirementSpending: p.monthlyRetirementSpending - c.monthly,
        monthlyContribution: p.monthlyContribution + c.monthly,
      })
      expect(c.age, `cut ${c.monthly}`).toBe(direct?.age ?? null)
    }
  })

  it('counts the cut twice on purpose, and the card says so', () => {
    // A pound not spent is a pound saved now *and* a pound retirement no
    // longer has to fund. Both, because a cut made now and kept does both —
    // which is the whole reason a modest cut moves the date by years.
    const p = plan()
    const l = spendingLeverage(p)!
    const cut = l.cuts[0].monthly
    const spendOnly = earliestRetirement({
      ...p,
      monthlyRetirementSpending: p.monthlyRetirementSpending - cut,
    })
    // Saving it too can only help, never hurt.
    expect(l.cuts[0].age!).toBeLessThanOrEqual(spendOnly!.age!)
  })

  it('leaves the plan it was given untouched', () => {
    const p = plan()
    const before = JSON.stringify(p)
    spendingLeverage(p)
    expect(JSON.stringify(p)).toBe(before)
  })
})
