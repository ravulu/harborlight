// Premiums here and premiums there move for the same reason and are assumed
// to move the same way — see `acaTableFor`. Importing the curve rather than
// restating it means the two cannot drift apart, which they would, quietly,
// the first time one of them was tuned.
import { ASSUMED_INDEXATION, premiumMultiple } from '@/lib/irmaa'


/**
 * ACA marketplace cover, and the subsidy that pays for most of it.
 *
 * Between retiring and turning 65 there is no Medicare, and most people who
 * have stopped working buy cover on the marketplace. What they pay is not the
 * price of the plan: it is the price less a premium tax credit, and that credit
 * is worked out from their income for the year. Income they choose — a large
 * withdrawal, a realised gain, a Roth conversion — therefore sets the cost of
 * their health cover, which is the connection this module exists to price.
 *
 * The reason it matters more than an ordinary means test is the cliff. Up to
 * 400% of the federal poverty line the credit tapers; one dollar past it the
 * credit is nothing at all. A conversion sized to fill a tax bracket can cross
 * that line and cost more in lost subsidy than the whole bracket saved.
 *
 * The enhanced credits that removed the cliff between 2021 and 2025 expired on
 * 31 December 2025. It is back.
 */

/** The year these figures are law for. */
export const ACA_YEAR = 2026

/** Where the figures came from — see `lib/published.ts`. */
export const ACA_SOURCE = {
  title: 'IRS Rev. Proc. 2025-25 (applicable percentages), HHS poverty guidelines',
  url: 'https://www.irs.gov/pub/irs-drop/rp-25-25.pdf',
} as const

/**
 * Federal poverty guidelines, in the dollars of the year before the coverage
 * year — 2026 cover is tested against the 2025 guidelines, which is how the
 * credit has always worked.
 *
 * The 48 contiguous states and DC. Alaska and Hawaii have their own, higher,
 * guidelines that this does not carry; a plan in either is measured against a
 * line that is too low, which overstates its income as a share of poverty and
 * so understates its subsidy.
 */
export const FPL_BASE = 15_650
export const FPL_PER_EXTRA_PERSON = 5_500

/** Household income above this share of the poverty line gets no credit at all. */
export const CLIFF = 4.0

/**
 * Below this share of the poverty line the marketplace credit does not apply
 * at all — Medicaid does instead, at little or no cost to the household.
 */
export const MEDICAID_FLOOR = 1.0

export interface PercentageTier {
  /** Share of the poverty line at which this tier starts. */
  from: number
  /** Share of income expected at the bottom of the tier, and at the top. */
  initial: number
  final: number
}

/**
 * The applicable percentage table for 2026, from IRS Rev. Proc. 2025-25 §3.01.
 *
 * It says what share of their income a household is expected to put towards
 * the benchmark plan; the credit is whatever the benchmark costs above that.
 * Within a tier the share is interpolated, so the taper is a slope rather than
 * a set of steps — right up to 400%, where it stops being either.
 *
 * Source: https://www.irs.gov/pub/irs-drop/rp-25-25.pdf
 */
export const APPLICABLE_PERCENTAGE: PercentageTier[] = [
  { from: 0, initial: 2.1, final: 2.1 },
  { from: 1.33, initial: 3.14, final: 4.19 },
  { from: 1.5, initial: 4.19, final: 6.6 },
  { from: 2.0, initial: 6.6, final: 8.44 },
  { from: 2.5, initial: 8.44, final: 9.96 },
  { from: 3.0, initial: 9.96, final: 9.96 },
]

/**
 * The national average benchmark premium in 2026 — the second-lowest-cost
 * silver plan, which is the one the credit is calculated against — for a
 * 40-year-old, per month.
 *
 * A national average stands in for a figure that genuinely varies by rating
 * area, sometimes by a factor of two. It is the right order of magnitude
 * everywhere and the right number almost nowhere.
 *
 * This module was written for the *difference* between two choices, where that
 * hardly matters — both sides carry the same error and it cancels. Since the
 * projection began charging cover as a cost in its own right, the absolute
 * figure is on screen too, and there it does not cancel. So anywhere the level
 * is shown rather than a comparison, it has to be labelled as the national
 * average it is: see `NATIONAL_AVERAGE_NOTE`.
 */
export const BENCHMARK_40_MONTHLY = 497

/**
 * The caveat that has to travel with any premium shown as a level.
 *
 * Not a generic "estimated" tag. Everything in this app is an estimate, and
 * labelling one figure that way implies the others are exact — the house habit
 * is to name what is uncertain and in which direction, the way the projected
 * tax brackets and the unmodelled state credits already do. Here what is
 * uncertain is geography, and the direction is either.
 */
export const NATIONAL_AVERAGE_NOTE =
  'priced from the national average benchmark plan, which varies by where you ' +
  'live — sometimes by half either way'

/**
 * The CMS default age curve: what an insurer may charge at each age relative
 * to a 21-year-old. Three to one is the legal maximum and is reached at 64.
 *
 * Only the ages this projection needs are carried — someone retiring before 65
 * and buying their own cover — with the 40-year-old factor included because it
 * is what the benchmark above is quoted at.
 */
export const AGE_FACTOR: Record<number, number> = {
  // The federal default standard age curve, from the bottom. It used to start
  // at 40, with a note that nobody on this path was under 50 in practice —
  // true while a household could only ever be one or two adults, and wrong the
  // moment a child could be on the policy. A child rated at a sixty-year-old's
  // factor was charged three and a half times what they cost.
  0: 0.765,
  15: 0.833,
  16: 0.859,
  17: 0.885,
  18: 0.913,
  19: 0.941,
  20: 0.97,
  21: 1.0,
  25: 1.004,
  26: 1.024,
  27: 1.048,
  28: 1.087,
  29: 1.119,
  30: 1.135,
  31: 1.159,
  32: 1.183,
  33: 1.198,
  34: 1.214,
  35: 1.222,
  36: 1.23,
  37: 1.238,
  38: 1.246,
  39: 1.262,
  40: 1.278,
  41: 1.302,
  42: 1.325,
  43: 1.357,
  44: 1.397,
  45: 1.444,
  46: 1.5,
  47: 1.563,
  48: 1.635,
  49: 1.706,
  50: 1.786,
  51: 1.865,
  52: 1.952,
  53: 2.04,
  54: 2.135,
  55: 2.23,
  56: 2.333,
  57: 2.437,
  58: 2.548,
  59: 2.603,
  60: 2.714,
  61: 2.81,
  62: 2.873,
  63: 2.952,
  64: 3.0,
}

const FIRST_AGE = 0
const LAST_AGE = 64

/** The age factor, holding the ends of the curve beyond what it carries. */
export function ageFactor(age: number): number {
  const clamped = Math.min(Math.max(Math.floor(age), FIRST_AGE), LAST_AGE)
  // Sparse where the curve is flat — every age from 0 to 14 rates the same,
  // and 21 to 24 likewise — so the nearest entry at or below is the exact
  // figure rather than an approximation of one.
  let factor = AGE_FACTOR[FIRST_AGE]
  for (let a = FIRST_AGE; a <= clamped; a++) if (AGE_FACTOR[a]) factor = AGE_FACTOR[a]
  return factor
}

/** The poverty line for a household of this size, in the coverage year. */
/**
 * The figures for a year, rolled forward past the last published set.
 *
 * Decided 2026-08-28. Until then ACA alone among the annual tables refused to
 * project: it carried a year and a guard and then went on charging that year's
 * poverty line and benchmark premium for ever. The argument for refusing was
 * that a benchmark premium is a market price rather than an indexation, and
 * that is true — but the consequence was worse than the imprecision. A plan
 * retiring at 58 is priced across seven years before Medicare, and holding the
 * poverty line flat while every income in the projection inflates walks
 * households over the subsidy cliff for no reason but the calendar.
 *
 * So each part moves at the rate that suits it, and the whole is marked
 * `estimated`:
 *
 * - **The poverty guidelines** track inflation, and are indexed at the same
 *   assumed rate the Medicare thresholds use.
 * - **The benchmark premium** is a medical price and has outrun inflation, so
 *   it uses `premiumMultiple` — the same fading curve as the Part B premium,
 *   for the same reason: a rate that outruns prices for a decade is history,
 *   and one that does it for fifty years is a claim nobody makes.
 * - **The applicable percentages** are held. They are set by Revenue
 *   Procedure, not indexed, and inventing a schedule of them would be making
 *   up law rather than extrapolating a price.
 */
export interface AcaTable {
  year: number
  estimated?: boolean
  fplBase: number
  fplPerExtraPerson: number
  benchmark40Monthly: number
  percentages: PercentageTier[]
}

export function acaTableFor(year: number): AcaTable {
  const published: AcaTable = {
    year: ACA_YEAR,
    fplBase: FPL_BASE,
    fplPerExtraPerson: FPL_PER_EXTRA_PERSON,
    benchmark40Monthly: BENCHMARK_40_MONTHLY,
    percentages: APPLICABLE_PERCENTAGE,
  }
  const ahead = Math.floor(year) - ACA_YEAR
  if (ahead <= 0) return published

  /**
   * Stated in today's dollars, because that is what it is compared against.
   *
   * `acaCostFor` is handed a MAGI that `simulate` has already deflated to
   * today's money. Rolling the poverty line forward *nominally* and testing a
   * real income against it would make the cliff recede a little further every
   * year for no reason but the calendar — which is precisely the mistake
   * `lib/irmaa.ts` records making with its own thresholds, where it "made the
   * room look bigger every year" and came out 41% too big by 69.
   *
   * So the two move by what they do in *real* terms:
   *
   * - The poverty guidelines track inflation, so in today's money they are
   *   flat. Held, and that is a result rather than a refusal to model.
   * - The benchmark premium has outrun inflation, so in today's money it
   *   rises — by premium growth net of indexation, on the same fading curve
   *   the Part B premium uses, for the same reason.
   */
  const realPremiumGrowth =
    premiumMultiple(ahead) / Math.pow(1 + ASSUMED_INDEXATION, ahead)

  return {
    year: Math.floor(year),
    estimated: true,
    fplBase: FPL_BASE,
    fplPerExtraPerson: FPL_PER_EXTRA_PERSON,
    benchmark40Monthly: Math.round(BENCHMARK_40_MONTHLY * realPremiumGrowth),
    percentages: APPLICABLE_PERCENTAGE,
  }
}

export function povertyLine(
  householdSize: number,
  year: number = ACA_YEAR,
): number {
  const people = Math.max(1, Math.floor(householdSize))
  const table = acaTableFor(year)
  return table.fplBase + (people - 1) * table.fplPerExtraPerson
}

/**
 * The share of income the household is expected to contribute, at a given
 * income measured against the poverty line.
 *
 * Interpolated within the tier, which is what the regulation calls for, and
 * returns nothing above the cliff because above the cliff there is no credit
 * to reduce.
 */
export function applicablePercentage(fplRatio: number): number {
  if (fplRatio > CLIFF) return 0
  let tier = APPLICABLE_PERCENTAGE[0]
  let next: PercentageTier | undefined
  for (let i = 0; i < APPLICABLE_PERCENTAGE.length; i++) {
    if (fplRatio >= APPLICABLE_PERCENTAGE[i].from) {
      tier = APPLICABLE_PERCENTAGE[i]
      next = APPLICABLE_PERCENTAGE[i + 1]
    }
  }
  const top = next?.from ?? CLIFF
  const span = top - tier.from
  if (span <= 0) return tier.initial
  const along = Math.min(1, Math.max(0, (fplRatio - tier.from) / span))
  return tier.initial + (tier.final - tier.initial) * along
}

/**
 * What the benchmark plan costs this household for a year, before any credit.
 *
 * Priced per person and added up, because that is how a marketplace policy is
 * priced. A couple is taken to be the same age as each other: the projection
 * carries one age, and guessing a gap would be inventing a figure rather than
 * approximating one.
 */
/**
 * Children past the third are not charged for.
 *
 * A family rate is the sum of its members, except that only the three oldest
 * children under 21 are counted. It is a real rule rather than a rounding, and
 * without it a household of six would be quoted a premium no insurer would
 * send them.
 */
export const CHILDREN_CHARGED = 3
/** Under this age a person counts as a child for the cap above. */
export const CHILD_AGE = 21

/**
 * What the benchmark plan costs a household, summed member by member.
 *
 * Every member used to be rated at the subscriber's own age and multiplied up,
 * which is right for two adults of a similar age and wrong for anybody else. A
 * sixty-year-old with two children was quoted $50,661 against a properly rated
 * $32,471 — 56% too much — because each child was charged as a sixty-year-old.
 *
 * Nothing reached that path while a household could only be one or two adults.
 * Letting dependents in is what makes it reachable, so it is fixed first.
 */
export function benchmarkAnnualFor(ages: number[], year: number = ACA_YEAR): number {
  if (ages.length === 0) return 0
  const perUnit = (acaTableFor(year).benchmark40Monthly / AGE_FACTOR[40]) * 12

  const adults = ages.filter((a) => a >= CHILD_AGE)
  // Oldest first, so the cap drops the youngest — which is the way round the
  // rule is written and the more expensive three to charge for.
  const children = ages
    .filter((a) => a < CHILD_AGE)
    .sort((a, b) => b - a)
    .slice(0, CHILDREN_CHARGED)

  const units = [...adults, ...children].reduce((a, age) => a + ageFactor(age), 0)
  return perUnit * units
}

/**
 * The same figure for a household of people all the same age.
 *
 * Kept because that is exactly what one or two adults of similar age is, and
 * every caller that has no dependents to describe means precisely this.
 */
export function benchmarkAnnual(age: number, householdSize: number): number {
  const people = Math.max(1, Math.floor(householdSize))
  return benchmarkAnnualFor(Array.from({ length: people }, () => age))
}

export interface AcaCost {
  /** What the benchmark plan costs before any credit, for the year. */
  benchmark: number
  /** The premium tax credit at this income. */
  subsidy: number
  /** What the household actually pays: benchmark less credit. */
  net: number
  /** Household income as a share of the poverty line. */
  fplRatio: number
  /** Whether income has passed 400% and taken the whole credit with it. */
  overCliff: boolean
  /** Whether income is low enough that Medicaid covers it instead. */
  onMedicaid: boolean
  /** Income that could still be added before it does. Zero once it has. */
  roomBelowCliff: number
}

/**
 * What health cover costs a household at a given income, before Medicare.
 *
 * `magi` here is the ACA's own measure: adjusted gross income plus tax-exempt
 * interest plus the *untaxed* part of Social Security. That last piece is why
 * it is not the same figure the Medicare surcharge is tested against, and why
 * a household with a large benefit can be further up the scale than its tax
 * return suggests.
 */
/**
 * Everyone on the policy this year, by age.
 *
 * One list rather than an age and a count, because the two things it decides
 * need different parts of it: the poverty line counts heads, and the premium
 * rates each head separately. Passing a size and a single age let those two
 * agree about the household while disagreeing about who was in it.
 */
export function acaCostFor(
  magi: number,
  ages: number[],
  /**
   * The year being priced, so a plan reaching 2035 is not charged the 2026
   * poverty line against 2035 income.
   *
   * Defaults to the published year, which is what every caller did implicitly
   * before this existed. `simulate` passes the row's own year, exactly as it
   * already does for the IRMAA table beside it.
   */
  year: number = ACA_YEAR,
): AcaCost {
  const line = povertyLine(ages.length, year)
  const fplRatio = line > 0 ? magi / line : 0
  const benchmark = benchmarkAnnualFor(ages, year)
  const overCliff = fplRatio > CLIFF

  // Below the poverty line the marketplace credit does not apply: that is
  // Medicaid, which costs a household little or nothing. Treated as fully
  // covered rather than charged full price — in the forty states that expanded
  // it that is right, and in the ten that did not there is a coverage gap this
  // cannot represent either way.
  const onMedicaid = fplRatio < MEDICAID_FLOOR
  const expected = onMedicaid
    ? 0
    : overCliff
      ? benchmark
      : (magi * applicablePercentage(fplRatio)) / 100
  const subsidy = Math.max(0, benchmark - expected)

  return {
    benchmark,
    subsidy,
    net: Math.max(0, benchmark - subsidy),
    fplRatio,
    overCliff,
    onMedicaid,
    roomBelowCliff: Math.max(0, line * CLIFF - magi),
  }
}

/** A household of people all the same age, which is what no dependents means. */
export function acaCost(
  magi: number,
  age: number,
  householdSize: number,
): AcaCost {
  const people = Math.max(1, Math.floor(householdSize))
  return acaCostFor(magi, Array.from({ length: people }, () => age))
}

/**
 * The income the ACA measures, which is not the income Medicare measures.
 *
 * The whole Social Security benefit counts here, not merely the part that is
 * taxable — so a household can be comfortably inside a tax bracket and still
 * be over the cliff.
 */
export function acaMagiOf(row: {
  fromDeferred: number
  conversion: number
  otherIncome: number
  socialSecurity: number
  capitalGains: number
}): number {
  return (
    row.fromDeferred +
    row.conversion +
    row.otherIncome +
    row.socialSecurity +
    row.capitalGains
  )
}

/** The age marketplace cover stops mattering, because Medicare begins. */
export const MEDICARE_AGE = 65

/**
 * The age a dependent comes off the policy.
 *
 * A child can stay on a parent's marketplace plan until they turn 26. Taken
 * here as off in the year they turn 26 rather than part way through it, which
 * is a year's simplification on a rule that varies by plan anyway — some run
 * cover to the end of that month, some to the end of that year.
 */
export const DEPENDENT_COVER_TO = 26

/**
 * Everyone on the policy in a given year, by age.
 *
 * The spouse is taken to be the same age as the subscriber, which is the
 * assumption the rest of the projection already makes — there is nowhere to
 * enter a different one.
 *
 * Dependents are held as birth years rather than ages so that a plan reopened
 * in three years still describes the same children. An age typed today is a
 * fact with a shelf life; a birth year is not. Two children born in different
 * years come off in different years without anybody having to say so.
 */
export function policyAges(
  subscriberAge: number,
  married: boolean,
  dependentBirthYears: number[],
  year: number,
): number[] {
  const ages = married ? [subscriberAge, subscriberAge] : [subscriberAge]
  for (const born of dependentBirthYears) {
    const age = year - born
    if (age >= 0 && age < DEPENDENT_COVER_TO) ages.push(age)
  }
  return ages
}
