import type { PlanInputs } from '@/lib/retirement'
import { simulate } from '@/lib/retirement'
import {
  FULL_RETIREMENT_AGE,
  MAX_CLAIM_AGE,
  MIN_CLAIM_AGE,
  benefitFactor,
} from '@/lib/social-security'

/**
 * What each Social Security claim age does to this plan.
 *
 * The textbook answer to "when should I claim" is a break-even age worked out
 * from the benefit alone: 82.5 for 67 against 70, the figure every article
 * quotes. It is arithmetic and it is wrong, because it ignores the three years
 * of portfolio the waiting is paid for out of. Money withdrawn at 67 to bridge
 * a gap to 70 does not compound for the rest of the plan, and the formula has
 * no way to see that.
 *
 * On the plans this app has been run against, the true crossover lands several
 * years later than the published one — 90 rather than 82.5 on one of them. It
 * moves with returns, spending and the size of the pot, which is exactly why a
 * figure worked out from a household's own plan beats a universal one, and why
 * quoting the universal one here would be worse than saying nothing.
 *
 * The whole ladder is shown and no row is recommended, for the same reason the
 * conversion ladder shows all of its rows: the tax answer is one input to a
 * decision that also turns on health, on work, and — for a couple — on a
 * survivor benefit this projection cannot yet price at all.
 */

export interface ClaimOption {
  age: number
  /** Share of the full benefit, e.g. 0.7 at 62. */
  factor: number
  /** The monthly benefit at this claim age, in today's dollars. */
  monthly: number
  /** What the plan ends with, in today's dollars. */
  endBalance: number
  totalTaxes: number
  /** Null if the money lasts. */
  depletionAge: number | null
  /** Against the claim age the plan currently uses. */
  deltaEnd: number
  /** The plan as it stands. */
  current: boolean
}

export interface ClaimComparison {
  /** The claim age the plan currently uses. */
  current: number
  options: ClaimOption[]
  /**
   * The age past which waiting until `latest` beats claiming at `current`, on
   * this plan's own figures. Null where waiting never catches up inside a
   * plausible lifetime, which is itself a finding.
   */
  crossover: number | null
  /** The age `crossover` was worked out against — the latest worth waiting for. */
  latest: number
  /** Textbook figure for the same pair, for the gap to be visible. */
  textbookCrossover: number
  /**
   * True for a married plan, where the survivor benefit is the largest single
   * argument for delaying and this projection does not model it. Everything
   * here then understates waiting, in a known direction, and the card has to
   * say so rather than let a reader take the table at face value.
   */
  survivorUnpriced: boolean
}

/** The oldest a crossover search will look. Past this it is not a plan. */
const OLDEST = 100

/**
 * Where cumulative benefits alone cross over, ignoring everything else.
 *
 * Kept so the card can show its own answer against the published one. COLA
 * cancels in real terms, so this needs no discounting to be a fair statement
 * of the arithmetic it represents.
 */
export function textbookCrossover(early: number, late: number): number {
  const fe = benefitFactor(early)
  const fl = benefitFactor(late)
  if (fl === fe) return late
  return (fl * late - fe * early) / (fl - fe)
}

/** Which ages are worth putting in front of someone. */
function candidateAges(inputs: PlanInputs): number[] {
  const earliest = Math.max(MIN_CLAIM_AGE, inputs.currentAge)
  const set = new Set(
    [MIN_CLAIM_AGE, 65, FULL_RETIREMENT_AGE, MAX_CLAIM_AGE, inputs.socialSecurityAge].filter(
      (a) => a >= earliest && a <= MAX_CLAIM_AGE,
    ),
  )
  return [...set].sort((a, b) => a - b)
}

const endBalanceOf = (inputs: PlanInputs, claim: number, endAge: number) => {
  const rows = simulate({ ...inputs, socialSecurityAge: claim, endAge }).rows
  return rows[rows.length - 1]?.endBalance ?? 0
}

/**
 * The first age at which waiting until `late` leaves more than claiming at
 * `early`, on this plan.
 *
 * Bisected rather than walked, and confirmed at both ends first: the answer is
 * only meaningful if waiting loses at the bottom of the range and wins at the
 * top, and reporting a crossover for a plan where one of those is false would
 * be reporting the edge of the search instead of a finding.
 */
export function crossoverAge(
  inputs: PlanInputs,
  early: number,
  late: number,
): number | null {
  if (late <= early) return null
  const ahead = (endAge: number) =>
    endBalanceOf(inputs, late, endAge) >= endBalanceOf(inputs, early, endAge)

  const low = Math.max(late + 1, inputs.retirementAge + 1)
  if (low >= OLDEST) return null
  // Waiting is already ahead as soon as both benefits are running: no
  // crossover to report, because there was never a period of catching up.
  if (ahead(low)) return low
  // Still behind at a hundred. Saying "never, on these figures" is the honest
  // answer and a more useful one than a number pulled from the search bound.
  if (!ahead(OLDEST)) return null

  let lo = low
  let hi = OLDEST
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (ahead(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/**
 * The ladder, or null where there is no claiming decision left to make.
 */
export function compareClaiming(inputs: PlanInputs): ClaimComparison | null {
  if (inputs.socialSecurityMonthly <= 0) return null
  if (inputs.currentAge >= MAX_CLAIM_AGE) return null

  const ages = candidateAges(inputs)
  if (ages.length < 2) return null

  const current = inputs.socialSecurityAge
  const run = (claim: number) => {
    const r = simulate({ ...inputs, socialSecurityAge: claim })
    return {
      endBalance: r.rows[r.rows.length - 1]?.endBalance ?? 0,
      totalTaxes: r.totalTaxes,
      depletionAge: r.depletionAge,
    }
  }

  const currentEnd = run(current).endBalance
  /**
   * The input is labelled "Monthly benefit at 67" and `simulate` applies the
   * claim-age factor to it itself, so this is already the amount due at full
   * retirement age. Adjusting it again here would have shown every row a
   * benefit scaled twice.
   */
  const fullMonthly = inputs.socialSecurityMonthly

  const options: ClaimOption[] = ages.map((age) => {
    const r = run(age)
    const factor = benefitFactor(age)
    return {
      age,
      factor,
      monthly: fullMonthly * factor,
      endBalance: r.endBalance,
      totalTaxes: r.totalTaxes,
      depletionAge: r.depletionAge,
      deltaEnd: r.endBalance - currentEnd,
      current: age === current,
    }
  })

  const latest = ages[ages.length - 1]

  return {
    current,
    options,
    latest,
    crossover: latest > current ? crossoverAge(inputs, current, latest) : null,
    textbookCrossover: textbookCrossover(current, latest),
    survivorUnpriced: inputs.filingStatus === 'married',
  }
}
