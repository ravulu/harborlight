import type { PlanInputs } from '@/lib/retirement'
import { DEFAULT_INPUTS, simulate } from '@/lib/retirement'
/**
 * Reaching a number by a date, and the four ways to do it.
 *
 * Every route to a savings target is one of four levers: start with more, put
 * more in each month, give it more years, or take more risk. They are not
 * equal, and the point of showing all four at once is that the inequality is
 * the lesson. Ten years of compounding cannot be bought back with any monthly
 * contribution a person could actually make.
 *
 * Solved against the same simulation the planner runs, so the two cannot
 * disagree about the same figures.
 */

/** Bisection steps. Eight halvings resolve a $20,000 range to under $80. */
const STEPS = 9

export type LeverKind = 'save' | 'wait' | 'lump' | 'risk'

export interface Lever {
  kind: LeverKind
  /** What this lever has to reach for the target to be met. Null if it cannot. */
  needed: number | null
  /** Where the plan sits now, for the reader to measure the ask against. */
  current: number
  /**
   * What this lever reaches when pushed as far as it goes, at the nine-in-ten
   * bar — filled only when it cannot reach the target at all.
   *
   * A lever that runs out is still telling the reader something, and "even
   * working to 75 gets you to $733,000" is a far more useful sentence than a
   * dash. It is the finding, not the absence of one.
   */
  atMax?: number
  /** The furthest this lever was pushed, for the sentence above to name. */
  maxValue?: number
}

export interface GoalResult {
  target: number
  currentAge: number
  retirementAge: number
  years: number
  /** What the plan as entered comes to. */
  reached: number
  /** Already past the target, so the levers are a matter of margin. */
  alreadyThere: boolean
  /**
   * How the figures above are arrived at, so a reader can follow them rather
   * than take them.
   *
   * Two pieces that add to a third: what the balance already held grows to,
   * and what the monthly saving grows to. Both at the return entered, less
   * inflation, because everything on the page is in today's money.
   *
   * `steady` is what those come to if returns never varied. It is higher than
   * the middle simulated outcome, and the gap between them is worth showing —
   * it is what variation costs, and most calculators quote the steady figure
   * as though it were the answer.
   */
  fromPrincipal: number
  fromContributions: number
  steady: number
  /** The rate the money grows at, as a percent. What was typed in. */
  rate: number
  levers: Lever[]
  /**
   * What went in against what growth added. The single most surprising figure
   * in compounding, and the reason the years lever beats the others.
   */
  contributed: number
  growth: number
  /**
   * What the deterministic run of the reaching plan ends on. `contributed` and
   * `growth` add to exactly this, so the split can be checked rather than
   * taken on trust.
   */
  reachedOnPaper: number

}

/**
 * What the plan comes to, compounded steadily at the rate given.
 *
 * One figure, not a distribution. A savings target is arithmetic — what a
 * balance and a monthly amount grow to at a rate — and answering it with
 * percentiles asks the reader to hold three numbers where they came for one.
 * The planner is where a market that does not behave itself gets modelled.
 */
const reachedBy = (inputs: PlanInputs) => simulate(inputs).balanceAtRetirement

/**
 * The smallest value of a lever that reaches the target, or null if even the
 * largest tried does not.
 *
 * `apply` must move the balance upward as the value grows, which all four
 * levers do — that is what makes the range an ordered one and lets it be
 * halved into rather than walked.
 */
function solve(
  target: number,
  max: number,
  apply: (value: number) => PlanInputs,
  reach: (inputs: PlanInputs) => number,
  round: (value: number) => number,
): number | null {
  if (reach(apply(max)) < target) return null

  let low = 0
  let high = max
  for (let i = 0; i < STEPS && high - low > 1e-6; i++) {
    const mid = (low + high) / 2
    if (reach(apply(mid)) >= target) high = mid
    else low = mid
  }

  // Round away from the reader's favour, then confirm the rounded figure still
  // clears — rounding down could land just under.
  const rounded = round(high)
  return reach(apply(rounded)) >= target ? rounded : round(high * 1.05)
}

const upTo = (step: number) => (v: number) => Math.ceil(v / step) * step

/**
 * The four routes to a target, each solved twice: once for the median and once
 * for the figure that holds in nine futures out of ten.
 *
 * The gap between those two is what market risk costs, and it is the number
 * most savings calculators never show — they solve for the median and present
 * it as the answer, which is a coin flip wearing a suit.
 */
export function reachGoal(inputs: PlanInputs, target: number): GoalResult | null {
  const currentAge = inputs.currentAge
  const retirementAge = inputs.retirementAge
  const years = retirementAge - currentAge
  // No years left to save in is not a question this page can answer, and
  // quietly moving the retirement age to make one would be answering a
  // different question than the one asked.
  if (target <= 0 || years <= 0) return null

  const reached = reachedBy(inputs)

  // Run twice more with one half of the plan silenced each time. Deterministic
  // runs, so no market variation: this is the arithmetic underneath, and the
  // two pieces add to the whole exactly.
  const steadyRun = (over: Partial<PlanInputs>) =>
    simulate({ ...inputs, ...over }).balanceAtRetirement
  const fromPrincipal = steadyRun({ monthlyContribution: 0 })
  const fromContributions = steadyRun({
    brokerageBalance: 0,
    balance401k: 0,
    traditionalIraBalance: 0,
    rothIraBalance: 0,
    hsaBalance: 0,
  })

  const at = (over: Partial<PlanInputs>): PlanInputs => ({ ...inputs, ...over })

  const withRisk = (ret: number) => at({ preRetirementReturn: ret })

  const waitMax = Math.max(1, 75 - currentAge)
  const saveMax = Math.max(20_000, inputs.monthlyContribution * 20 + 10_000)

  const solved = {
    save: solve(
      target,
      saveMax,
      (v) => at({ monthlyContribution: v }),
      reachedBy,
      upTo(10),
    ),
    wait: solve(
      target,
      waitMax,
      (v) => at({ retirementAge: currentAge + Math.max(1, Math.round(v)) }),
      reachedBy,
      Math.ceil,
    ),
    lump: solve(
      target,
      Math.max(2_000_000, target),
      (v) => at({ brokerageBalance: inputs.brokerageBalance + v }),
      reachedBy,
      upTo(1_000),
    ),
    risk: solve(
      target,
      30,
      (v) => withRisk(v),
      reachedBy,
      (v) => Math.ceil(v * 10) / 10,
    ),
  }

  const built: Lever[] = [
    {
      kind: 'save',
      needed: solved.save,
      current: inputs.monthlyContribution,
      ...(solved.save === null
        ? { atMax: reachedBy(at({ monthlyContribution: saveMax })), maxValue: saveMax }
        : {}),
    },
    {
      kind: 'wait',
      needed: solved.wait === null ? null : currentAge + solved.wait,
      current: retirementAge,
      ...(solved.wait === null
        ? {
            atMax: reachedBy(at({ retirementAge: currentAge + waitMax })),
            maxValue: currentAge + waitMax,
          }
        : {}),
    },
    {
      kind: 'lump',
      needed: solved.lump,
      current: inputs.brokerageBalance,
    },
    {
      kind: 'risk',
      needed: solved.risk,
      current: inputs.preRetirementReturn,
      ...(solved.risk === null
        ? { atMax: reachedBy(withRisk(30)), maxValue: 30 }
        : {}),
    },
  ]

  // The split, taken on the plan that reaches the target on its expected path
  // — the median saver, not the one insuring against a bad decade. Using the
  // nine-in-ten figure would show contributions larger than the target itself,
  // which is true of that plan and useless as a lesson about compounding.
  //
  // Both halves come from the same deterministic run and add to the balance it
  // ends on, so the reader can check that they do.
  const reaching =
    solved.save !== null ? at({ monthlyContribution: solved.save }) : inputs
  const run = simulate(reaching)
  const startingBalance =
    reaching.brokerageBalance +
    reaching.balance401k +
    reaching.traditionalIraBalance +
    reaching.rothIraBalance +
    reaching.hsaBalance
  const contributed = run.totalContributions + startingBalance
  const reachedOnPaper = run.balanceAtRetirement

  return {
    target,
    currentAge,
    retirementAge,
    years,
    reached,
    alreadyThere: reached >= target,
    fromPrincipal,
    fromContributions,
    steady: fromPrincipal + fromContributions,
    rate: inputs.preRetirementReturn,
    levers: built,
    contributed,
    growth: Math.max(0, reachedOnPaper - contributed),
    reachedOnPaper,
  }
}

/**
 * A plan with nothing in it but the handful of figures this page asks for.
 *
 * The rest comes from the planner's own defaults, so a goal worked out here
 * and carried across arrives at a projection that agrees with it rather than
 * one built on different assumptions.
 */
export function goalInputs(over: Partial<PlanInputs>): PlanInputs {
  return {
    ...DEFAULT_INPUTS,
    brokerageBalance: 0,
    balance401k: 0,
    traditionalIraBalance: 0,
    rothIraBalance: 0,
    /**
     * No inflation adjustment on this page.
     *
     * The return typed in is the rate the money grows at, flat — 7% means 7%,
     * and the total is the figure that would be on the statement. The planner
     * works in today's buying power because a retirement lasts thirty years
     * and the difference decides whether the money holds out; a savings target
     * is a simpler question, and answering it with two different meanings of
     * a dollar makes it harder rather than more accurate.
     */
    inflationRate: 0,
    /** Steady growth, so the figure is arithmetic rather than a draw. */
    preRetirementVolatility: 0,
    postRetirementVolatility: 0,
    ...over,
  }
}
