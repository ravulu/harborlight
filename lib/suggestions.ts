import type { PlanInputs } from '@/lib/retirement'
import { simulate } from '@/lib/retirement'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { MAX_CLAIM_AGE, MIN_CLAIM_AGE, benefitFactor } from '@/lib/social-security'
import { taxableSocialSecurity } from '@/lib/tax'

/** The confidence a suggestion aims to reach: the low end of the usual band. */
export const TARGET_CONFIDENCE = 0.8

/** Enough runs to rank options; the headline figure is still the full run. */
const PROBE_RUNS = 800
/** Every candidate is drawn against this same sequence, so only the change moves the result. */
const PROBE_SEED = 0x5eed

export interface Suggestion {
  kind: 'save' | 'spend' | 'delay'
  /** monthly dollars for save and spend, years for delay */
  amount: number
  /** confidence the change reaches */
  confidence: number
}

const confidenceOf = (inputs: PlanInputs) =>
  runMonteCarlo(inputs, PROBE_RUNS, PROBE_SEED).successRate

/**
 * Smallest change of this shape that reaches the target, or null if even the
 * largest tried does not. `apply` must move confidence upward as `amount`
 * grows, which all three levers do.
 */
function solve(
  inputs: PlanInputs,
  max: number,
  apply: (value: number) => PlanInputs,
  round: (value: number) => number,
): Suggestion['amount'] | null {
  if (confidenceOf(apply(max)) < TARGET_CONFIDENCE) return null

  let low = 0
  let high = max
  for (let i = 0; i < 9 && high - low > 1e-6; i++) {
    const mid = (low + high) / 2
    if (confidenceOf(apply(mid)) >= TARGET_CONFIDENCE) high = mid
    else low = mid
  }

  // Round away from the user's favour, then confirm the rounded figure still
  // clears the bar — rounding down could land just under it.
  const rounded = round(high)
  return confidenceOf(apply(rounded)) >= TARGET_CONFIDENCE ? rounded : round(high * 1.05)
}

const roundUpTo = (step: number) => (v: number) => Math.ceil(v / step) * step

/**
 * Concrete ways to reach the target confidence, rather than a suggestion to
 * "save more". Which levers exist depends on the timeline: saving cannot help
 * someone already retired, and delaying is only offered while there is time.
 */
export function suggestFixes(inputs: PlanInputs): Suggestion[] {
  const yearsToRetirement = Math.max(0, inputs.retirementAge - inputs.currentAge)
  const out: Suggestion[] = []

  if (yearsToRetirement > 0) {
    const extra = solve(
      inputs,
      // A ceiling generous enough to prove the lever cannot work when it fails.
      Math.max(20000, inputs.monthlyContribution * 10 + 5000),
      (value) => ({ ...inputs, monthlyContribution: inputs.monthlyContribution + value }),
      roundUpTo(25),
    )
    if (extra !== null && extra > 0) {
      out.push({
        kind: 'save',
        amount: extra,
        confidence: confidenceOf({
          ...inputs,
          monthlyContribution: inputs.monthlyContribution + extra,
        }),
      })
    }
  }

  const cut = solve(
    inputs,
    inputs.monthlyRetirementSpending,
    (value) => ({
      ...inputs,
      monthlyRetirementSpending: inputs.monthlyRetirementSpending - value,
    }),
    roundUpTo(25),
  )
  if (cut !== null && cut > 0 && cut < inputs.monthlyRetirementSpending) {
    out.push({
      kind: 'spend',
      amount: cut,
      confidence: confidenceOf({
        ...inputs,
        monthlyRetirementSpending: inputs.monthlyRetirementSpending - cut,
      }),
    })
  }

  // Whole years only, and only where working longer is a real option: not
  // once someone has already retired, not past 75, and never past the end of
  // the plan. "Retire fourteen years later" is arithmetic, not advice.
  const alreadyRetired = inputs.currentAge > inputs.retirementAge
  const maxDelay = alreadyRetired
    ? 0
    : Math.max(
        0,
        Math.min(10, 75 - inputs.retirementAge, inputs.endAge - inputs.retirementAge - 1),
      )
  for (let years = 1; years <= maxDelay; years++) {
    const candidate = { ...inputs, retirementAge: inputs.retirementAge + years }
    if (confidenceOf(candidate) >= TARGET_CONFIDENCE) {
      out.push({ kind: 'delay', amount: years, confidence: confidenceOf(candidate) })
      break
    }
  }

  return out
}

export interface ClaimOption {
  age: number
  /** monthly benefit at that age, today's dollars */
  monthly: number
  confidence: number
  /** tax paid across the whole plan, today's dollars */
  lifetimeTax: number
  /** share of the benefit counted as ordinary income, 0 to 0.85 */
  taxedShare: number
}

export interface ClaimComparison {
  options: ClaimOption[]
  /** the age that survives most often — the primary goal */
  best: ClaimOption
  /** the age that pays least tax across the plan — the secondary goal */
  lowestTax: ClaimOption
  current: ClaimOption
  /** confidence points between the best and worst age */
  spread: number
  /** tax saved by the cheapest age against the current one, today's dollars */
  taxSaving: number
}

/**
 * What claiming at each age between 62 and 70 does to the plan.
 *
 * There is a genuine trade here, which is why it is worth simulating rather
 * than asserting: waiting raises the benefit permanently — 70% of the full
 * amount at 62 against 124% at 70 — but the years spent waiting have to be
 * funded from savings. Which side wins depends on how long the money has to
 * last, so a long plan usually favours waiting and a short one does not.
 */
export function compareClaimAges(inputs: PlanInputs): ClaimComparison | null {
  if (inputs.socialSecurityMonthly <= 0) return null

  const options: ClaimOption[] = []
  for (let age = MIN_CLAIM_AGE; age <= MAX_CLAIM_AGE; age++) {
    const candidate = { ...inputs, socialSecurityAge: age }
    // Tax comes from the deterministic run: it depends on the spending and
    // benefit the plan states, not on how the market happened to behave.
    const plan = simulate(candidate)
    const benefitYears = plan.rows.filter((r) => r.socialSecurity > 0)
    const taxedShare =
      benefitYears.length > 0
        ? taxableSocialSecurity(
            benefitYears[0].socialSecurity,
            benefitYears[0].withdrawals,
            inputs.filingStatus,
          ) / benefitYears[0].socialSecurity
        : 0

    options.push({
      age,
      monthly: inputs.socialSecurityMonthly * benefitFactor(age),
      confidence: runMonteCarlo(candidate, PROBE_RUNS, PROBE_SEED).successRate,
      lifetimeTax: plan.totalTaxes,
      taxedShare,
    })
  }

  const best = options.reduce((a, b) => (b.confidence > a.confidence ? b : a))
  const worst = options.reduce((a, b) => (b.confidence < a.confidence ? b : a))
  const lowestTax = options.reduce((a, b) => (b.lifetimeTax < a.lifetimeTax ? b : a))
  const current =
    options.find((o) => o.age === inputs.socialSecurityAge) ??
    options[options.length - 1]

  return {
    options,
    best,
    lowestTax,
    current,
    spread: Math.round((best.confidence - worst.confidence) * 100),
    taxSaving: current.lifetimeTax - lowestTax.lifetimeTax,
  }
}
