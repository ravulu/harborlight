import type { PlanInputs, PlanResult } from '@/lib/retirement'
import type { MonteCarloResult } from '@/lib/monte-carlo'
import { FEDERAL, CAPITAL_GAINS, taxableSocialSecurity } from '@/lib/tax'
import { benefitFactor, MAX_CLAIM_AGE } from '@/lib/social-security'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'

/**
 * The age required minimum distributions begin, which SECURE 2.0 sets by birth
 * year rather than by a single number: 73 for 1951 to 1959, 75 for 1960 on.
 * Most people planning a retirement today are in the second group, so quoting
 * 73 at everyone would be wrong for the majority of them.
 */
export function rmdAge(currentAge: number, thisYear: number): number {
  const birthYear = thisYear - currentAge
  return birthYear >= 1960 ? 75 : 73
}

/** Uniform Lifetime Table divisor at the first RMD age. */
const RMD_DIVISOR: Record<number, number> = { 73: 26.5, 75: 24.6 }

export interface Insight {
  key: string
  title: string
  body: string
  /**
   * Lower shows first. A plan can trip most of these at once, and a wall of
   * them is read as a wall — so what is urgent goes above what is merely
   * available, and only the first few are shown.
   */
  priority: number
}

/** However many apply, this is as many as anyone reads. */
const MAX_SHOWN = 6

/**
 * What this particular plan makes possible, or makes urgent.
 *
 * Every one of these is worked out from the figures on the page rather than
 * offered as general advice — an insight that would read the same for everyone
 * is not an insight, it is a pamphlet. Each rule states the number that
 * triggered it so the reader can check it against their own plan.
 */
export function buildInsights(
  inputs: PlanInputs,
  result: PlanResult,
  monteCarlo: MonteCarloResult,
): Insight[] {
  const out: Insight[] = []
  const money = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Math.round(v))

  const retireAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const years = result.rows.filter((r) => r.phase === 'retirement')
  const first = years[0]
  const thisYear = result.rows[0]?.year ?? new Date().getFullYear()
  const startRmd = rmdAge(inputs.currentAge, thisYear)
  const fed = FEDERAL[inputs.filingStatus]
  const deferredNow = inputs.balance401k + inputs.traditionalIraBalance
  const savings =
    inputs.brokerageBalance + deferredNow + inputs.rothIraBalance
  const confidence = monteCarlo.successRate
  const horizon = Math.max(0, inputs.endAge - retireAge)

  if (!first || savings <= 0) return out

  // Ordinary income in the first retirement year, which is what decides how
  // much room is left in the lower brackets.
  const ordinaryBase = first.fromDeferred + first.otherIncome
  const gains = first.fromBrokerage * (inputs.brokerageGainShare / 100)
  const taxableSS = taxableSocialSecurity(
    first.socialSecurity,
    ordinaryBase + gains,
    inputs.filingStatus,
  )
  const ordinaryIncome = ordinaryBase + taxableSS
  const ordinaryTaxable = Math.max(0, ordinaryIncome - fed.standardDeduction)

  // 1. The years between stopping work and RMDs are usually the emptiest
  // income years of a life, and the only ones where the lower brackets are
  // free to be filled on purpose.
  const gapYears = Math.max(0, startRmd - retireAge)
  const topOf12 = fed.brackets.find((b) => b.rate === 22)?.from ?? 0
  const bracketRoom = Math.max(0, topOf12 - ordinaryTaxable)
  if (deferredNow > 50_000 && gapYears >= 2 && bracketRoom > 5_000) {
    out.push({
      key: 'conversion',
      priority: 40,
      title: `A ${gapYears}-year window to move money into a Roth cheaply`,
      body:
        `Between ${retireAge} and ${startRmd} this plan draws little ordinary income, leaving about ` +
        `${money(bracketRoom)} a year of room below the 22% bracket. Converting that much of the ` +
        `${money(deferredNow)} in the 401(k) and IRA each year fills the cheap brackets deliberately ` +
        `instead of leaving it to be taxed later at whatever rate applies then — and it shrinks the ` +
        `required distributions waiting at ${startRmd}. The tax is due in the year of the conversion, ` +
        `so it wants paying from outside the account.`,
    })
  }

  // 2. Gains are free below the threshold, and the threshold is generous.
  const zeroGainTop = CAPITAL_GAINS[inputs.filingStatus][1]?.from ?? 0
  const gainRoom = Math.max(0, zeroGainTop - ordinaryTaxable - gains)
  if (inputs.brokerageBalance > 25_000 && gainRoom > 5_000) {
    out.push({
      key: 'gains',
      priority: 45,
      title: `About ${money(gainRoom)} of gains a year at no federal tax`,
      body:
        `Long-term gains are taxed at 0% until taxable income reaches ${money(zeroGainTop)}, and this ` +
        `plan sits well below it. Selling appreciated holdings up to that line costs nothing federally ` +
        `and resets the cost basis higher, so less is taxable when the money is actually needed. ` +
        `State tax usually still applies.`,
    })
  }

  // 3. What is waiting at the RMD age, against what the plan meant to draw.
  const atRmd = years.find((r) => r.age === startRmd)
  if (atRmd && deferredNow > 200_000) {
    // Read off the projection rather than compounded again here.
    //
    // The version this replaces grew the opening balance at the nominal return
    // for the whole span, which is a different unit from everything else on
    // the page: 7% over fifteen years is 2.76x in nominal dollars but 1.91x in
    // today's. It also charged the retirement return against the working years
    // and ignored the contributions paid in during them. On a test plan it
    // came out 30% high — $4.41m against the $3.38m the projection was
    // actually holding.
    const grown = atRmd.deferredBalance
    const firstRmd = grown / (RMD_DIVISOR[startRmd] ?? 26.5)
    if (firstRmd > first.fromDeferred + 1_000) {
      out.push({
        key: 'rmd',
        priority: 30,
        title: `Required distributions at ${startRmd} may exceed what you planned to draw`,
        body:
          `By ${startRmd} the 401(k) and IRA reach ${money(grown)} in today's money, ` +
          `and the first required distribution would be about ${money(firstRmd)} — against ` +
          `${first.fromDeferred < 1 ? 'nothing at all, since the other accounts cover the spending' : `the ${money(first.fromDeferred)} this plan draws from them`} ` +
          `in its first retirement year. ` +
          `Anything above what you need is still taxable, and it can push more of your Social ` +
          `Security into tax with it. Drawing more from those accounts earlier, or converting some, ` +
          `is what keeps that from arriving all at once.`,
      })
    }
  }

  // 4. One tax treatment is one option; three is a choice every year.
  //
  // Which one it is decides what the advice can be. Telling someone whose
  // savings are entirely in a 401(k) to fund a big year "from the Roth" names
  // an account they do not have, and offering them a cheap 401(k) withdrawal
  // describes the only thing they can already do.
  const kinds = [
    { key: 'deferred', amount: deferredNow },
    { key: 'taxable', amount: inputs.brokerageBalance },
    { key: 'roth', amount: inputs.rothIraBalance },
  ].sort((a, b) => b.amount - a.amount)
  const dominant = kinds[0]
  if (dominant.amount / savings >= 0.85) {
    const pct = Math.round((dominant.amount / savings) * 100)
    // "Nearly all" reads oddly against a figure of 100%.
    const all = pct >= 100 ? 'All' : 'Nearly all'
    const heading = {
      deferred: `${all} of this is in the 401(k) and IRA`,
      taxable: `${all} of this is in a taxable account`,
      roth: `${all} of this is in the Roth`,
    }[dominant.key] as string
    const body = {
      deferred:
        `${pct}% of the ${money(savings)} is tax-deferred, so every dollar you take out is income in ` +
        `the year you take it, and there is no way to raise cash without raising your income with it. ` +
        `A year with a large one-off cost — a roof, a car, a health bill — has to be funded at whatever ` +
        `bracket that pushes you into. A Roth is what gives you a source that does not count: built ` +
        `from contributions now, or by converting part of the 401(k) in a low-income year. A taxable ` +
        `account does some of the same work, since only the growth is taxed and often at 0%.`,
      taxable:
        `${pct}% of the ${money(savings)} is in a taxable account, so its growth is taxed as it happens ` +
        `rather than sheltered — dividends and interest each year whether you spend them or not. A ` +
        `401(k) or IRA would cut this year's tax bill on the way in; a Roth would remove the tax on ` +
        `the growth altogether. Either one turns money that is taxed twice into money taxed once.`,
      roth:
        `${pct}% of the ${money(savings)} is Roth, which is the best of the three problems to have — ` +
        `nothing is owed on any of it. What it costs you is the other direction: the lower brackets go ` +
        `unused every year, when a 401(k) or traditional IRA withdrawal could have filled them cheaply, ` +
        `and contributions to one would cut the tax you pay while still working.`,
    }[dominant.key] as string
    out.push({ key: 'diversification', priority: 70, title: heading, body })
  }

  // 5. The limits rise at 50, and again for four years at 60.
  const yearsWorking = Math.max(0, inputs.retirementAge - inputs.currentAge)
  if (inputs.currentAge >= 45 && yearsWorking > 0) {
    const superCatchUp = inputs.currentAge >= 60 && inputs.currentAge <= 63
    out.push({
      key: 'catchup',
      priority: 35,
      title: superCatchUp
        ? 'You are in the four years with the highest 401(k) limit'
        : 'The contribution limits rise once you turn 50',
      body: superCatchUp
        ? `From 60 to 63 the catch-up is ${money(11250)} rather than ${money(8000)}, so the 2026 401(k) ` +
          `limit is ${money(35750)}. It drops back to ${money(32500)} at 64, which makes these four years ` +
          `the largest tax-deferred contributions you will get to make.`
        : `In 2026 the 401(k) limit is ${money(24500)}, plus ${money(8000)} from age 50 — and ${money(11250)} ` +
          `instead between 60 and 63. The IRA limit is ${money(7500)} plus ${money(1100)} from 50. ` +
          `With ${yearsWorking} ${yearsWorking === 1 ? 'year' : 'years'} of saving left, the catch-up ` +
          `years are the ones carrying the most weight.`,
    })
  }

  // 6. A plan can be short by a little or short by a lot, and the answer is
  // different. Only raised when it is actually short.
  if (confidence < TARGET_CONFIDENCE) {
    const gap = Math.round((TARGET_CONFIDENCE - confidence) * 100)
    out.push({
      key: 'shortfall',
      priority: 10,
      title:
        gap <= 10
          ? `${gap} points short — the smaller levers are enough`
          : `${gap} points short — this needs more than trimming`,
      body:
        gap <= 10
          ? `A gap this size usually closes without changing the shape of the plan: an employer match ` +
            `left unclaimed, a year or two more of work, or spending held a little lower in the early ` +
            `years when withdrawals do the most damage. The suggestions above give the size of each.`
          : `A gap this size rarely closes on saving alone, because the years left to compound are ` +
            `fewer than the years being funded. The combinations that work usually pair a later ` +
            `retirement with lower spending in the first decade, and claiming Social Security later ` +
            `to raise the floor that lasts for life.`,
    })
  }

  // 7. The order the returns arrive in matters more than their average, and
  // most of all in the years either side of retiring.
  if (yearsWorking <= 10 && confidence < 0.97) {
    out.push({
      key: 'sequence',
      priority: 20,
      title: 'The next decade of returns counts for more than the rest',
      body:
        `Withdrawals turn a bad early year into a permanent loss: money sold to live on is not there ` +
        `to recover. Two plans with the same average return over ${horizon} years can end very far ` +
        `apart depending on which years were the bad ones, which is why the spread on this page is as ` +
        `wide as it is. Holding a year or two of spending in cash is the usual answer — it lets a bad ` +
        `year be waited out rather than sold into.`,
    })
  }

  // 8. The rule everyone quotes was measured over thirty years.
  if (horizon > 32) {
    out.push({
      key: 'horizon',
      // Near the top rather than last: it changes how the confidence figure
      // above should be read, so being cut by the cap made it dead code.
      priority: 22,
      title: `This plan runs ${horizon} years, and the 4% rule was built for 30`,
      body:
        `The rule comes from historical 30-year windows. Over ${horizon} years the same withdrawal ` +
        `has more chances to meet a bad decade, so the rate that survives is lower — nearer 3.3% than ` +
        `4% on most of the work that has extended it. The confidence figure on this page is measured ` +
        `over your own horizon rather than a thirty-year one, which is why it may read lower than the ` +
        `rule would suggest.`,
    })
  }

  // 9. The match is the only guaranteed return on offer anywhere in a plan.
  if (yearsWorking > 0 && inputs.monthlyContribution > 0) {
    out.push({
      key: 'match',
      priority: 15,
      title: 'Check you are getting the whole employer match first',
      body:
        `Your ${money(inputs.monthlyContribution)} a month is what this plan grows on, but not every dollar ` +
        `of it is worth the same. A match is an immediate return of 50% or 100% on the part that earns ` +
        `it, which nothing else in a portfolio offers and no market has to cooperate with. If the ` +
        `contribution is set below whatever your employer matches, raising it to that line is the ` +
        `highest-return change available to this plan.`,
    })
  }

  // 10. The only account taxed nowhere at all, if it is spent on health.
  if (yearsWorking > 0 && inputs.currentAge < 65) {
    const catchUp = inputs.currentAge >= 55
    out.push({
      key: 'hsa',
      priority: 25,
      title: 'An HSA is the only account taxed at neither end',
      body:
        `If you are on a high-deductible health plan, ${money(4400)} on your own or ${money(8750)} for a ` +
        `family goes in untaxed in 2026${catchUp ? `, plus ${money(1000)} from 55` : ''}, grows untaxed, and comes out ` +
        `untaxed for medical costs — which are the expense this plan is least able to predict. After 65 ` +
        `anything else it is spent on is taxed like a 401(k) withdrawal but without a penalty, so it is ` +
        `a retirement account that happens to be free if health costs arrive. Contributions stop when ` +
        `Medicare starts.`,
    })
  }

  // 11. The same portfolio, in a different order of accounts, keeps more.
  const taxableShare = inputs.brokerageBalance / savings
  const deferredShare = deferredNow / savings
  if (taxableShare > 0.15 && deferredShare > 0.15 && savings > 100_000) {
    out.push({
      key: 'location',
      priority: 60,
      title: 'Which holdings sit in which account is worth something on its own',
      body:
        `With ${money(inputs.brokerageBalance)} taxable and ${money(deferredNow)} tax-deferred, you can ` +
        `choose where each kind of holding lives without changing what you own. Bonds and anything ` +
        `throwing off interest are taxed every year in a brokerage account, so they cost least inside ` +
        `the 401(k). Shares held for growth belong in the taxable account, where the gain is taxed at ` +
        `the lower rate and only when sold — and in the Roth, where the growth is the part that never ` +
        `gets taxed at all.`,
    })
  }

  // 12. After 70½ a charitable gift can leave the IRA without ever being
  // income, which is worth more than deducting it.
  if (deferredNow > 100_000 && inputs.endAge >= 71) {
    out.push({
      key: 'qcd',
      priority: 65,
      title: 'From 70½ charitable giving can come straight out of the IRA',
      body:
        `A qualified charitable distribution sends up to ${money(111_000)} a year from an IRA directly to a ` +
        `charity, and it never counts as your income at all — better than deducting the gift, since it ` +
        `also keeps your income low enough to matter for Social Security taxability and Medicare ` +
        `premiums. From ${startRmd} it counts toward the required distribution, so it is the one way to ` +
        `satisfy that without the tax bill attached.`,
    })
  }

  // 13. Spending savings to delay claiming buys a bigger benefit for life.
  if (
    inputs.socialSecurityMonthly > 0 &&
    inputs.socialSecurityAge < MAX_CLAIM_AGE &&
    retireAge <= inputs.socialSecurityAge
  ) {
    const now = inputs.socialSecurityMonthly * benefitFactor(inputs.socialSecurityAge)
    const at70 = inputs.socialSecurityMonthly * benefitFactor(MAX_CLAIM_AGE)
    const waitYears = MAX_CLAIM_AGE - inputs.socialSecurityAge
    const bridgeCost = now * 12 * waitYears
    if (at70 - now > 100) {
      out.push({
        key: 'bridge',
        priority: 50,
        title: `Waiting until 70 raises the benefit from ${money(now)} to ${money(at70)} a month`,
        body:
          `Claiming at ${inputs.socialSecurityAge} and waiting to ${MAX_CLAIM_AGE} differ by ` +
          `${money(at70 - now)} a month, for life, rising with inflation — the only income here that ` +
          `cannot run out. Bridging the ${waitYears} ${waitYears === 1 ? 'year' : 'years'} from savings ` +
          `costs roughly ${money(bridgeCost)} of benefit not taken, which usually pays back in the ` +
          `mid-eighties. It is worth most to whichever of a couple earned more, since that benefit is ` +
          `the one the survivor keeps.`,
      })
    }
  }

  return out.sort((a, b) => a.priority - b.priority).slice(0, MAX_SHOWN)
}
