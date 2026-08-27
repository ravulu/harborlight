import { CLIFF, acaMagiOf, policyAges, povertyLine } from '@/lib/aca'
import {
  LOOKBACK_YEARS,
  MEDICARE_AGE,
  annualSurcharge,
  irmaaTableFor,
  irmaaTierFor,
} from '@/lib/irmaa'
import { rmdAge } from '@/lib/rmd'
import { type PlanInputs, type YearRow, simulate } from '@/lib/retirement'
import { CAPITAL_GAINS, FEDERAL } from '@/lib/tax'
import type { Bracket } from '@/lib/state-tax'

/**
 * How much room a year has before it crosses something, and what crosses first.
 *
 * The low-income years between stopping work and the first required
 * distribution are a finite resource. Several things want them — moving money
 * into a Roth, realising a gain at the nil rate, keeping a health subsidy,
 * staying under a Medicare tier — and a dollar of income spent on one is not
 * available to another. Nothing in the app said so; the conversion ladder
 * priced one claimant against a fixed background, as though the background
 * were not itself a choice.
 *
 * This says nothing about what the room should be spent on. It reports what
 * there is, what is already claiming it, and which limit is nearest.
 */

/**
 * The four things a year of income can run into.
 *
 * Kept as one list because the reader meets them as one question — "how much
 * more can I take this year" — even though they are measured differently and
 * live in different parts of the law.
 */
export type CeilingKind = 'bracket' | 'gains' | 'aca' | 'irmaa'

/**
 * Whether crossing costs a little or a lot.
 *
 * The single most useful thing to know about a limit, and the app has never
 * put the two kinds side by side. A bracket is a **slope**: go over and only
 * the excess pays the higher rate, so crossing by a hundred dollars costs a
 * few tens. The health subsidy and the Medicare tiers are **cliffs**: a dollar
 * over gives up the whole credit or steps the whole premium, so crossing by a
 * hundred dollars can cost thousands.
 *
 * A reader who does not know which one they are near cannot judge how much
 * care the last few thousand dollars deserve.
 */
export type Edge = 'slope' | 'cliff'

interface CeilingBase {
  kind: CeilingKind
  /**
   * The income this limit sits at, in **its own measure**.
   *
   * They genuinely differ, and flattening them into one number would be the
   * kind of tidiness that produces wrong answers: brackets are read against
   * taxable income, the subsidy against household income for the credit, the
   * Medicare tiers against a modified gross income of their own. Each ceiling
   * therefore carries the floor it is measured against rather than sharing one.
   */
  at: number
  /** What the year already has, in that same measure, before any choice. */
  floor: number
  /** `at` less `floor`, never below zero. */
  room: number
}

/** A rate change. Only the amount above the line pays the higher rate. */
export interface Slope extends CeilingBase {
  edge: 'slope'
  /** The rate on the last dollar below the line, and on the first above it. */
  from: number
  to: number
}

/** An all-or-nothing threshold. One dollar over forfeits the lot. */
export interface Cliff extends CeilingBase {
  edge: 'cliff'
  /**
   * What crossing costs, in a year's money and in today's dollars.
   *
   * The figure that makes a cliff mean anything. "Four thousand dollars before
   * the subsidy stops" says nothing about whether to care; "and it would cost
   * you $12,400 of help with premiums" says everything.
   */
  cost: number
}

/**
 * Split rather than one shape with optional fields, so that the two kinds
 * cannot be confused for each other by anything reading them. A cliff has no
 * rate above it and a slope forfeits nothing — expressing that in the type
 * means the component cannot render one as the other.
 */
export type Ceiling = Slope | Cliff

/**
 * The things that can take a year's room.
 *
 * One today. A property sale and a harvested gain are the two that follow,
 * and they arrive once the projection can see the register — which is why
 * this is a list from the start rather than the single number it could be.
 * A view built around one claimant has to be rebuilt to show two competing,
 * and competing is the entire point.
 */
export type ClaimKind = 'conversion'

export interface Claim {
  kind: ClaimKind
  /** Income it adds to the year. */
  amount: number
  /**
   * What to call it, in the reader's words rather than the model's.
   *
   * A noun phrase, so that it reads whether it is a heading of its own or
   * dropped into a sentence. "Moving to a Roth" fitted neither: lower-cased
   * into "uses $700,000 of it moving to a roth" it took a proper noun down
   * with it.
   */
  label: string
}

export interface WindowYear {
  age: number
  year: number
  /** Every limit that applies this year, nearest first. */
  ceilings: Ceiling[]
  /** The nearest one — the limit that actually binds. Null if none applies. */
  binding: Ceiling | null
  /** Room before the binding limit. Zero once the year is already over it. */
  room: number
  /** What this plan's own choices already take out of the year. */
  claims: Claim[]
  /** Those claims added up, which is what the room is measured against. */
  claimed: number
}

export interface RoomWindow {
  /** First year the room exists: work has stopped. */
  fromAge: number
  /** Last year before required distributions begin. */
  toAge: number
  /** The age those distributions start, which is what closes the window. */
  closesAt: number
  years: WindowYear[]
  /** Room across every year of the window, at the binding limit of each. */
  totalRoom: number
  /** What is already claimed across the same years. */
  totalClaimed: number
  /**
   * Each kind of claim, totalled across the window.
   *
   * The line the reader actually reads — "conversions take $310,000 of the
   * $390,000" — and the one that will carry the comparison once there is more
   * than one thing to compare.
   */
  claimedBy: { kind: ClaimKind; label: string; total: number }[]
}

/**
 * How far a rate has to rise before crossing it is worth stopping for.
 *
 * The first version of this reported the nearest boundary of any size, and the
 * nearest is almost always the step from 10% to 12% — two points, a few tens
 * of dollars on the excess. It bound nearly every year of every plan and read
 * as a constraint while a subsidy cliff forty thousand dollars behind it sat
 * unmentioned. A limit nobody would change a decision over is not a limit
 * worth reporting, so the small steps are passed over and the ones that
 * actually move a rate are kept.
 */
const MATERIAL_STEP = 5

/**
 * The next boundary above an income that costs something to cross.
 *
 * Null at the top of a schedule, and null when every remaining step is a small
 * one. Both are real answers rather than missing ones: somebody with no
 * meaningful band above them has no ceiling of this kind left to worry about.
 */
function nextBoundary(
  brackets: Bracket[],
  income: number,
): { at: number; from: number; to: number } | null {
  for (let i = 1; i < brackets.length; i++) {
    const b = brackets[i]
    if (b.from <= income) continue
    // Measured against the band directly beneath the boundary, not against
    // wherever the income happens to sit. What crossing costs is the
    // difference between the rate on the next dollar and the rate it would
    // have paid — a jump from 12% to 22%, whoever is standing where.
    const below = brackets[i - 1].rate
    if (b.rate - below >= MATERIAL_STEP)
      return { at: b.from, from: below, to: b.rate }
  }
  return null
}

const slope = (
  kind: CeilingKind,
  at: number,
  floor: number,
  from: number,
  to: number,
): Slope => ({ kind, edge: 'slope', at, floor, room: Math.max(0, at - floor), from, to })

const cliff = (
  kind: CeilingKind,
  at: number,
  floor: number,
  cost: number,
): Cliff => ({ kind, edge: 'cliff', at, floor, room: Math.max(0, at - floor), cost })

/**
 * Every limit that applies to one year, with the room to each.
 *
 * The year's own conversion is taken out of each floor before measuring. It is
 * a choice rather than a fact of the year, and leaving it in would report the
 * room that survives a decision already made — which is the one figure nobody
 * needs, since the decision can be changed.
 */
function ceilingsFor(
  row: YearRow,
  inputs: PlanInputs,
  thisYear: number,
): Ceiling[] {
  const schedule = FEDERAL[inputs.filingStatus]
  const claimed = row.conversion

  // Approximated as the modified gross income the Medicare tables use, less
  // the deduction. The two differ by tax-exempt interest, which this app does
  // not model, so for every plan it can run they are the same figure.
  const taxable = Math.max(0, row.magi - claimed - schedule.standardDeduction)
  const out: Ceiling[] = []

  const band = nextBoundary(schedule.brackets, taxable)
  if (band) out.push(slope('bracket', band.at, taxable, band.from, band.to))

  const gains = nextBoundary(CAPITAL_GAINS[inputs.filingStatus], taxable)
  if (gains) out.push(slope('gains', gains.at, taxable, gains.from, gains.to))

  // The subsidy is only at stake in years cover is actually bought on the
  // marketplace: after Medicare starts there is no credit to lose, and a
  // household covered another way never had one.
  if (
    row.phase === 'retirement' &&
    row.age < MEDICARE_AGE &&
    inputs.healthCoverBefore65 === 'marketplace'
  ) {
    const magi = acaMagiOf(row) - claimed
    // Counted per year rather than once for the window. A child on the policy
    // lifts the poverty line the subsidy is tested against, and comes off it
    // in the year they turn 26 — so the cliff itself moves down a step as each
    // one leaves, which a single figure for the whole window would hide.
    const onPolicy = policyAges(
      row.age,
      inputs.filingStatus === 'married',
      inputs.dependentBirthYears,
      row.year,
    ).length
    // What crossing forfeits is the credit this year is actually receiving,
    // which the projection has already worked out and put on the row. A
    // household getting little help loses little by crossing, and saying so
    // is more use than quoting the price of a policy they were mostly paying
    // for anyway.
    out.push(
      cliff('aca', povertyLine(onPolicy) * CLIFF, magi, row.healthSubsidy),
    )
  }

  // A surcharge is set by income two years earlier, so the first year a
  // decision can cause one is two before Medicare begins. Earlier years have
  // no Medicare consequence at all, and showing a tier against them would
  // invent a constraint that does not exist yet.
  if (row.age >= MEDICARE_AGE - LOOKBACK_YEARS) {
    const magi = row.magi - claimed
    const table = irmaaTableFor(row.year)

    /**
     * The income restated in the table's own money before it is tested.
     *
     * Every other figure here is in today's dollars, and the Medicare
     * thresholds are not: they are indexed, so each future year's are larger
     * in name without being larger in substance. Testing a real income against
     * a nominal threshold made the room look bigger every year for no reason
     * but the passage of time — 41% too big by 69 on a plan retiring at 55.
     *
     * `simulate` does exactly this conversion before charging the surcharge.
     * Not doing it here meant this table and the projection beside it
     * disagreed about the same threshold.
     */
    const toTable = Math.pow(
      1 + inputs.inflationRate / 100,
      table.year - thisYear,
    )
    const inTable = magi * toTable
    const status = inputs.filingStatus
    const tiers = table.tiers[status]
    const next = tiers[irmaaTierFor(inTable, status, table.year) + 1]
    if (next) {
      // The step from this tier to the next, for the whole household, brought
      // back to today's dollars like everything else on the row.
      const step =
        (annualSurcharge(next.from, status, table.year) -
          annualSurcharge(inTable, status, table.year)) /
        toTable
      out.push(cliff('irmaa', next.from / toTable, magi, step))
    }
  }

  return out.sort((a, b) => a.room - b.room)
}

/**
 * Every kind of claim across the window, largest first.
 *
 * Kept in the order they were met rather than sorted alphabetically: a reader
 * comparing two claimants wants the bigger one at the top.
 */
function totalByKind(years: WindowYear[]) {
  const totals = new Map<ClaimKind, { label: string; total: number }>()
  for (const y of years) {
    for (const c of y.claims) {
      const seen = totals.get(c.kind)
      if (seen) seen.total += c.amount
      else totals.set(c.kind, { label: c.label, total: c.amount })
    }
  }
  return [...totals]
    .map(([kind, v]) => ({ kind, ...v }))
    .sort((a, b) => b.total - a.total)
}

/**
 * The window, year by year.
 *
 * Opens when work stops — before that an extra dollar stacks on a salary and
 * is taxed at the top rate, so there is no room to speak of — and closes when
 * required distributions begin, since from then on the low bands are being
 * filled whether or not anybody chose to fill them.
 *
 * Null when there is no window: still working past the required age, or a plan
 * whose retirement starts after the distributions do.
 */
export function roomByYear(inputs: PlanInputs): RoomWindow | null {
  const thisYear = new Date().getFullYear()
  const closesAt = rmdAge(inputs.currentAge, thisYear)
  const fromAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const toAge = Math.min(closesAt - 1, inputs.endAge)
  if (toAge < fromAge) return null

  const rows = simulate(inputs).rows.filter(
    (r) => r.age >= fromAge && r.age <= toAge,
  )
  if (rows.length === 0) return null

  const years: WindowYear[] = rows.map((row) => {
    const ceilings = ceilingsFor(row, inputs, thisYear)
    const binding = ceilings[0] ?? null
    // A year converting nothing has no claim on it rather than a claim of
    // zero. An empty list reads as untouched; a list of zeroes reads as a
    // decision that happened to come to nothing.
    const claims: Claim[] =
      row.conversion > 0
        ? [
            {
              kind: 'conversion',
              amount: row.conversion,
              label: 'Roth conversions',
            },
          ]
        : []
    return {
      age: row.age,
      year: row.year,
      ceilings,
      binding,
      room: binding?.room ?? 0,
      claims,
      claimed: claims.reduce((a, c) => a + c.amount, 0),
    }
  })

  return {
    fromAge,
    toAge,
    closesAt,
    years,
    totalRoom: years.reduce((a, y) => a + y.room, 0),
    totalClaimed: years.reduce((a, y) => a + y.claimed, 0),
    claimedBy: totalByKind(years),
  }
}

/**
 * A year drawn as four lengths that add up to one bar.
 *
 * Lives here rather than in the component because it is arithmetic, and
 * arithmetic in a component is arithmetic nothing runs a test against. The
 * first version of it summed past the full width whenever a year's floor was
 * already over its limit — the bar ran off its own track, in exactly the years
 * most worth looking at.
 *
 * `floor` is what the year already had, `fits` is the part of the claims the
 * room could take, `spare` is what is left unclaimed, and `over` is the part
 * of the claims there was no room for. Scaled to whichever is longer: the
 * limit, or everything the year actually holds.
 */
export interface Segments {
  floor: number
  fits: number
  spare: number
  over: number
  /** The four above sum to exactly this. */
  scale: number
}

export function segmentsFor(y: WindowYear): Segments {
  const at = y.binding?.at ?? 0
  const floor = y.binding?.floor ?? 0
  const claimed = Math.max(0, y.claimed)
  // Split at the limit rather than drawn whole: the part that fits and the
  // part that does not are different news.
  const fits = Math.min(claimed, y.room)
  return {
    floor,
    fits,
    spare: y.room - fits,
    over: claimed - fits,
    scale: Math.max(floor + claimed, at, 1),
  }
}
