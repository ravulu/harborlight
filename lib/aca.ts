
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
  40: 1.278,
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

const FIRST_AGE = 40
const LAST_AGE = 64

/** The age factor, holding the ends of the curve beyond what it carries. */
export function ageFactor(age: number): number {
  const clamped = Math.min(Math.max(Math.floor(age), FIRST_AGE), LAST_AGE)
  // The curve is sparse below 50; the nearest lower entry is close enough for
  // a projection, and nobody on this path is under 50 in practice.
  let factor = AGE_FACTOR[FIRST_AGE]
  for (let a = FIRST_AGE; a <= clamped; a++) if (AGE_FACTOR[a]) factor = AGE_FACTOR[a]
  return factor
}

/** The poverty line for a household of this size, in the coverage year. */
export function povertyLine(householdSize: number): number {
  const people = Math.max(1, Math.floor(householdSize))
  return FPL_BASE + (people - 1) * FPL_PER_EXTRA_PERSON
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
export function benchmarkAnnual(age: number, householdSize: number): number {
  const people = Math.max(1, Math.floor(householdSize))
  return BENCHMARK_40_MONTHLY * (ageFactor(age) / AGE_FACTOR[40]) * 12 * people
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
export function acaCost(
  magi: number,
  age: number,
  householdSize: number,
): AcaCost {
  const line = povertyLine(householdSize)
  const fplRatio = line > 0 ? magi / line : 0
  const benchmark = benchmarkAnnual(age, householdSize)
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
