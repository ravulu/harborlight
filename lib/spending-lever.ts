import type { PlanInputs } from '@/lib/retirement'
import { earliestRetirement } from '@/lib/earliest'

/**
 * What a pound off the monthly spending is worth, in years.
 *
 * Every other lever in this app is about arranging money that already exists —
 * which account it sits in, which year it comes out, when a benefit starts.
 * This is the one that changes how much there has to be, and it is the only
 * one most people can act on this month.
 *
 * The figure it reports is deliberately the combined effect of a cut made now
 * and kept. A pound not spent today is a pound saved today *and* a pound the
 * retirement no longer has to fund for thirty years — the two work the same
 * way round, which is why a modest cut moves the date so much further than
 * people expect. Splitting them into separate columns would make the lever
 * look weaker than it is by hiding that they compound together; the assumption
 * is stated on the card instead, where it can be disagreed with.
 */

export interface SpendingCut {
  /** The monthly amount given up. */
  monthly: number
  /** The youngest age that still clears the confidence bar, or null. */
  age: number | null
  /** Years earlier than the plan can currently manage. Negative never happens. */
  yearsEarlier: number
}

export interface SpendingLeverage {
  /** Monthly spending as the plan stands. */
  current: number
  /** The youngest age the plan can currently manage, or null if none does. */
  baseAge: number | null
  /** The age the plan asks for, for the reader to measure both against. */
  chosenAge: number
  cuts: SpendingCut[]
  /** True when no cut on offer moves the date, which is itself an answer. */
  noneMove: boolean
}

/**
 * Round numbers, because a cut is something somebody has to actually do.
 *
 * "Spend $287 less" is arithmetic; "spend $250 less" is a decision. Scaled to
 * the plan so the smallest step is meaningful at any size of household — a
 * hundred pounds is a real cut on three thousand a month and noise on twenty.
 */
const STEPS = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000]

function stepFor(monthly: number): number {
  const target = monthly * 0.05
  return STEPS.reduce((best, s) =>
    Math.abs(s - target) < Math.abs(best - target) ? s : best,
  )
}

/**
 * Three cuts and what each buys, or null where the question does not arise.
 *
 * Four solves, each bisecting a Monte Carlo — around 130ms in total, which is
 * affordable beside the ten thousand runs the projection itself already does.
 */
export function spendingLeverage(inputs: PlanInputs): SpendingLeverage | null {
  const current = inputs.monthlyRetirementSpending
  if (current <= 0) return null
  // Nothing to bring forward once you have stopped.
  if (inputs.retirementAge <= inputs.currentAge) return null

  const base = earliestRetirement(inputs)
  if (!base) return null

  const step = stepFor(current)
  const sizes = [step, step * 2, step * 4].filter((s) => s < current)
  if (sizes.length === 0) return null

  const cuts: SpendingCut[] = sizes.map((monthly) => {
    const at = earliestRetirement({
      ...inputs,
      monthlyRetirementSpending: current - monthly,
      // The same cut, kept: what is not spent now is saved instead. This is
      // what makes the lever worth showing rather than merely true.
      monthlyContribution: inputs.monthlyContribution + monthly,
    })
    const age = at?.age ?? null
    return {
      monthly,
      age,
      yearsEarlier:
        age !== null && base.age !== null ? Math.max(0, base.age - age) : 0,
    }
  })

  return {
    current,
    baseAge: base.age,
    chosenAge: base.chosenAge,
    cuts,
    noneMove: cuts.every((c) => c.yearsEarlier === 0),
  }
}
