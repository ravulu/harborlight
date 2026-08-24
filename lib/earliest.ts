import type { PlanInputs } from '@/lib/retirement'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'
import { MEDICARE_AGE } from '@/lib/aca'
import { PENALTY_FREE_AGE } from '@/lib/tax'

/** Enough runs to rank ages; the headline figure is still the full run. */
const PROBE_RUNS = 800
/** Every candidate is drawn against the same sequence, so only the age moves it. */
const PROBE_SEED = 0x5eed

/** Nobody is served by a search that offers to retire them at 30. */
const YOUNGEST = 45
/** Past this the question stops being interesting. */
const OLDEST = 75

export interface EarliestRetirement {
  /** The youngest age searched that clears the bar, or null if none does. */
  age: number | null
  /** Confidence at that age. */
  confidence: number
  /** The age the plan currently states, and what it comes out at. */
  chosenAge: number
  chosenConfidence: number
  /** Positive when the answer is earlier than the plan says; negative later. */
  yearsEarlier: number
  /** The bar it had to clear, as a share. */
  target: number
  /** The window searched, so the reader can see what was and was not tried. */
  searchedFrom: number
  searchedTo: number
  /**
   * Whether the suggested age lands before the two thresholds that make an
   * early retirement cost more than the projection alone suggests.
   *
   * Neither is a reason not to do it, and both are already priced — but they
   * are the reasons an answer that clears the bar can still be the wrong
   * decision, so they travel with it.
   */
  beforeMedicare: boolean
  beforePenaltyFree: boolean
}

const confidenceAt = (inputs: PlanInputs, retirementAge: number) =>
  runMonteCarlo({ ...inputs, retirementAge }, PROBE_RUNS, PROBE_SEED).successRate

/**
 * The earliest age this plan could support stopping work, as something to
 * explore rather than an answer.
 *
 * The planner otherwise takes a retirement age and grades it, which answers
 * "can I retire at 65?" and not "when can I retire?" — the second being the
 * question people actually arrive with. Every part needed was already here;
 * nothing was putting them together.
 *
 * Found by bisection rather than by trying every age. Confidence rises as
 * retirement is delayed — more years of contributions, fewer years to fund —
 * so the ages form an ordered run and the boundary can be halved into. The
 * answer and the age below it are both confirmed at the end, so a plan where
 * that ordering does not quite hold cannot produce a wrong age quietly.
 *
 * Nothing here changes the plan. Candidates are built and discarded, exactly
 * as `compareClaimAges` and `compareConversions` do.
 */
export function earliestRetirement(inputs: PlanInputs): EarliestRetirement | null {
  const chosenAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const from = Math.max(YOUNGEST, inputs.currentAge)
  const to = Math.min(OLDEST, Math.max(inputs.endAge - 1, from))
  if (to <= from) return null

  const chosenConfidence = confidenceAt(inputs, chosenAge)

  const base = {
    chosenAge,
    chosenConfidence,
    target: TARGET_CONFIDENCE,
    searchedFrom: from,
    searchedTo: to,
  }

  // Nothing in the window clears it: the honest answer is that this plan does
  // not support retiring at any age it was asked about, which is worth saying
  // rather than leaving the reader to infer from an absence.
  if (confidenceAt(inputs, to) < TARGET_CONFIDENCE) {
    return {
      ...base,
      age: null,
      confidence: 0,
      yearsEarlier: 0,
      beforeMedicare: false,
      beforePenaltyFree: false,
    }
  }

  let low = from
  let high = to
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (confidenceAt(inputs, mid) >= TARGET_CONFIDENCE) high = mid
    else low = mid + 1
  }

  // Confirm both sides of the boundary rather than trusting the ordering: the
  // age itself must clear the bar, and the age below it must not, or it is not
  // the earliest.
  const confidence = confidenceAt(inputs, low)
  if (confidence < TARGET_CONFIDENCE) return null
  if (low > from && confidenceAt(inputs, low - 1) >= TARGET_CONFIDENCE) {
    // The ordering did not hold. Rather than report an age that is not the
    // earliest, fall back to walking down from it.
    let age = low
    while (age > from && confidenceAt(inputs, age - 1) >= TARGET_CONFIDENCE) age -= 1
    return {
      ...base,
      age,
      confidence: confidenceAt(inputs, age),
      yearsEarlier: chosenAge - age,
      beforeMedicare: age < MEDICARE_AGE,
      beforePenaltyFree: age < PENALTY_FREE_AGE,
    }
  }

  return {
    ...base,
    age: low,
    confidence,
    yearsEarlier: chosenAge - low,
    beforeMedicare: low < MEDICARE_AGE,
    beforePenaltyFree: low < PENALTY_FREE_AGE,
  }
}
