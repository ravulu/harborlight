import { describe, expect, it } from 'vitest'
import { earliestRetirement } from '@/lib/earliest'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { DEFAULT_INPUTS, type PlanInputs } from '@/lib/retirement'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  taxState: 'CA',
  ...over,
})

/** The same probe the module uses, so a test can check its answer independently. */
const confidenceAt = (inputs: PlanInputs, retirementAge: number) =>
  runMonteCarlo({ ...inputs, retirementAge }, 800, 0x5eed).successRate

const onTrack = plan({
  currentAge: 45,
  retirementAge: 67,
  balance401k: 400_000,
  brokerageBalance: 150_000,
  monthlyContribution: 1_500,
  monthlyRetirementSpending: 5_000,
})

const wealthy = plan({
  currentAge: 45,
  retirementAge: 65,
  balance401k: 1_500_000,
  brokerageBalance: 600_000,
  monthlyContribution: 3_000,
  monthlyRetirementSpending: 5_000,
})

const behind = plan({
  currentAge: 45,
  retirementAge: 62,
  balance401k: 10_000,
  brokerageBalance: 0,
  monthlyContribution: 100,
  monthlyRetirementSpending: 12_000,
})

describe('earliestRetirement', () => {
  it('answers the question the planner otherwise only grades', () => {
    const e = earliestRetirement(onTrack)!
    expect(e.age).not.toBeNull()
    expect(e.chosenAge).toBe(67)
    // And it reports the chosen age's confidence alongside, so the two can be
    // compared rather than the reader being handed one number.
    expect(e.chosenConfidence).toBeCloseTo(confidenceAt(onTrack, 67), 6)
  })

  it('really is the earliest: the age clears the bar and the one below does not', () => {
    for (const inputs of [onTrack, wealthy]) {
      const e = earliestRetirement(inputs)!
      expect(e.age).not.toBeNull()
      expect(confidenceAt(inputs, e.age!)).toBeGreaterThanOrEqual(e.target)
      if (e.age! > e.searchedFrom) {
        expect(confidenceAt(inputs, e.age! - 1)).toBeLessThan(e.target)
      }
    }
  })

  it('agrees with a plain sweep of every age', () => {
    // The bisection is an optimisation, not a different answer. This walks the
    // whole window the slow way and expects the same age out.
    const e = earliestRetirement(onTrack)!
    let swept: number | null = null
    for (let age = e.searchedFrom; age <= e.searchedTo; age++) {
      if (confidenceAt(onTrack, age) >= TARGET_CONFIDENCE) {
        swept = age
        break
      }
    }
    expect(e.age).toBe(swept)
  })

  it('uses the bar the rest of the app uses, and it is ninety per cent', () => {
    expect(TARGET_CONFIDENCE).toBe(0.9)
    expect(earliestRetirement(onTrack)!.target).toBe(TARGET_CONFIDENCE)
  })

  it('says plainly when no age in the window works', () => {
    const e = earliestRetirement(behind)!
    expect(e.age).toBeNull()
    // Still reports what the chosen age comes out at, so the card has
    // something to say rather than only what it cannot.
    expect(e.chosenConfidence).toBeGreaterThan(0)
    expect(e.searchedTo).toBeGreaterThan(e.searchedFrom)
  })

  it('never offers an age before today', () => {
    const older = plan({ currentAge: 58, retirementAge: 62, balance401k: 2_000_000 })
    const e = earliestRetirement(older)!
    expect(e.searchedFrom).toBeGreaterThanOrEqual(58)
    if (e.age !== null) expect(e.age).toBeGreaterThanOrEqual(58)
  })

  it('reports a later age when the chosen one does not clear the bar', () => {
    const e = earliestRetirement(onTrack)!
    if (e.chosenConfidence < TARGET_CONFIDENCE) {
      expect(e.age!).toBeGreaterThan(e.chosenAge)
      expect(e.yearsEarlier).toBeLessThan(0)
    }
  })

  it('flags the two thresholds that make an early answer cost more', () => {
    const e = earliestRetirement(wealthy)!
    expect(e.age).not.toBeNull()
    expect(e.beforeMedicare).toBe(e.age! < 65)
    expect(e.beforePenaltyFree).toBe(e.age! < 59.5)
  })

  it('leaves the plan it was given untouched', () => {
    const before = JSON.stringify(onTrack)
    earliestRetirement(onTrack)
    expect(JSON.stringify(onTrack)).toBe(before)
  })
})
