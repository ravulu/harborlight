import type { PlanInputs } from '@/lib/retirement'
import { simulate } from '@/lib/retirement'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { rmdAge } from '@/lib/rmd'
import { PENALTY_FREE_AGE } from '@/lib/tax'
import { CLIFF, MEDICARE_AGE, acaCost, policyAges, povertyLine } from '@/lib/aca'

/** Enough runs to rank options; the headline figure is still the full run. */
const PROBE_RUNS = 800
/** Every candidate is drawn against this same sequence, so only the change moves the result. */
const PROBE_SEED = 0x5eed

/** Below this there is not enough in the deferred pot for the question to matter. */
const MIN_DEFERRED = 100_000
/** A window shorter than this cannot move much, whatever is converted. */
const MIN_WINDOW_YEARS = 2
/** Amounts are shown rounded to this, so they read as decisions rather than solutions. */
const STEP = 5_000
/** How many amounts to try between nothing and converting the lot. */
const SWEEP = 16

export interface ConversionOption {
  /** converted each year of the window, today's dollars */
  annual: number
  /**
   * True when the amount is large enough to empty the 401(k) and IRA outright.
   * Shown as "the whole account" rather than as a figure, because the figure
   * is not the decision — the decision is "all of it, as fast as the rules
   * allow", and a yearly number dressed that up as something more measured.
   */
  drainsPot: boolean
  /** total moved across the whole window */
  totalConverted: number
  /** tax paid across the whole plan, today's dollars */
  lifetimeTax: number
  /**
   * Medicare surcharges across the whole plan, today's dollars.
   *
   * The cost a conversion buys two years after it is made, and the reason the
   * tax figure beside it is not the whole answer. A modest conversion usually
   * lowers this — it shrinks the distributions that would otherwise have
   * pushed income over a threshold later — while a large one raises it, twice
   * over, by crossing thresholds in the conversion years themselves.
   */
  lifetimeIrmaa: number
  /**
   * The same surcharge as a yearly figure, averaged across the years it is
   * actually charged in — not across the whole plan, which would divide a real
   * cost by a lot of years that never see it.
   *
   * Carried because a lifetime total is the wrong unit for a premium. Twenty
   * years of surcharge and three years of it read as very different numbers
   * when added up, and as directly comparable ones when they are not.
   */
  irmaaPerYear: number
  /** How many years of the plan are charged a surcharge at all. */
  irmaaYears: number
  /**
   * What marketplace health cover costs across the years before Medicare,
   * today's dollars.
   *
   * Zero for anyone who retires at 65 or later, and the reason a conversion
   * before then can be a false economy: the credit that pays most of the
   * premium is means-tested on income, and a conversion is income. Past 400% of
   * the poverty line the credit stops altogether rather than tapering, so this
   * figure can jump by the whole cost of a policy between one row and the next.
   */
  lifetimeAca: number
  /**
   * The credit that paid for the rest of it, across the same years. The
   * counterpart to `lifetimeAca`: together they come to the full price of the
   * benchmark plan, and which way the split falls is what income decides.
   */
  lifetimeAcaSubsidy: number
  /** The premium and the subsidy as yearly figures, across the years to 65. */
  acaPerYear: number
  acaSubsidyPerYear: number
  /** How many years of marketplace cover the plan has to buy. */
  acaYears: number
  /**
   * How many of those years lose the subsidy outright.
   *
   * Not the same as `crossesCliff`, which is true if any single year does. A
   * conversion big enough to empty the account in two years crosses in those
   * two and is subsidised in the rest, so saying flatly that it has no subsidy
   * would be describing a different plan.
   */
  acaCliffYears: number
  /** the three added together, which is what the choice actually costs */
  lifetimeCost: number
  /** whether any year of this option loses the credit outright */
  crossesCliff: boolean
  /** the first required distribution, which converting is meant to shrink */
  firstRmd: number
  /** what is left at the end, today's dollars */
  endingBalance: number
  /** share of that left in the Roth, where nothing more is owed on it */
  endingRothShare: number
  confidence: number
}

export interface ConversionComparison {
  fromAge: number
  toAge: number
  /**
   * The ladder to show, lowest first: doing nothing, a few amounts in between,
   * the one that pays least, and converting the lot. All of them, because
   * these are suggestions rather than settings — someone weighing a conversion
   * against a health-cover consequence the projection cannot price needs to
   * see the shape of the trade, not be handed the answer.
   */
  options: ConversionOption[]
  /** the amount that pays least tax across the plan */
  best: ConversionOption
  /** the do-nothing baseline, which is what the plan currently does */
  none: ConversionOption
  /** an amount past the best, to show that more is not better */
  excessive: ConversionOption | null
  /** converting the entire 401(k) and IRA as fast as the rules allow */
  everything: ConversionOption
  /** tax saved by the best amount against doing nothing, today's dollars */
  taxSaving: number
  /**
   * Health-cover cost the best amount avoids, today's dollars. Negative when
   * the amount chosen costs more in premiums than it saves elsewhere — which
   * it can, if the tax and surcharge savings are larger.
   */
  acaSaving: number
  /**
   * Medicare surcharge saved by the best amount, today's dollars. Negative
   * when the best amount costs more in surcharge than it saves — which it can,
   * if the tax saving is larger.
   */
  irmaaSaving: number
  /** how much smaller the first required distribution becomes */
  rmdReduction: number
  /** whether the saving is large enough to be worth acting on */
  worthwhile: boolean
  /**
   * Whether the health-cover figures above mean anything at all.
   *
   * Two conditions, not one. The window has to open before Medicare does — a
   * window opening at 65 costs nothing in premiums because Medicare has
   * started — and the household has to be buying cover on the marketplace.
   *
   * It was the age alone, which was right while these premiums were priced
   * from the ages regardless of the setting. Now that they are read off the
   * projection, a household covered by an employer plan has no premiums to
   * report, and the age alone would gate four columns of zeroes into view.
   */
  beforeMedicare: boolean
  /** One or two, which is what the poverty line is measured against. */
  householdSize: number
  /**
   * What crossing the cliff costs for a single year: the whole benchmark
   * premium, since that is exactly what the credit was paying towards.
   */
  cliffCost: number
  /** The amounts on the ladder that cross it. */
  cliffRows: ConversionOption[]
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step

/**
 * What converting into a Roth during the pre-RMD window does to the plan.
 *
 * There is a real trade here, which is why it is worth simulating rather than
 * asserting. Converting fills the low brackets deliberately while they are
 * empty, and shrinks the distributions that would otherwise be forced out and
 * taxed later. Converting too much fills them past the point of being cheap,
 * and pays 22% now to avoid 12% later.
 *
 * So lifetime tax falls and then rises as the amount grows, and the useful
 * answer is where it turns rather than "convert as much as you can". Nothing
 * here changes the plan: candidates are built and discarded, exactly as
 * `compareClaimAges` does with the claim age.
 */
export function compareConversions(inputs: PlanInputs): ConversionComparison | null {
  const deferredNow = inputs.balance401k + inputs.traditionalIraBalance
  if (deferredNow < MIN_DEFERRED) return null

  const retireAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const thisYear = new Date().getFullYear()
  const startRmd = rmdAge(inputs.currentAge, thisYear)

  // The window opens when work stops — before that a conversion stacks on a
  // salary and is taxed at the top rate rather than the bottom — and closes
  // when distributions begin, since from then on the low brackets are being
  // filled anyway.
  const fromAge = retireAge
  const toAge = Math.min(startRmd - 1, inputs.endAge)
  const years = toAge - fromAge + 1
  if (years < MIN_WINDOW_YEARS) return null

  const candidate = (annual: number): PlanInputs => ({
    ...inputs,
    conversionAnnual: annual,
    conversionFromAge: fromAge,
    conversionToAge: toAge,
  })

  /**
   * How many are on the policy when the window opens.
   *
   * One figure for a comparison that spans twenty years, and it is the right
   * one to quote: it is the earliest years that buy marketplace cover, and any
   * children are still on the policy then. As they reach 26 the line drops
   * back towards the couple's own — the year-by-year table shows that; this
   * card quotes where it starts.
   */
  const householdSize = policyAges(
    fromAge,
    inputs.filingStatus === 'married',
    inputs.dependentBirthYears,
    thisYear + (fromAge - inputs.currentAge),
  ).length

  /**
   * What marketplace cover costs across the pre-Medicare years of a plan.
   *
   * Read off the projection's own rows rather than priced again here.
   *
   * It used to be priced again here, on the reasoning that the premium was
   * ordinary spending the reader had probably budgeted for, so charging it
   * inside the projection too would bill it twice. The health-cover work then
   * made the projection charge it, and this was left recomputing the same
   * figure from the same inputs — agreeing to a fraction of a percent, held
   * together by nothing, and free to drift apart on the next change to either.
   *
   * Worse, it read the ages and not the setting. A household that had told us
   * they were covered by an employer plan was still shown tens of thousands of
   * marketplace premiums in this comparison, while the projection beside it
   * charged nothing. Reading the rows fixes that by construction: the
   * projection only fills them in for a household actually buying cover.
   */
  const acaAcross = (rows: ReturnType<typeof simulate>['rows']) => {
    let total = 0
    let subsidy = 0
    let years = 0
    let cliffYears = 0
    let crossesCliff = false
    for (const row of rows) {
      if (row.phase !== 'retirement' || row.age >= MEDICARE_AGE) continue
      if (inputs.healthCoverBefore65 !== 'marketplace') continue
      total += row.healthPremium
      subsidy += row.healthSubsidy
      years += 1
      if (row.healthOverCliff) {
        crossesCliff = true
        cliffYears += 1
      }
    }
    return {
      total,
      subsidy,
      years,
      cliffYears,
      perYear: years > 0 ? total / years : 0,
      subsidyPerYear: years > 0 ? subsidy / years : 0,
      crossesCliff,
    }
  }

  /** Tax comes from the deterministic run: it is a rule, not a market outcome. */
  const priceOf = (annual: number) => {
    const plan = simulate(candidate(annual))
    const aca = acaAcross(plan.rows)
    const irmaaYears = plan.rows.filter((r) => r.irmaaSurcharge > 0).length
    const last = plan.rows.at(-1)
    const firstRmdRow = plan.rows.find((r) => r.requiredDistribution > 0)
    const windowEnd = plan.rows.find((r) => r.age === toAge)
    return {
      annual,
      // Emptied by the close of the window, rather than merely reduced.
      drainsPot: (windowEnd?.deferredBalance ?? 0) < 1_000,
      totalConverted: plan.rows.reduce((a, r) => a + r.conversion, 0),
      lifetimeTax: plan.totalTaxes,
      lifetimeIrmaa: plan.totalIrmaa,
      irmaaPerYear: irmaaYears > 0 ? plan.totalIrmaa / irmaaYears : 0,
      irmaaYears,
      lifetimeAca: aca.total,
      lifetimeAcaSubsidy: aca.subsidy,
      acaPerYear: aca.perYear,
      acaSubsidyPerYear: aca.subsidyPerYear,
      acaYears: aca.years,
      acaCliffYears: aca.cliffYears,
      crossesCliff: aca.crossesCliff,
      lifetimeCost: plan.totalTaxes + plan.totalIrmaa + aca.total,
      firstRmd: firstRmdRow?.requiredDistribution ?? 0,
      endingBalance: last?.endBalance ?? 0,
      endingRothShare:
        last && last.endBalance > 0 ? last.rothBalance / last.endBalance : 0,
      // Filled in only for the options actually shown: a simulation is cheap,
      // ten thousand market paths are not.
      confidence: 0,
    }
  }

  // Converting the whole balance evenly across the window is the most anyone
  // could do, so it bounds the search.
  const max = roundTo(deferredNow / years, STEP)
  if (max < STEP) return null

  const swept = [0]
  for (let i = 1; i <= SWEEP; i++) swept.push(roundTo((max * i) / SWEEP, STEP))
  const priced = [...new Set(swept)].map(priceOf)

  const none = priced[0]
  // Chosen on tax and surcharge together. Ranking on tax alone would pick an
  // amount that quietly bought a Medicare bill two years later, which is the
  // exact mistake this whole comparison exists to stop anyone making.
  const best = priced.reduce((a, b) => (b.lifetimeCost < a.lifetimeCost ? b : a))

  // Converting the lot: an amount no year can exceed, so each one moves as
  // much as the rules allow and the account is emptied as fast as it can be.
  // Worth showing precisely because it is the choice people assume is optimal.
  const everything = priceOf(deferredNow)

  // The first amount past the best that has given back everything it gained,
  // which is what makes the point that more is not better. Where converting
  // never turns bad — a plan whose brackets stay low throughout — there is
  // nothing to show and the row is dropped rather than invented.
  const excessive =
    priced.find((o) => o.annual > best.annual && o.lifetimeCost > none.lifetimeCost) ??
    null

  const withConfidence = (o: ConversionOption): ConversionOption => ({
    ...o,
    confidence: runMonteCarlo(candidate(o.annual), PROBE_RUNS, PROBE_SEED).successRate,
  })

  // Two amounts between nothing and the best, so the curve is visible rather
  // than asserted — someone should be able to see the tax falling before they
  // are told where it stops.
  const rungs = [best.annual / 3, (best.annual * 2) / 3]
    .map((v) => roundTo(v, STEP))
    .filter((v) => v > 0 && v < best.annual)
    .map(priceOf)

  const shown = [none, ...rungs, best, excessive, everything]
    .filter((o): o is ConversionOption => o !== null)
    // A best of nothing is the same row as the baseline; so is an excessive
    // amount that happens to be the drain-it-all one.
    .filter((o, i, all) => all.findIndex((x) => x.annual === o.annual) === i)
    .sort((a, b) => a.annual - b.annual)
    .map(withConfidence)

  const resolved = (o: ConversionOption) =>
    shown.find((s) => s.annual === o.annual) ?? withConfidence(o)

  const taxSaving = none.lifetimeTax - best.lifetimeTax
  const irmaaSaving = none.lifetimeIrmaa - best.lifetimeIrmaa
  const acaSaving = none.lifetimeAca - best.lifetimeAca

  return {
    fromAge,
    toAge,
    options: shown,
    best: resolved(best),
    none: resolved(none),
    excessive: excessive ? resolved(excessive) : null,
    everything: resolved(everything),
    taxSaving,
    irmaaSaving,
    acaSaving,
    rmdReduction: Math.max(0, none.firstRmd - best.firstRmd),
    worthwhile: best.annual > 0 && taxSaving + irmaaSaving + acaSaving > 5_000,
    beforeMedicare:
      fromAge < MEDICARE_AGE && inputs.healthCoverBefore65 === 'marketplace',
    householdSize,
    // The whole benchmark premium, which is exactly what is lost by crossing.
    cliffCost: acaCost(
      povertyLine(householdSize) * CLIFF + 1,
      Math.min(fromAge, MEDICARE_AGE - 1),
      householdSize,
    ).net,
    cliffRows: shown.filter((o) => o.crossesCliff),
  }
}

/** Whether a conversion window opens before the 401(k) is reachable without a penalty. */
export const opensBeforePenaltyFree = (fromAge: number) => fromAge < PENALTY_FREE_AGE
