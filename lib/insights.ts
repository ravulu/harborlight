import type { PlanInputs, PlanResult } from '@/lib/retirement'
import type { MonteCarloResult } from '@/lib/monte-carlo'
import { FEDERAL, CAPITAL_GAINS, taxableSocialSecurity } from '@/lib/tax'
import { benefitFactor, MAX_CLAIM_AGE } from '@/lib/social-security'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'
import { rmdAge } from '@/lib/rmd'
import {
  ASSUMED_PREMIUM_GROWTH,
  IRMAA_YEAR,
  LOOKBACK_YEARS,
  MEDICARE_AGE,
  irmaaTierFor,
  roomBelowNextTier,
} from '@/lib/irmaa'
import type { ConversionComparison } from '@/lib/conversions'

/**
 * Re-exported so the planner's inputs panel, which has always imported it from
 * here, keeps working. The rule itself lives with the rest of the
 * distribution logic in `lib/rmd.ts`, where the projection reads it too — one
 * copy, so the prose on the page and the arithmetic under it cannot drift.
 */
export { rmdAge }

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
  /**
   * The modelled conversion ladder, when the caller has it.
   *
   * Passed in rather than worked out here because the tax tab already has it,
   * and building it means a sweep of simulations plus a market run for every
   * row it shows. More to the point, two answers to the same question is the
   * problem this argument exists to end: this card used to quote the room
   * below the 22% bracket in the first retirement year, which is a different
   * and worse number than the one the tax tab now solves for — it fits one
   * year rather than the plan. A reader saw both and had no way to know which
   * to believe.
   */
  conversions?: ConversionComparison | null,
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
  if (conversions?.worthwhile) {
    const { best, taxSaving, rmdReduction, fromAge, toAge } = conversions
    out.push({
      key: 'conversion',
      priority: 40,
      title: `A ${toAge - fromAge + 1}-year window to move money into a Roth cheaply`,
      body:
        `Between ${fromAge} and ${toAge} this plan draws little ordinary income, so the low brackets ` +
        `sit unused. Moving ${money(best.annual)} a year out of the ${money(deferredNow)} in the ` +
        `401(k) and IRA fills them deliberately: ${money(taxSaving)} less tax across the whole plan, ` +
        `and a first required distribution ${money(rmdReduction)} smaller than it would otherwise be. ` +
        `That is the amount that costs least once ${conversions.beforeMedicare ? 'Medicare and ACA premiums are' : 'Medicare is'} counted — moving more ` +
        `starts costing more, and the Tax tab shows where it turns. The tax is due in the year of ` +
        `the conversion, so it wants paying from outside the account.` +
        (conversions.irmaaSaving > 1
          ? ` It also keeps ${money(conversions.irmaaSaving)} of Medicare surcharges off the plan, ` +
            `by leaving less to be forced out of the 401(k) in the years those premiums are set from.`
          : '') +
        (conversions.beforeMedicare
          ? ` This window opens before Medicare does, so ACA premiums are priced in as well: until ` +
            `65 the subsidy that pays most of your premium is means-tested on income, and above ` +
            `four times the poverty line it stops outright rather than tapering. ` +
            (conversions.cliffRows.length > 0
              ? `${conversions.cliffRows.length === 1 ? 'One of the larger amounts on the Tax tab crosses that line and gives up' : `${conversions.cliffRows.length} of the larger amounts on the Tax tab cross that line and give up`} ` +
                `${money(conversions.cliffCost)} a year of help; ${money(best.annual)} does not, which is ` +
                `part of why it wins.`
              : `Nothing worth converting here crosses that line.`)
          : ''),
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
    // The projection now takes the distribution itself, so the figure is read
    // off the row rather than worked out a second time here. Two calculations
    // of the same number are two chances to disagree with each other, and the
    // one on the page would be the one nobody could check.
    const firstRmd = atRmd.requiredDistribution
    if (firstRmd > first.fromDeferred + 1_000) {
      // What the distributions actually force out over the rest of the plan,
      // and the part of it the spending never asked for. Read off the
      // projection, which now takes them, rather than described as something
      // that might happen later.
      const rmdYears = years.filter((r) => r.requiredDistribution > 0)
      const forcedTotal = rmdYears.reduce((a, r) => a + r.requiredDistribution, 0)
      const surplusTotal = rmdYears.reduce((a, r) => a + r.surplus, 0)
      const taxFromHere = rmdYears.reduce((a, r) => a + r.taxes, 0)

      out.push({
        key: 'rmd',
        priority: 30,
        title: `Required minimum distributions (RMDs) from ${startRmd} take out more than this plan spends`,
        body:
          `By ${startRmd} the 401(k) and IRA reach ${money(grown)} in today's money, and the ` +
          `first RMD is ${money(firstRmd)} — against ` +
          `${first.fromDeferred < 1 ? 'nothing at all, since the other accounts cover the spending' : `the ${money(first.fromDeferred)} this plan draws from them`} ` +
          `in its first retirement year. Across the rest of the plan the rule forces out ` +
          `${money(forcedTotal)} and costs ${money(taxFromHere)} in tax, of which ` +
          `${money(surplusTotal)} is money the spending never called for: it is taxed on the way ` +
          `out and moves to the brokerage account, where its growth is taxable from then on. ` +
          `Drawing more from those accounts earlier, or converting some, is what keeps that from ` +
          `arriving all at once.`,
      })
    }
  }

  // 3b. The Medicare surcharge, which is the cost of the income above rather
  // than a cost of its own — and which nobody sees coming, because it is set
  // by a tax return filed two years before the bill arrives.
  const medicareYears = years.filter((r) => r.age >= MEDICARE_AGE)
  const surcharged = medicareYears.filter((r) => r.irmaaSurcharge > 0)

  if (surcharged.length > 0) {
    const firstHit = surcharged[0]
    // What set that first bill: the income two years earlier, which is the
    // link a reader has no way to make from the table on their own.
    const causeAge = firstHit.age - LOOKBACK_YEARS
    const cause = result.rows.find((r) => r.age === causeAge)
    const worst = surcharged.reduce((a, r) => (r.irmaaSurcharge > a.irmaaSurcharge ? r : a))

    // Why a late year costs so much more than the same income would today.
    //
    // Every figure on the page is in today's money, but the surcharge is the
    // one line grown faster than the inflation that deflates it — so it rises
    // in real terms, and over a long plan the gap compounds into most of the
    // total. A reader who is not told this reasonably assumes the number is
    // today's rates repeated, and it is not.
    const infl = inputs.inflationRate / 100
    const realMultiple = Math.pow(
      (1 + ASSUMED_PREMIUM_GROWTH) / (1 + infl),
      Math.max(0, worst.year - IRMAA_YEAR),
    )
    // Below this the effect is not worth a paragraph, and on a short plan it
    // barely exists. Said only where it is actually driving the figure.
    const premiumsOutpace = realMultiple >= 1.5

    out.push({
      key: 'irmaa',
      priority: 32,
      title: `Medicare charges this plan ${money(result.totalIrmaa)} extra for its income`,
      body:
        `From 65, Medicare adds a surcharge to Parts B and D for higher incomes, and it decides ` +
        `using the tax return from two years earlier. This plan first pays it at ${firstHit.age}, ` +
        `on the ${money(cause?.magi ?? 0)} of income it had at ${causeAge}` +
        `${(cause?.requiredDistribution ?? 0) > 0 ? `, most of it the required distribution that year` : ''} — ` +
        `${
          surcharged.length === 1
            ? `${money(firstHit.irmaaSurcharge)}, and that one year is the only one`
            : worst.irmaaSurcharge > firstHit.irmaaSurcharge
              ? `${money(firstHit.irmaaSurcharge)} that year, rising to ${money(worst.irmaaSurcharge)} at ${worst.age}, and ${money(result.totalIrmaa)} across the plan`
              : `${money(firstHit.irmaaSurcharge)} a year, and ${money(result.totalIrmaa)} across the plan`
        }` +
        `${inputs.filingStatus === 'married' ? ', counting both of you, since it is charged per person' : ''}. ` +
        `It is a premium rather than a tax, so it is not in the tax figures above — it is spending, ` +
        `and the withdrawals have been raised to cover it. The two-year lag is what makes it awkward: ` +
        `by the time the bill lands, the year that caused it is closed.` +
        `${
          surcharged.length > 1
            ? ` The ${money(result.totalIrmaa)} is ${surcharged.length} years of this, not one bill — ` +
              `${money(result.totalIrmaa / surcharged.length)} a year on average.`
            : ''
        }` +
        `${
          premiumsOutpace
            ? ` Part of what drives the figure: the surcharge is the only number here ` +
              `assumed to rise faster than prices. Medicare premiums are grown at ` +
              `${Math.round(ASSUMED_PREMIUM_GROWTH * 100)}% a year against ` +
              `${inputs.inflationRate}% inflation, because Part B has outrun the cost of living for most ` +
              `of the past decade. Everything on this page is in today's money, so that gap shows up as ` +
              `real growth: by ${worst.age} the plan is charged roughly ` +
              `${realMultiple.toFixed(1)}× what the same income costs a household today. That is the ` +
              `cautious end of a long-run assumption rather than a forecast — the further out the year, ` +
              `the more of the figure is the assumption and the less is your income.`
            : ''
        }`,
    })
  } else if (medicareYears.length > 0) {
    // No surcharge — but the thresholds are cliffs, so how close this plan
    // runs to one is worth knowing even when it never crosses.
    const tightest = medicareYears.reduce((a, r) =>
      roomBelowNextTier(r.magi, inputs.filingStatus) <
      roomBelowNextTier(a.magi, inputs.filingStatus)
        ? r
        : a,
    )
    const room = roomBelowNextTier(tightest.magi, inputs.filingStatus)
    if (Number.isFinite(room) && room < 25_000 && tightest.magi > 0) {
      out.push({
        key: 'irmaa',
        priority: 32,
        title: `About ${money(room)} of headroom before Medicare charges you more`,
        body:
          `Medicare adds a surcharge to Parts B and D once income passes a threshold, judged on the ` +
          `tax return from two years earlier. This plan stays under it, but at ${tightest.age} it ` +
          `comes within ${money(room)} — and the threshold is a cliff rather than a slope: a dollar ` +
          `over moves the whole premium up a step, which is about ` +
          `${money((irmaaTierFor(tightest.magi, inputs.filingStatus) === 0 ? 95.7 : 144.7) * 12)} a ` +
          `year${inputs.filingStatus === 'married' ? ' each' : ''}. A large withdrawal, a Roth ` +
          `conversion or a realised gain in one of those years is what would tip it, so it is worth ` +
          `knowing which years are tight before deciding to take one.`,
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

  // 9. The match is the only guaranteed return on offer anywhere in a plan —
  // and now the only one this card can put a figure on, because the plan knows
  // the terms rather than describing them in the abstract.
  if (yearsWorking > 0 && inputs.monthlyContribution > 0) {
    const stated = inputs.annualSalary > 0 && inputs.employerMatchPercent > 0
    const missing = result.matchLeftBehind
    const matchable = (inputs.annualSalary * inputs.employerMatchLimitPercent) / 100
    const firstYearMatch = result.rows[0]?.employerMatch ?? 0

    if (stated && missing > 0) {
      out.push({
        key: 'match',
        priority: 5,
        title: `You are leaving ${money(missing)} a year of employer money behind`,
        body:
          `Your employer matches ${inputs.employerMatchPercent}% of what you put in, up to ` +
          `${inputs.employerMatchLimitPercent}% of your ${money(inputs.annualSalary)} salary — so ` +
          `${money(matchable)} a year of contributions earns a match. You are contributing ` +
          `${money(inputs.monthlyContribution * 12)}, which collects ${money(firstYearMatch)} and leaves ` +
          `${money(missing)} unclaimed. Raising the contribution to ${money(matchable / 12)} a month is the ` +
          `highest-return change available anywhere in this plan: an immediate ` +
          `${inputs.employerMatchPercent}% on the money that earns it, with no market having to cooperate. ` +
          `Across your ${yearsWorking} remaining working ${yearsWorking === 1 ? 'year' : 'years'} that is ` +
          `${money(missing * yearsWorking)} of somebody else's money, before any growth on it.`,
      })
    } else if (stated) {
      out.push({
        key: 'match',
        priority: 55,
        title: `You are collecting the whole ${money(firstYearMatch)} match`,
        body:
          `Your contribution reaches the ${inputs.employerMatchLimitPercent}% of salary your employer ` +
          `matches, so nothing is being left behind — ${money(result.totalEmployerMatch)} across your ` +
          `remaining working years, in today's money. Contributing more than that is still worth doing ` +
          `for the tax shelter, but it earns no further match: past this line every extra dollar is ` +
          `working on its own.`,
      })
    } else {
      out.push({
        key: 'match',
        priority: 15,
        title: 'Check you are getting the whole employer match first',
        body:
          `A match is an immediate return of 50% or 100% on the part of your contribution that earns ` +
          `it, which nothing else in a portfolio offers and no market has to cooperate with. This plan ` +
          `does not know yours: fill in your salary and your employer's match terms under Saving and ` +
          `it will work out whether ${money(inputs.monthlyContribution)} a month is collecting all of ` +
          `it, and what any shortfall is costing you.`,
      })
    }
  }

  // 10. The only account taxed nowhere at all, if it is spent on health.
  if (yearsWorking > 0 && inputs.currentAge < 65) {
    const catchUp = inputs.currentAge >= 55
    const hasHsa = inputs.hsaBalance > 0 || inputs.hsaMonthlyContribution > 0
    const atRetirement = result.rows.find((r) => r.phase === 'retirement')

    if (hasHsa && atRetirement) {
      out.push({
        key: 'hsa',
        priority: 25,
        title: `Your HSA reaches ${money(atRetirement.hsaBalance)} by ${atRetirement.age}, taxed at neither end`,
        body:
          `${money(inputs.hsaBalance)} today and ${money(inputs.hsaMonthlyContribution)} a month goes in ` +
          `untaxed, grows untaxed, and comes out untaxed for medical costs — which are the expense this ` +
          `plan is least able to predict. Nothing is ever forced out of it, unlike the 401(k), so the ` +
          `projection spends it before the Roth on the assumption that care is what it will pay for. ` +
          `After 65 anything else it is spent on is taxed like a 401(k) withdrawal but without a ` +
          `penalty, so the worst case is that it was an ordinary retirement account all along. ` +
          `Contributions stop when Medicare starts.`,
      })
    } else {
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
          `Medicare starts. Add yours under Saving and the projection will carry it.`,
      })
    }
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
