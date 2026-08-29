import { describe, expect, it } from 'vitest'

import { DEFAULT_INPUTS, simulate, type PlanInputs } from '@/lib/retirement'
import { inputsToPlan, planToInputs } from '@/lib/plan'
import { normalisePlanInputs } from '@/lib/store/normalise'
import type { RetirementPlan } from '@/lib/db/schema'

/**
 * Income that stops.
 *
 * Every other-income stream ran for life before this field existed: part-time
 * work bridging to Medicare, a consulting contract, a rental meant to be sold
 * — all of them counted until death. That overstates a plan by decades and
 * does it silently, which is the shape of error this project keeps writing
 * down rather than the shape it can afford to keep making.
 */
const barista = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  currentAge: 50,
  retirementAge: 52,
  endAge: 90,
  brokerageBalance: 400_000,
  balance401k: 600_000,
  monthlyContribution: 0,
  monthlyRetirementSpending: 5_000,
  // The barista-FIRE shape: part-time work from the day the job stops, kept on
  // for the health cover, dropped when Medicare starts.
  otherIncomeMonthly: 2_000,
  otherIncomeStartAge: 52,
  otherIncomeEndAge: 65,
  ...over,
})

const otherIncomeAt = (inputs: PlanInputs, age: number) =>
  simulate(inputs).rows.find((r) => r.age === age)?.otherIncome ?? 0

describe('other income that stops', () => {
  it('pays through the year before the end age, and nothing after', () => {
    const p = barista()
    expect(otherIncomeAt(p, 60)).toBeGreaterThan(0)
    // Exclusive, like `endAge`: "stops at 65" means the last year paid is 64.
    expect(otherIncomeAt(p, 64)).toBeGreaterThan(0)
    expect(otherIncomeAt(p, 65)).toBe(0)
    expect(otherIncomeAt(p, 80)).toBe(0)
  })

  it('runs for the whole plan when the end age is nothing', () => {
    // The default, and what every plan saved before this field meant. A new
    // field that changed an existing plan's numbers would be the worst
    // possible way to add one.
    const p = barista({ otherIncomeEndAge: 0 })
    expect(otherIncomeAt(p, 64)).toBeGreaterThan(0)
    expect(otherIncomeAt(p, 89)).toBeGreaterThan(0)
  })

  it('changes nothing for a plan that does not use it', () => {
    const without = simulate(barista({ otherIncomeEndAge: 0 }))
    const legacy = simulate(barista({ otherIncomeEndAge: undefined as unknown as number }))
    expect(legacy.rows.at(-1)!.endBalance).toBeCloseTo(without.rows.at(-1)!.endBalance, 6)
  })

  it('counts nothing when it would end before it starts', () => {
    const p = barista({ otherIncomeStartAge: 60, otherIncomeEndAge: 55 })
    for (const age of [55, 60, 70]) expect(otherIncomeAt(p, age)).toBe(0)
  })

  /**
   * The reason the field exists, priced.
   *
   * A stream that never stops props the plan up for forty years. The
   * difference is the size of the error somebody was carrying without knowing.
   */
  it('leaves a materially smaller plan than income for life', () => {
    const stops = simulate(barista()).rows.at(-1)!.endBalance
    const forever = simulate(barista({ otherIncomeEndAge: 0 })).rows.at(-1)!.endBalance
    expect(forever).toBeGreaterThan(stops)
    expect(forever - stops).toBeGreaterThan(100_000)
  })
})

/**
 * A field is only added once it survives every road in and out.
 *
 * Missing either direction of the mapping saves it and never returns it, or
 * returns it and never saves it — and the local store drops it silently.
 */
describe('the field survives storage', () => {
  it('round-trips through the plan mapping', () => {
    const inputs = barista({ otherIncomeEndAge: 67 })
    const stored = inputsToPlan(inputs)
    expect(stored.otherIncomeEndAge).toBe(67)
    const back = planToInputs(stored as unknown as RetirementPlan)
    expect(back.otherIncomeEndAge).toBe(67)
  })

  it('round-trips through the local store’s reader', () => {
    expect(normalisePlanInputs({ otherIncomeEndAge: 65 }).otherIncomeEndAge).toBe(65)
  })

  it('defaults to never-stops for a payload written before it existed', () => {
    // The forgiving read: an older file has no such key and must load with the
    // behaviour it was saved under, not with a zero that changes the answer.
    expect(normalisePlanInputs({ otherIncomeMonthly: 500 }).otherIncomeEndAge).toBe(0)
  })
})
