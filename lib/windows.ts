import type { PlanInputs, PlanResult } from '@/lib/retirement'
import { rmdAge } from '@/lib/rmd'
import { PENALTY_FREE_AGE } from '@/lib/tax'
import { LOOKBACK_YEARS, MEDICARE_AGE } from '@/lib/irmaa'
import {
  FULL_RETIREMENT_AGE,
  MAX_CLAIM_AGE,
  MIN_CLAIM_AGE,
  benefitFactorLabel,
} from '@/lib/social-security'

/**
 * Doors that are still open, and when each one shuts.
 *
 * Deliberately the least opinionated surface in the app. Every other card
 * eventually names an amount; this one names a deadline and stops. A window
 * closing is a fact about the calendar rather than a view about what somebody
 * should do with it, which is what makes it both the safest thing here to say
 * and the hardest to find anywhere else — a projection cannot express "this
 * option disappears in four years", because a projection has no notion of an
 * option at all.
 *
 * The separation is worth keeping. If an item here ever starts recommending an
 * amount, it belongs in Suggested Actions with the alternatives beside it, not
 * in a section whose whole claim is that it is not telling you what to do.
 */

export interface OpenWindow {
  key: string
  /** The door, named as a thing rather than an instruction. */
  title: string
  /** When it applies, in this plan's own ages. Short: it renders as a chip. */
  window: string
  /** How the rule works, and where this plan sits inside it. */
  body: string
  /**
   * What cannot be taken back.
   *
   * Optional because not every window has one, and rendered apart from the
   * body where it does. Irreversibility is the reason a deadline matters at
   * all, and burying it mid-paragraph wastes the only genuinely urgent
   * sentence on the card.
   */
  oneWay?: string
  /** Lower shows first. */
  priority: number
}

/**
 * However many are open, this is as many as anyone reads.
 *
 * Lower than the insights cap on purpose. This card sits below one that is
 * already a list, and two long lists stacked read as one wall.
 */
export const MAX_WINDOWS = 4

const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`

/**
 * Which windows this particular plan still has open.
 *
 * Triggered off the plan's own figures rather than offered to everyone: a
 * household with no 401(k) has no conversion window, and telling them about
 * one anyway turns a finding into a pamphlet.
 */
export function openWindows(inputs: PlanInputs, result: PlanResult): OpenWindow[] {
  const out: OpenWindow[] = []
  const thisYear = result.rows[0]?.year ?? new Date().getFullYear()
  const age = inputs.currentAge
  const retire = Math.max(inputs.retirementAge, age)
  const deferred = inputs.balance401k + inputs.traditionalIraBalance
  const rmd = rmdAge(age, thisYear)

  // 1. The stretch between the last salary and the first forced withdrawal.
  //    The only years in a life with neither, and it ends on a fixed date.
  if (deferred > 0 && retire < rmd && age < rmd) {
    const opens = Math.max(retire, age)
    const left = rmd - opens
    out.push({
      key: 'conversion-window',
      priority: 10,
      title: 'The years between your last paycheck and the first forced withdrawal',
      window: `Ages ${retire}–${rmd - 1} · ${years(rmd - retire)}`,
      body:
        `From ${rmd} the law requires a slice of the 401(k) and IRA to come out every year and be ` +
        `taxed as ordinary income, whether or not you need the money. Until then nothing is forced. ` +
        `This plan stops earning at ${inputs.retirementAge}, so between ${retire} and ${rmd - 1} it has ` +
        `neither a salary nor a required distribution — the lowest-income stretch it will ever have, ` +
        `and ${years(left)} of it ${age >= retire ? 'remain' : 'lie ahead'}. What is worth doing inside ` +
        `those years is a separate question; the Tax tab prices one version of it. The point here is only ` +
        `that the stretch is finite and the date it ends on is already set.`,
      oneWay:
        `The window does not reopen. Once distributions begin they occupy the low brackets first, ` +
        `so income taken after ${rmd} is stacked on top of them rather than in place of them.`,
    })
  }

  // 2. Leaving between 55 and 59½. Rare, easily forfeited by accident, and
  //    worth more than almost anything else on this card when it applies.
  if (
    inputs.balance401k > 0 &&
    inputs.retirementAge >= 55 &&
    inputs.retirementAge < PENALTY_FREE_AGE &&
    age < PENALTY_FREE_AGE
  ) {
    out.push({
      key: 'rule-of-55',
      priority: 12,
      title: 'Reaching the 401(k) before 59½, because of when you stop',
      window: `Ages 55–59½ · this plan retires at ${inputs.retirementAge}`,
      body:
        `A tax-deferred withdrawal before 59½ normally carries an extra 10% on top of the income tax. ` +
        `There is an exception for leaving work: if you separate from an employer in or after the ` +
        `calendar year you turn 55, that employer's plan can be drawn on straight away without the ` +
        `penalty. This plan retires at ${inputs.retirementAge}, which is inside that range, so the ` +
        `exception is available to it.`,
      oneWay:
        `The exception belongs to the employer's plan, not to you. Rolling that balance into an IRA ` +
        `ends it permanently — the IRA then follows the ordinary 59½ rule — and it is a common thing ` +
        `to do at retirement without realising what it costs.`,
    })
  }

  // 3. Claiming. A range rather than a deadline, with a hard stop at the top
  //    that a good many people miss by waiting past it.
  if (inputs.socialSecurityMonthly > 0 && age < MAX_CLAIM_AGE) {
    const claim = inputs.socialSecurityAge
    out.push({
      key: 'claiming-range',
      priority: 20,
      title: 'When to start Social Security',
      window: `Ages ${MIN_CLAIM_AGE}–${MAX_CLAIM_AGE} · this plan claims at ${claim}`,
      body:
        `The benefit can start any month between ${MIN_CLAIM_AGE} and ${MAX_CLAIM_AGE}. Starting before ` +
        `full retirement age — ${FULL_RETIREMENT_AGE} — permanently reduces the monthly amount; waiting ` +
        `past it raises the amount by about 8% for each year, and the increases stop dead at ` +
        `${MAX_CLAIM_AGE}. This plan claims at ${claim}, which is ${benefitFactorLabel(claim)} of the full ` +
        `benefit. Waiting later than ${MAX_CLAIM_AGE} adds nothing at all, which is the part worth ` +
        `knowing: it is a range with a ceiling, not a case of later always being better.`,
      oneWay:
        `There is one way back. Within twelve months of starting you can withdraw the application and ` +
        `repay what you have been paid — once in a lifetime. After that the rate you started at is the ` +
        `rate you keep.`,
    })
  }

  // 4. The lookback. The one rule here that prices a decision two years before
  //    the bill for it appears, which nothing on a projection can show.
  const firstJudged = MEDICARE_AGE - LOOKBACK_YEARS
  /**
   * Near enough for the lag to be actionable.
   *
   * The rule is true at 30 as much as at 60, but "33 years away" is not a
   * deadline, it is trivia — and on a fuller plan it would push something live
   * off the card. A window earns its place by being close enough to change
   * what somebody does this decade.
   */
  const LOOKBACK_HORIZON = 10
  if (age < MEDICARE_AGE && age >= firstJudged - LOOKBACK_HORIZON) {
    const inside = age >= firstJudged
    out.push({
      key: 'irmaa-lookback',
      priority: 30,
      title: `The first tax year Medicare will judge you on is the one you turn ${firstJudged}`,
      window: inside
        ? `Already inside it · you are ${age}`
        : `From age ${firstJudged} · ${years(firstJudged - age)} away`,
      body:
        `Medicare charges higher earners a surcharge on Parts B and D from ${MEDICARE_AGE}, and it decides ` +
        `using the tax return from two years earlier. So the earliest return that can raise your ` +
        `premiums is the one for the year you turn ${firstJudged}` +
        `${inside ? `, and at ${age} you are already inside that stretch` : `, ${years(firstJudged - age)} from now`}. ` +
        `Income taken in a year sets a bill that does not arrive until two years later` +
        `${
          inputs.retirementAge < MEDICARE_AGE
            ? `. That matters more than usual here, because this plan stops work at ${inputs.retirementAge}: ` +
              `the years just after retiring are both the cheapest years to take income and the first ` +
              `years Medicare will look at`
            : ''
        }.`,
      oneWay:
        `By the time a premium is set, the year that set it is closed. A form — SSA-44 — can have it ` +
        `reassessed after a life-changing event, and retiring is one of them, but not merely because ` +
        `a year's income was unusually high.`,
    })
  }

  // 5. The clock nobody starts on time, because it is a property of the
  //    account rather than of any dollar in it.
  if (inputs.rothIraBalance === 0 && (deferred > 0 || inputs.monthlyContribution > 0)) {
    out.push({
      key: 'roth-five-year',
      priority: 40,
      title: 'The five-year clock on a Roth has not started',
      window: 'Five tax years from the first funding',
      body:
        `Earnings inside a Roth come out tax-free only once the account has been open five tax years, ` +
        `counted from 1 January of the year it is first funded rather than from the day any particular ` +
        `dollar goes in. This plan holds no Roth, so that clock is not running. Each conversion also ` +
        `carries its own five-year period before the converted amount can be withdrawn without the 10% ` +
        `penalty, which only bites under 59½.`,
    })
  }

  // 6. Narrow, but a genuine door with a date on it.
  if (inputs.traditionalIraBalance > 0 && age < 70.5) {
    out.push({
      key: 'qcd',
      priority: 50,
      title: 'Giving straight from an IRA becomes possible at 70½',
      window: `From 70½ · ${years(Math.ceil(70.5 - age))} away`,
      body:
        `From 70½ money can go directly from an IRA to a charity without passing through your income at ` +
        `all. Being excluded rather than deducted is the difference that matters: it lowers the income ` +
        `that Social Security taxability and the Medicare surcharge are both judged on, which a ` +
        `deduction does not. Once required distributions have begun it counts toward that year's ` +
        `amount. There is an annual limit, indexed to inflation. It works from IRAs only — not from a ` +
        `401(k) — which is worth knowing before any balance is moved between the two.`,
    })
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, MAX_WINDOWS)
}
