import type { PlanInputs } from '@/lib/retirement'
import { simulate } from '@/lib/retirement'

export const SIMULATION_RUNS = 10000

/**
 * mulberry32. Seeded rather than Math.random so a given set of assumptions
 * always produces the same fan — otherwise the chart would reshuffle on every
 * keystroke and no two readings of the same plan would agree.
 */
function makeRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box–Muller: a standard normal from two uniforms. */
function standardNormal(rand: () => number): number {
  let u = 0
  while (u === 0) u = rand()
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * One year's return, drawn lognormally.
 *
 * Lognormal rather than normal because a normal draw can return worse than
 * -100%, which is not a thing a portfolio can do. The parameters are converted
 * from the arithmetic mean and standard deviation the user actually thinks in.
 */
function sampleReturn(rand: () => number, mean: number, stdev: number): number {
  if (stdev <= 0) return mean
  const variance = Math.log(1 + (stdev * stdev) / ((1 + mean) * (1 + mean)))
  const sigma = Math.sqrt(variance)
  const mu = Math.log(1 + mean) - variance / 2
  return Math.exp(mu + sigma * standardNormal(rand)) - 1
}

/** Stable seed from the assumptions, so the same plan redraws the same fan. */
function seedFrom(inputs: PlanInputs): number {
  const parts = [
    inputs.currentAge, inputs.retirementAge, inputs.endAge,
    inputs.brokerageBalance, inputs.brokerageGainShare,
    inputs.balance401k, inputs.traditionalIraBalance, inputs.rothIraBalance,
    inputs.monthlyContribution,
    inputs.preRetirementReturn, inputs.postRetirementReturn,
    inputs.preRetirementVolatility, inputs.postRetirementVolatility,
    inputs.inflationRate, inputs.monthlyRetirementSpending,
    inputs.socialSecurityMonthly, inputs.socialSecurityAge,
    inputs.socialSecurityCola, inputs.spouseBenefitMonthly, inputs.spouseClaimAge,
    inputs.spendingStep1Age, inputs.spendingStep1Monthly,
    inputs.spendingStep2Age, inputs.spendingStep2Monthly, inputs.pensionMonthly, inputs.pensionStartAge,
    inputs.pensionCola, inputs.otherIncomeMonthly, inputs.otherIncomeStartAge,
    inputs.federalTaxRate, inputs.stateTaxRate,
  ]
  let h = 2166136261
  for (const part of parts) {
    h ^= Math.round(part * 100)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface MonteCarloYear {
  age: number
  /** all in today's dollars */
  low: number
  median: number
  high: number
}

/**
 * How a figure came out across the runs, in today's dollars.
 *
 * The bounds are the 10th and 90th percentiles, not the single best and worst
 * runs. Out of 10,000 draws the extremes are one freak sequence each — worth
 * nothing as a planning figure, and they would move every time the seed did.
 * A tenth either way is a bound you can act on, and it is the same band the
 * chart shades.
 */
export interface Outcomes {
  low: number
  median: number
  high: number
}

export interface MonteCarloResult {
  runs: number
  years: MonteCarloYear[]
  /** share of runs whose money lasted the whole plan, 0 to 1 */
  successRate: number
  /** median age the money ran out among runs where it did */
  medianDepletionAge: number | null
  balanceAtRetirement: Outcomes
  peakBalance: Outcomes
}

/** The three points the tiles quote, from an already-sorted set of runs. */
const outcomesOf = (sorted: Float64Array): Outcomes => ({
  low: percentile(sorted, 0.1),
  median: percentile(sorted, 0.5),
  high: percentile(sorted, 0.9),
})

/** No spread to report — every run agrees, so all three points are the same. */
const flat = (value: number): Outcomes => ({ low: value, median: value, high: value })

const percentile = (sorted: Float64Array, p: number) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]

/**
 * Runs the plan many times over randomly drawn returns.
 *
 * Only the returns are random. Spending, the benefit and the tax rates are
 * decisions and rules, not market outcomes, so they stay as the plan states
 * them — which also means the tax rate for each year can be worked out once
 * and reused across every run.
 */
export function runMonteCarlo(
  inputs: PlanInputs,
  runs: number = SIMULATION_RUNS,
  /**
   * Overrides the seed derived from the inputs. Searching for the change that
   * would fix a plan needs every candidate drawn against the same sequence of
   * returns, or the comparison measures luck instead of the change.
   */
  seed?: number,
): MonteCarloResult {
  const {
    currentAge, retirementAge, endAge,
    brokerageBalance, balance401k, traditionalIraBalance, rothIraBalance,
    monthlyContribution,
    preRetirementReturn, postRetirementReturn, preRetirementVolatility,
    postRetirementVolatility, inflationRate,
  } = inputs

  const currentSavings =
    brokerageBalance + balance401k + traditionalIraBalance + rothIraBalance
  const infl = inflationRate / 100
  const safeRetirement = Math.max(retirementAge, currentAge)
  const safeEnd = Math.max(endAge, safeRetirement)
  const span = safeEnd - currentAge
  if (span <= 0) {
    return {
      runs, years: [], successRate: 1, medianDepletionAge: null,
      balanceAtRetirement: flat(currentSavings), peakBalance: flat(currentSavings),
    }
  }

  // What comes out each year, taken from the projection rather than worked
  // out again here.
  //
  // Which pot a dollar leaves from decides the tax on it, and the pots move
  // with the returns — so a truly per-run answer would mean solving the tax
  // for every one of ten thousand paths, thirty times over. The projection
  // settles the withdrawal schedule and the market decides whether the money
  // lasts, which is the question this is being asked.
  const projection = simulate(inputs)
  const byAge = new Map(projection.rows.map((r) => [r.age, r]))

  const withdrawal = new Float64Array(span)
  const contribution = new Float64Array(span)
  for (let i = 0; i < span; i++) {
    const age = currentAge + i
    const row = byAge.get(age)
    const inflator = Math.pow(1 + infl, i)
    if (!row || row.phase === 'accumulation') {
      contribution[i] = monthlyContribution * 12
      continue
    }
    // Net of anything a required distribution forced out and the plan put
    // straight back. That surplus leaves the 401(k), is taxed, and lands in
    // the brokerage — it never leaves the portfolio, so charging the gross
    // here would spend it twice and report a plan far more fragile than it is.
    withdrawal[i] = (row.withdrawals - row.surplus) * inflator
  }

  const rand = makeRandom(seed ?? seedFrom(inputs))
  const preMean = preRetirementReturn / 100
  const preVol = preRetirementVolatility / 100
  const postMean = postRetirementReturn / 100
  const postVol = postRetirementVolatility / 100

  const byYear: Float64Array[] = Array.from({ length: span }, () => new Float64Array(runs))
  const peaks = new Float64Array(runs)
  const atRetirement = new Float64Array(runs)
  const depletions: number[] = []
  let survived = 0

  for (let run = 0; run < runs; run++) {
    let balance = currentSavings
    let peak = currentSavings
    let depletedAt: number | null = null

    for (let i = 0; i < span; i++) {
      const age = currentAge + i
      const accumulating = age < safeRetirement
      if (age === safeRetirement) atRetirement[run] = balance / Math.pow(1 + infl, i)

      const flow = accumulating ? contribution[i] : -withdrawal[i]
      const drawn = sampleReturn(
        rand,
        accumulating ? preMean : postMean,
        accumulating ? preVol : postVol,
      )
      const base = balance + flow / 2
      const growth = base > 0 ? base * drawn : 0
      balance = balance + flow + growth

      if (balance <= 0) {
        balance = 0
        if (depletedAt === null && !accumulating) depletedAt = age
      }
      const real = balance / Math.pow(1 + infl, i + 1)
      byYear[i][run] = real
      if (real > peak) peak = real
    }

    peaks[run] = peak
    if (depletedAt === null) survived++
    else depletions.push(depletedAt)
    if (safeRetirement >= safeEnd) atRetirement[run] = balance
  }

  const years: MonteCarloYear[] = byYear.map((values, i) => {
    const sorted = values.slice().sort()
    return {
      age: currentAge + i,
      low: percentile(sorted, 0.1),
      median: percentile(sorted, 0.5),
      high: percentile(sorted, 0.9),
    }
  })

  const sortedDepletions = depletions.slice().sort((a, b) => a - b)
  const sortedPeaks = peaks.slice().sort()
  const sortedAtRetirement = atRetirement.slice().sort()

  return {
    runs,
    years,
    successRate: survived / runs,
    medianDepletionAge:
      sortedDepletions.length > 0
        ? sortedDepletions[Math.floor(sortedDepletions.length / 2)]
        : null,
    balanceAtRetirement: outcomesOf(sortedAtRetirement),
    peakBalance: outcomesOf(sortedPeaks),
  }
}
