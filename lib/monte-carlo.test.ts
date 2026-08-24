import { describe, expect, it } from 'vitest'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { DEFAULT_INPUTS, type PlanInputs, simulate } from '@/lib/retirement'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  taxState: 'CA',
  ...over,
})

/** Fewer runs than production: enough to be stable, fast enough for a suite. */
const RUNS = 2_000

describe('runMonteCarlo', () => {
  it('agrees with the projection about whether a plan fails', () => {
    const broke = plan({
      balance401k: 40_000,
      brokerageBalance: 0,
      monthlyRetirementSpending: 9_000,
    })
    const comfortable = plan({ balance401k: 3_000_000 })

    expect(simulate(broke).lastsThroughRetirement).toBe(false)
    expect(runMonteCarlo(broke, RUNS).successRate).toBeLessThan(0.6)

    expect(simulate(comfortable).lastsThroughRetirement).toBe(true)
    expect(runMonteCarlo(comfortable, RUNS).successRate).toBeGreaterThan(0.7)
  })

  /**
   * The regression this exists for.
   *
   * Monte Carlo runs a single aggregated balance and charges `withdrawals`
   * against it each year. Once required distributions were modelled that
   * figure grew to include the compulsory part, most of which the plan does
   * not spend — it is taxed and moved to the brokerage, staying inside the
   * portfolio. Charging the gross spent it twice: a plan holding $2,000,000
   * against $12,000 a year of spending came back looking fragile.
   */
  it('does not spend a reinvested distribution twice', () => {
    const inputs = plan({
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

    // The projection is emphatic: distributions every year, and most of each
    // one comes straight back as surplus.
    const projection = simulate(inputs)
    for (const row of projection.rows) {
      expect(row.surplus).toBeGreaterThan(row.withdrawals * 0.6)
    }

    // So a household spending $12,000 a year out of $2,000,000 is in no
    // danger, whatever the market does to it.
    expect(runMonteCarlo(inputs, RUNS).successRate).toBeGreaterThan(0.95)
  })

  it('is reproducible for the same plan', () => {
    const inputs = plan()
    expect(runMonteCarlo(inputs, RUNS).successRate).toBe(
      runMonteCarlo(inputs, RUNS).successRate,
    )
  })

  it('reports a spread that widens with volatility', () => {
    const steady = runMonteCarlo(plan({ postRetirementVolatility: 2 }), RUNS)
    const wild = runMonteCarlo(plan({ postRetirementVolatility: 25 }), RUNS)
    const spread = (r: typeof steady) => r.peakBalance.high - r.peakBalance.low
    expect(spread(wild)).toBeGreaterThan(spread(steady))
  })
})
