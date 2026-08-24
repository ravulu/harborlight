import type { FilingStatus } from '@/lib/state-tax'

/**
 * IRMAA — the income-related monthly adjustment amount.
 *
 * A surcharge on Medicare Part B and Part D for households whose income was
 * above a threshold, and the reason a Roth conversion can cost more than its
 * income tax. Three things make it worth modelling rather than mentioning:
 *
 * It is a cliff, not a taper. A dollar over a threshold moves the whole
 * premium into the next tier, so the marginal cost of that dollar can be over
 * a thousand times its own value.
 *
 * It arrives two years late. The 2026 premium is set by the 2024 tax return,
 * so the bill for a conversion turns up long after the decision, when nothing
 * can be done about it.
 *
 * It is charged per person. A married couple both on Medicare pay it twice.
 *
 * Only the surcharge is modelled here, never the standard premium. The
 * standard premium is an ordinary cost of being 65 and is already available to
 * enter as spending — Medicare Part B is a line in the expense estimator — so
 * charging it here would bill it twice for anyone who did. The surcharge is
 * the part that is nobody's baseline and that a conversion actually triggers.
 */

/**
 * The most recent year real, published figures have been entered for.
 *
 * Not the year the app prices against — that is `currentIrmaaYear()`. Once the
 * calendar passes this, the table is rolled forward and marked `estimated`.
 * The guard in `lib/irmaa.test.ts` is what asks for real figures to replace
 * the estimate, exactly as `BRACKET_YEAR` does for the income tax tables.
 */
export const IRMAA_YEAR = 2026

/**
 * How far back the income test looks.
 *
 * A 2026 premium is set by the modified adjusted gross income on the 2024
 * return. Two years, always — there is no version of this that reads the
 * current year.
 */
export const LOOKBACK_YEARS = 2

/**
 * The standard Part B premium for `IRMAA_YEAR`, which the surcharges sit above.
 * Kept as a named export because it is the single figure the whole Part B
 * column is derived from — see the statutory multiples in the tests.
 */
export const STANDARD_PART_B_MONTHLY = 202.9

export interface IrmaaTier {
  /** MAGI at or above which this tier applies, in the dollars of IRMAA_YEAR. */
  from: number
  /** Monthly Part B surcharge, above the standard premium, per person. */
  partB: number
  /** Monthly Part D surcharge, per person. */
  partD: number
}

/**
 * How fast the income thresholds are assumed to move when no real table exists.
 *
 * They are indexed to CPI each year, so a long-run inflation rate rolls them
 * forward reasonably.
 */
export const ASSUMED_INDEXATION = 0.025

/**
 * How fast the surcharges themselves are assumed to move — separately, and
 * faster.
 *
 * The Part B tiers are statutory multiples of the standard premium, and that
 * premium tracks what Medicare costs to run rather than what things cost in
 * shops. It has risen well ahead of CPI for most of the past decade. Indexing
 * the surcharges at the same rate as the thresholds would understate them
 * every year, and understating a cost is the wrong way to be wrong.
 */
export const ASSUMED_PREMIUM_GROWTH = 0.06

/** Published thresholds land on round numbers; projected ones should too. */
const THRESHOLD_STEP = 1_000

export interface IrmaaTable {
  /** The year these figures are law for, and the dollars they are stated in. */
  year: number
  /**
   * True when this table was projected forward from an earlier one rather than
   * entered from published figures. Anything shown to a reader has to say so.
   */
  estimated?: boolean
  /** The standard Part B premium that year. */
  standardPartB: number
  tiers: Record<FilingStatus, IrmaaTier[]>
}

/**
 * Every year's table, keyed by the year it applies to.
 *
 * Additive rather than replaced: adding 2027 next November leaves 2026 exactly
 * where it is, so a plan run today and the same plan reopened in five years
 * still agree about what 2026 charged. The alternative — one table, overwritten
 * each year — quietly rewrites history every time it is updated.
 *
 * Each table's thresholds are in the dollars of its own year. A caller
 * comparing an income against them has to state that income in the same
 * dollars, which is what `simulate` does before asking.
 *
 * The annual job is small, because the shape of the table never moves: the
 * Part B tiers are fixed statutory multiples of the standard premium (1.4x,
 * 2.0x, 2.6x, 3.2x, 3.4x — the 35/50/65/80/85% shares of programme cost against
 * the 25% the standard premium covers), so it is really the standard premium,
 * the thresholds, and the Part D surcharges that change.
 */
export const IRMAA_TABLES: Record<number, IrmaaTable> = {}

/**
 * The 2026 tiers, tested against modified adjusted gross income from 2024.
 *
 * Part B figures are the published total premium less the $202.90 standard, so
 * they are the surcharge alone: $284.10 − $202.90 = $81.20, and so on up.
 *
 * Married-filing-separately has its own far lower thresholds — a single step
 * at $109,000 and a second near $137,000 — which the projection cannot
 * represent, since it models only single and joint. A separate filer is
 * treated here as single, which understates what they would owe.
 *
 * Sources, cross-checked and in agreement on every threshold and amount:
 *   https://www.medicareadvocates.com/blog/irmaa-brackets-2026
 *   https://thefinancebuff.com/medicare-irmaa-income-brackets.html
 */
export const IRMAA_TIERS_2026: Record<FilingStatus, IrmaaTier[]> = {
  single: [
    { from: 0, partB: 0, partD: 0 },
    { from: 109_001, partB: 81.2, partD: 14.5 },
    { from: 137_001, partB: 202.9, partD: 37.5 },
    { from: 171_001, partB: 324.6, partD: 60.4 },
    { from: 205_001, partB: 446.3, partD: 83.3 },
    { from: 500_000, partB: 487.0, partD: 91.0 },
  ],
  married: [
    { from: 0, partB: 0, partD: 0 },
    { from: 218_001, partB: 81.2, partD: 14.5 },
    { from: 274_001, partB: 202.9, partD: 37.5 },
    { from: 342_001, partB: 324.6, partD: 60.4 },
    { from: 410_001, partB: 446.3, partD: 83.3 },
    { from: 750_000, partB: 487.0, partD: 91.0 },
  ],
}

IRMAA_TABLES[2026] = {
  year: 2026,
  standardPartB: STANDARD_PART_B_MONTHLY,
  tiers: IRMAA_TIERS_2026,
}

/**
 * The tiers for the year the app is running in, estimated once the calendar
 * passes the last table entered. Kept as a named export because most callers
 * want the current year and should not have to say so.
 *
 * Bound at import: a process running across New Year keeps the old year until
 * it restarts, which deployments do.
 */
export const IRMAA_TIERS = IRMAA_TIERS_2026

/** Every year a table exists for, oldest first. */
export const IRMAA_YEARS = Object.keys(IRMAA_TABLES)
  .map(Number)
  .sort((a, b) => a - b)

/**
 * The table that governs a given year.
 *
 * Before the first year entered, the first is used; after the last, the last.
 * Clamping rather than failing is deliberate: a projection runs thirty years
 * past any table anyone could have written, and refusing to price those years
 * would be worse than pricing them on the newest figures available. The
 * returned table names its own year so the caller can see which it got and
 * state the income in matching dollars.
 */
/**
 * A table rolled forward to a later year.
 *
 * Thresholds and surcharges move at different rates and are indexed
 * separately — see `ASSUMED_PREMIUM_GROWTH`. The shape is untouched: the same
 * six tiers, in the same statutory proportions.
 */
function projectTable(base: IrmaaTable, toYear: number): IrmaaTable {
  const years = toYear - base.year
  const income = Math.pow(1 + ASSUMED_INDEXATION, years)
  const premium = Math.pow(1 + ASSUMED_PREMIUM_GROWTH, years)
  const roll = (tiers: IrmaaTier[]) =>
    tiers.map((t) => ({
      from: t.from === 0 ? 0 : Math.round((t.from * income) / THRESHOLD_STEP) * THRESHOLD_STEP,
      partB: Math.round(t.partB * premium * 10) / 10,
      partD: Math.round(t.partD * premium * 10) / 10,
    }))

  return {
    year: toYear,
    estimated: true,
    standardPartB: Math.round(base.standardPartB * premium * 10) / 10,
    tiers: { single: roll(base.tiers.single), married: roll(base.tiers.married) },
  }
}

/**
 * The table that governs a given year.
 *
 * Before the first year entered, the first is used. Within the range, the most
 * recent table at or before the year asked for. Past the last, the last one
 * rolled forward — because waiting for somebody to type in the new figures
 * means charging this year's income against an older year's thresholds until
 * they do, and every year of delay makes that quietly worse.
 */
export function irmaaTableFor(year: number): IrmaaTable {
  const first = IRMAA_YEARS[0]
  const last = IRMAA_YEARS[IRMAA_YEARS.length - 1]
  if (year <= first) return IRMAA_TABLES[first]
  if (year > last) return projectTable(IRMAA_TABLES[last], Math.floor(year))
  // The most recent table at or before the year asked for.
  let chosen = first
  for (const y of IRMAA_YEARS) if (y <= year) chosen = y
  return IRMAA_TABLES[chosen]
}

/** The calendar year the app is running in, which is what it prices against. */
export const currentIrmaaYear = () => new Date().getFullYear()

/** The age Medicare starts, and so the first age a surcharge can be charged. */
export const MEDICARE_AGE = 65

/**
 * The tier a given MAGI falls in: 0 for the standard premium, up to 5.
 *
 * `magi` must be stated in the dollars of `year`, since that is the year whose
 * thresholds it is tested against.
 */
export function irmaaTierFor(
  magi: number,
  status: FilingStatus,
  year: number = currentIrmaaYear(),
): number {
  const tiers = irmaaTableFor(year).tiers[status]
  let tier = 0
  for (let i = 1; i < tiers.length; i++) {
    if (magi >= tiers[i].from) tier = i
  }
  return tier
}

/**
 * The monthly surcharge one person owes at this income, above the standard
 * premium. Zero below the first threshold, which is where most plans sit.
 */
export function monthlySurcharge(
  magi: number,
  status: FilingStatus,
  year: number = currentIrmaaYear(),
): number {
  const table = irmaaTableFor(year)
  const tier = table.tiers[status][irmaaTierFor(magi, status, year)]
  return tier.partB + tier.partD
}

/**
 * What a household pays in surcharges across a year.
 *
 * Charged per person, so a couple both on Medicare pay it twice. The
 * projection does not track the ages of two spouses separately, so a joint
 * filer is taken to be a couple who are both on Medicare — which is the common
 * case, and the conservative one where it is wrong.
 */
export function annualSurcharge(
  magi: number,
  status: FilingStatus,
  year: number = currentIrmaaYear(),
): number {
  const people = status === 'married' ? 2 : 1
  return monthlySurcharge(magi, status, year) * 12 * people
}

/**
 * Modified adjusted gross income, as Medicare measures it.
 *
 * Adjusted gross income plus tax-exempt interest. In this projection that is
 * every dollar the year counted as income: what came out of the 401(k), what
 * was converted, the pension and anything alongside it, the taxable part of
 * Social Security, and the realised capital gain. A Roth withdrawal is not in
 * it — which is the second reason a conversion pays off later, after the
 * first, which is that it is not taxed.
 */
export function magiOf(row: {
  fromDeferred: number
  conversion: number
  otherIncome: number
  taxableSocialSecurity: number
  capitalGains: number
}): number {
  return (
    row.fromDeferred +
    row.conversion +
    row.otherIncome +
    row.taxableSocialSecurity +
    row.capitalGains
  )
}

/**
 * How far this income is below the next threshold — the headroom before the
 * surcharge steps up. Infinity at the top tier, where there is no next step.
 */
export function roomBelowNextTier(
  magi: number,
  status: FilingStatus,
  year: number = currentIrmaaYear(),
): number {
  const tiers = irmaaTableFor(year).tiers[status]
  const next = tiers[irmaaTierFor(magi, status, year) + 1]
  return next ? next.from - magi : Infinity
}
