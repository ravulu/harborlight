import type { Bracket, FilingStatus } from '@/lib/state-tax'
import { findState, scheduleFor, taxesSocialSecurityAt } from '@/lib/state-tax'
import { benefitFactor } from '@/lib/social-security'
import type { PlanInputs } from '@/lib/retirement'

/**
 * The most recent year real, published figures have been entered for.
 *
 * Not the year the app prices against — that is `currentTaxYear()`. Once the
 * calendar passes this, the tables are rolled forward by indexation and
 * marked `estimated` rather than left to quietly charge today's income against
 * an older year's thresholds. The guard in `lib/tax.test.ts` is what asks for
 * real figures to replace the estimate.
 */
export const BRACKET_YEAR = 2026

/**
 * Where the figures came from.
 *
 * A field rather than a comment, so `lib/published.ts` can read it, `/admin`
 * can show it and the watcher can say which document it is looking for a
 * successor to. This file cited nothing at all before, which for a table of
 * hand-entered tax brackets is the citation that matters most.
 */
export const BRACKET_SOURCE = {
  title: 'Rev. Proc. 2025-32 — annual inflation adjustments for 2026',
  url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf',
} as const

export interface FederalSchedule {
  brackets: Bracket[]
  standardDeduction: number
}

/**
 * The year the app should price against: the calendar year it is running in.
 *
 * The projection states every figure in today's dollars, so today's brackets
 * are the ones it should be comparing them with — not whichever year happened
 * to be current when the tables were last edited.
 */
export const currentTaxYear = () => new Date().getFullYear()

/**
 * How fast the thresholds are assumed to move when no real table exists yet.
 *
 * Federal brackets, the standard deduction and the capital-gains bands are all
 * indexed to chained CPI each year, so rolling the last entered table forward
 * at a long-run rate lands close. It is an estimate and is labelled as one —
 * the alternative is charging this year's income against an older year's
 * thresholds, which is wrong in a direction nobody can see.
 */
export const ASSUMED_INDEXATION = 0.025

/** Published thresholds land on round numbers; projected ones should too. */
const THRESHOLD_STEP = 50

export interface TaxTable {
  /** The year these figures are law for, and the dollars they are stated in. */
  year: number
  /**
   * True when this table was projected forward from an earlier one rather than
   * entered from published figures. The rates are still the law — only the
   * thresholds and the deduction have been indexed — but the figures are an
   * approximation and anything shown to a reader has to say so.
   */
  estimated?: boolean
  federal: Record<FilingStatus, FederalSchedule>
  /**
   * Long-term capital gains thresholds, on taxable income.
   *
   * Gains sit on top of ordinary income rather than beside it: the ordinary
   * income fills the lower brackets first, and only what is left of the band
   * holds the gain. A retiree living on a modest income can therefore realise
   * a good deal of gain at nothing at all, which is the whole reason a
   * brokerage balance is worth separating from a 401(k).
   */
  capitalGains: Record<FilingStatus, Bracket[]>
}

/**
 * Every year's tables, keyed by the year they apply to.
 *
 * Additive rather than replaced, for the same reason `IRMAA_TABLES` is: adding
 * 2027 next winter must leave 2026 exactly where it is, so a plan run today
 * and the same plan reopened in five years still agree about what 2026
 * charged. One table overwritten each year quietly rewrites history every time
 * it is updated, and a projection is a thing people come back to.
 *
 * Each table's figures are in the dollars of its own year. The projection
 * works in today's dollars throughout and the brackets are indexed to
 * inflation, so it compares against the table for the year it is run in and
 * lets indexing hold them level in real terms — which is what the tax tab
 * tells the reader it does.
 */
export const TAX_TABLES: Record<number, TaxTable> = {}

TAX_TABLES[2026] = {
  year: 2026,
  federal: {
    single: {
      brackets: [
        { rate: 10, from: 0 },
        { rate: 12, from: 12400 },
        { rate: 22, from: 50400 },
        { rate: 24, from: 105700 },
        { rate: 32, from: 201775 },
        { rate: 35, from: 256225 },
        { rate: 37, from: 640600 },
      ],
      standardDeduction: 16100,
    },
    married: {
      brackets: [
        { rate: 10, from: 0 },
        { rate: 12, from: 24800 },
        { rate: 22, from: 100800 },
        { rate: 24, from: 211400 },
        { rate: 32, from: 403550 },
        { rate: 35, from: 512450 },
        { rate: 37, from: 768700 },
      ],
      standardDeduction: 32200,
    },
  },
  capitalGains: {
    single: [
      { rate: 0, from: 0 },
      { rate: 15, from: 49450 },
      { rate: 20, from: 545500 },
    ],
    married: [
      { rate: 0, from: 0 },
      { rate: 15, from: 98900 },
      { rate: 20, from: 613700 },
    ],
  },
}

/** Every year a table exists for, oldest first. */
export const TAX_YEARS = Object.keys(TAX_TABLES)
  .map(Number)
  .sort((a, b) => a - b)

const step = (v: number) => Math.round(v / THRESHOLD_STEP) * THRESHOLD_STEP

/**
 * A table rolled forward to a later year by indexation.
 *
 * Only the thresholds and the standard deduction move: the rates in the middle
 * column are set by statute and do not drift with prices, so 22% stays 22% and
 * only the income at which it starts rises. That is exactly how the real
 * annual adjustment works, which is what makes this a fair approximation
 * rather than a guess.
 *
 * What it cannot anticipate is legislation. A table projected across a year in
 * which Congress changed the rates is wrong in a way no indexation would catch
 * — which is the reason `estimated` is carried and surfaced rather than being
 * a private detail.
 */
function projectTable(base: TaxTable, toYear: number, rate: number): TaxTable {
  const factor = Math.pow(1 + rate, toYear - base.year)
  const indexed = (brackets: Bracket[]) =>
    brackets.map((b) => ({ rate: b.rate, from: b.from === 0 ? 0 : step(b.from * factor) }))

  return {
    year: toYear,
    estimated: true,
    federal: {
      single: {
        brackets: indexed(base.federal.single.brackets),
        standardDeduction: step(base.federal.single.standardDeduction * factor),
      },
      married: {
        brackets: indexed(base.federal.married.brackets),
        standardDeduction: step(base.federal.married.standardDeduction * factor),
      },
    },
    capitalGains: {
      single: indexed(base.capitalGains.single),
      married: indexed(base.capitalGains.married),
    },
  }
}

/**
 * The tables that govern a given year.
 *
 * Before the first year entered, the first is used. Within the range, the most
 * recent table at or before the year asked for. Past the last, the last one
 * indexed forward — because a year with no table is not a reason to charge its
 * income against an older year's thresholds, and waiting for somebody to type
 * in the new figures means being quietly wrong until they do.
 */
export function taxTableFor(
  year: number,
  /** Indexation to roll forward by, when the year is past the last table. */
  rate: number = ASSUMED_INDEXATION,
): TaxTable {
  const first = TAX_YEARS[0]
  const last = TAX_YEARS[TAX_YEARS.length - 1]
  if (year <= first) return TAX_TABLES[first]
  if (year > last) return projectTable(TAX_TABLES[last], Math.floor(year), rate)
  let chosen = first
  for (const y of TAX_YEARS) if (y <= year) chosen = y
  return TAX_TABLES[chosen]
}

/**
 * The brackets and deductions for the year the app is running in.
 *
 * Kept as named exports because almost every caller wants the current year and
 * should not have to say so — and because they were the shape of this module
 * before it held more than one year, so nothing that reads them had to change.
 *
 * Bound at import, so a process running across New Year keeps the old year
 * until it restarts. Deployments restart; a difference of one day either side
 * of midnight on 1 January is not worth reading the clock on every lookup.
 */
export const CURRENT_TAX_TABLE = taxTableFor(currentTaxYear())

export const FEDERAL: Record<FilingStatus, FederalSchedule> =
  CURRENT_TAX_TABLE.federal

export const CAPITAL_GAINS: Record<FilingStatus, Bracket[]> =
  CURRENT_TAX_TABLE.capitalGains

/** Tax owed on `income`, applying each rate only to the slice inside it. */
export function taxOn(income: number, brackets: Bracket[], deduction: number): number {
  const taxable = Math.max(0, income - deduction)
  if (taxable === 0 || brackets.length === 0) return 0

  let tax = 0
  for (let i = 0; i < brackets.length; i++) {
    const { rate, from } = brackets[i]
    if (taxable <= from) break
    const to = brackets[i + 1]?.from ?? Infinity
    tax += ((Math.min(taxable, to) - from) * rate) / 100
  }
  return tax
}

/**
 * How much of a Social Security benefit counts as ordinary income federally,
 * per IRS Publication 915. Single filer.
 *
 * Provisional income is other income plus half the benefit. Below $25,000 none
 * of the benefit is taxable; between $25,000 and $34,000 up to half is; above
 * $34,000 up to 85% is. The thresholds have never been indexed to inflation,
 * so they are fixed figures rather than anything that moves with the plan.
 */
export const SS_THRESHOLDS: Record<FilingStatus, { base: number; adjusted: number }> = {
  single: { base: 25000, adjusted: 34000 },
  married: { base: 32000, adjusted: 44000 },
}

export function taxableSocialSecurity(
  benefit: number,
  otherIncome: number,
  status: FilingStatus = 'single',
): number {
  if (benefit <= 0) return 0
  const { base, adjusted } = SS_THRESHOLDS[status]
  const provisional = otherIncome + benefit / 2

  if (provisional <= base) return 0

  const tier1 = Math.min((provisional - base) / 2, benefit / 2)
  if (provisional <= adjusted) return tier1

  // The cap inside the top tier is half the gap between the thresholds:
  // $4,500 single, $6,000 married.
  const tierCap = (adjusted - base) / 2
  const optionA = 0.85 * (provisional - adjusted) + Math.min(tier1, tierCap)
  return Math.min(optionA, 0.85 * benefit)
}

export interface RateEstimate {
  /** federal effective rate — tax owed over the whole withdrawal — percent */
  federal: number
  /** state effective rate, on the same basis */
  state: number
  /** the withdrawal the estimate was built from, in today's dollars */
  grossWithdrawal: number
  federalTax: number
  /** the capital-gains half of federalTax, when the projection knows it */
  federalGainsTax: number
  /** the gain that was exposed to it */
  capitalGains: number
  stateTax: number
  /** the annual benefit the estimate assumed, today's dollars */
  benefit: number
  /** how much of it counts as ordinary income federally */
  taxableSocialSecurity: number
  /** that amount as a share of the benefit, 0 to 0.85 */
  taxableShare: number
  stateTaxesSocialSecurity: boolean
}

/**
 * Estimates the rates for a plan's first year of retirement.
 *
 * Worked in today's dollars: brackets and deductions are inflation-indexed in
 * practice, so comparing an inflated withdrawal against today's thresholds
 * would drift the estimate upward every year for no real reason.
 *
 * The withdrawal and the tax on it are mutually dependent — a bigger
 * withdrawal is taxed more, and covering that tax needs a bigger withdrawal —
 * so this iterates to the fixed point rather than closing the loop with a
 * single flat rate.
 */
/**
 * The tax picture for one steady year, in today's dollars: a spending need,
 * a benefit that may or may not have started, and the withdrawal that closes
 * the gap after tax.
 */
export function taxYear(
  spending: number,
  benefit: number,
  stateCode: string,
  status: FilingStatus,
  /**
   * Pension and any other income, today's dollars. It covers part of the
   * spending and is taxed as ordinary income — and because it counts toward
   * provisional income, it also drags more of the benefit into tax.
   */
  otherIncome: number = 0,
  /** The year whose brackets apply; the current one by default. */
  year: number = currentTaxYear(),
): RateEstimate {
  const state = findState(stateCode)
  const withdrawalsExempt = state?.retirementExempt ?? false
  const schedule = state ? scheduleFor(state, status) : undefined
  const stateBrackets = schedule?.brackets ?? []
  const stateDeduction = schedule?.standardDeduction ?? 0
  const fed = taxTableFor(year).federal[status]

  const netNeed = Math.max(0, spending - benefit - otherIncome)

  const taxesFor = (withdrawal: number) => {
    const ordinary = withdrawal + otherIncome
    const taxableSS = taxableSocialSecurity(benefit, ordinary, status)
    const federalIncome = ordinary + taxableSS
    const federalTax = taxOn(federalIncome, fed.brackets, fed.standardDeduction)
    // A state that exempts retirement withdrawals still taxes a pension and
    // other income, so only the withdrawal is dropped from the base.
    const agi = ordinary + taxableSS
    const stateTaxesSS = taxesSocialSecurityAt(state, status, agi)
    const stateIncome =
      (withdrawalsExempt ? 0 : withdrawal) + otherIncome + (stateTaxesSS ? taxableSS : 0)
    const stateTax = taxOn(stateIncome, stateBrackets, stateDeduction)
    return { taxableSS, federalTax, stateTax }
  }

  let gross = netNeed
  for (let i = 0; i < 32; i++) {
    const { federalTax, stateTax } = taxesFor(gross)
    const next = netNeed + federalTax + stateTax
    if (Math.abs(next - gross) < 0.5) {
      gross = next
      break
    }
    gross = next
  }

  const { taxableSS, federalTax, stateTax } = taxesFor(gross)
  const round = (v: number) => Math.round(v * 10) / 10

  return {
    federalGainsTax: 0,
    capitalGains: 0,
    federal: gross > 0 ? round((federalTax / gross) * 100) : 0,
    state: gross > 0 ? round((stateTax / gross) * 100) : 0,
    grossWithdrawal: gross,
    federalTax,
    stateTax,
    benefit,
    taxableSocialSecurity: taxableSS,
    taxableShare: benefit > 0 ? taxableSS / benefit : 0,
    // Reported for the household this estimate was built for, not for the
    // state in the abstract: a state that taxes the benefit may well not tax
    // theirs, and the tax tab says which.
    stateTaxesSocialSecurity: taxesSocialSecurityAt(
      state,
      status,
      gross + otherIncome + taxableSS,
    ),
  }
}

/**
 * Tax on a long-term gain that sits on top of `ordinaryTaxable`.
 *
 * Stacked, not stand-alone: the ordinary income has already used up the lower
 * brackets, so the gain is taxed from where that left off.
 */
export function capitalGainsTax(
  gain: number,
  ordinaryTaxable: number,
  status: FilingStatus,
  /** The year whose thresholds apply; the current one by default. */
  year: number = currentTaxYear(),
): number {
  if (gain <= 0) return 0
  const brackets = taxTableFor(year).capitalGains[status]
  let tax = 0
  for (let i = 0; i < brackets.length; i++) {
    const from = brackets[i].from
    const to = brackets[i + 1]?.from ?? Infinity
    // The slice of this bracket the gain occupies, once ordinary income has
    // taken its share of it.
    const start = Math.max(from, ordinaryTaxable)
    const slice = Math.min(ordinaryTaxable + gain, to) - start
    if (slice > 0) tax += (slice * brackets[i].rate) / 100
  }
  return tax
}

/** What someone holds, by how it will be taxed when it comes out. */
export interface Pots {
  /** Taxable brokerage. Only the gain is taxed, and at gains rates. */
  brokerage: number
  /** The share of that balance which is gain rather than what was paid in. */
  gainShare: number
  /** 401(k) and traditional IRA: ordinary income, every dollar of it. */
  deferred: number
  /** Roth: nothing owed on the way out. */
  roth: number
}

export interface Draw {
  fromBrokerage: number
  fromDeferred: number
  fromRoth: number
  /** Everything taken out, tax included. */
  gross: number
  federalTax: number
  /**
   * The part of federalTax that is capital-gains tax on the brokerage draw,
   * rather than ordinary income tax. Carried separately because on a plan
   * spending a taxable account it is most of the bill, and a note that cannot
   * name it has to leave the largest figure it quotes unaccounted for.
   */
  federalGainsTax: number
  /**
   * The 10% additional tax on a tax-deferred withdrawal taken before 59½,
   * under IRC §72(t). A part of `federalTax` rather than a figure beside it,
   * for the same reason `federalGainsTax` is: it is federal tax owed on this
   * withdrawal, and a total that excluded it would not be the bill.
   *
   * Charged only on the deferred draw. A Roth withdrawal can carry it too, on
   * the earnings rather than the contributions, but the projection does not
   * track basis within the Roth and guessing at the split would be worse than
   * leaving it — a Roth drawn early is the case this understates.
   */
  earlyWithdrawalPenalty: number
  stateTax: number
  capitalGains: number
  taxableSocialSecurity: number
  /**
   * The part of the deferred draw that was compulsory — the required minimum
   * distribution, where one was due. Reported because it is the part of the
   * withdrawal the household did not choose, and the projection's answer to
   * "why is this year's tax so much higher" is usually this number.
   */
  requiredDistribution: number
  /**
   * What the withdrawal delivered above the need, after tax. A required
   * distribution larger than the year's spending leaves money in hand that
   * has already been taxed; it does not vanish, and it does not stay in the
   * account it was forced out of.
   */
  surplus: number
  /**
   * The part of `need` the pots could not meet, after the tax on what they
   * did supply.
   *
   * A withdrawal cannot exceed what is there, so once the pots run dry `gross`
   * stops rising and this carries the difference instead. It is the signal a
   * plan has failed: a projection that reports a shortfall here is describing
   * a household that came up short that year, whatever its balance says.
   */
  unfunded: number
}

/** What the law compels or charges this year, independently of the need. */
export interface DrawRules {
  /**
   * A required minimum distribution due from the deferred pot. It comes out
   * first and it comes out whether or not the spending calls for it, so it
   * sets a floor under the withdrawal rather than competing with the need.
   */
  requiredDeferred?: number
  /**
   * Whether a deferred withdrawal this year carries the 10% additional tax
   * for being taken before 59½.
   */
  earlyPenalty?: boolean
  /**
   * The age this draw is made at. Only used to decide whether a state exempts
   * the benefit by age rather than by income, which one of the eight does.
   */
  age?: number
  /**
   * A Roth conversion made this year: ordinary income in full, and unlike
   * every other kind of income it pays for nothing. The money moves from one
   * sheltered account to another, so the need is unchanged while the bracket
   * it is taxed in has risen — which is the whole trade, and the reason the
   * withdrawal has to grow to cover a bill it did not create.
   */
  conversion?: number
}

/** The additional tax on a tax-deferred withdrawal before 59½, IRC §72(t). */
export const EARLY_WITHDRAWAL_PENALTY_RATE = 0.1

/**
 * How to take `need` out of the three pots, and what it costs in tax.
 *
 * Drawn taxable first, then tax-deferred, then Roth. That is the conventional
 * order and it is conventional for a reason: it leaves the sheltered accounts
 * compounding longest, and it spends the pot whose tax is already partly paid
 * before the one where none of it is.
 *
 * A required distribution is the exception to that order: it is compulsory, so
 * it comes out of the deferred pot ahead of everything else, and the rest of
 * the need is met from what is left in the conventional order afterwards. When
 * it exceeds the need the withdrawal is larger than the year required and the
 * difference comes back as `surplus`.
 *
 * Solved rather than calculated, because the tax depends on the withdrawal and
 * the withdrawal has to cover the tax.
 */
export function withdrawForNeed(
  need: number,
  benefit: number,
  otherIncome: number,
  stateCode: string,
  status: FilingStatus,
  pots: Pots,
  rules: DrawRules = {},
  /** The year whose brackets apply; the current one by default. */
  year: number = currentTaxYear(),
): Draw {
  const state = findState(stateCode)
  const withdrawalsExempt = state?.retirementExempt ?? false
  const schedule = scheduleFor(state ?? ({} as never), status)
  const stateBrackets = state ? schedule.brackets : []
  const stateDeduction = state ? schedule.standardDeduction : 0
  const fed = taxTableFor(year).federal[status]
  const gainShare = Math.min(1, Math.max(0, pots.gainShare / 100))

  const wanted = Math.max(0, need)
  // Nothing can be drawn that is not held. Capping at this is what keeps the
  // three sources summing to `gross`: without it the fixed point below raises
  // `gross` to cover a tax bill the pots cannot fund, and the difference
  // becomes a withdrawal with no account behind it.
  const available =
    Math.max(0, pots.brokerage) + Math.max(0, pots.deferred) + Math.max(0, pots.roth)

  const deferredHeld = Math.max(0, pots.deferred)
  // A distribution cannot be larger than the account it is due from. An
  // account already emptied has nothing left to force out of it.
  const forced = Math.min(Math.max(0, rules.requiredDeferred ?? 0), deferredHeld)

  const priced = (gross: number): Draw => {
    // The compulsory part comes out first, then the rest of the withdrawal is
    // met in the conventional order from what remains.
    const rest = Math.max(0, gross - forced)
    const fromBrokerage = Math.min(rest, Math.max(0, pots.brokerage))
    const chosenDeferred = Math.min(rest - fromBrokerage, deferredHeld - forced)
    const fromDeferred = forced + chosenDeferred
    const fromRoth = Math.min(
      rest - fromBrokerage - chosenDeferred,
      Math.max(0, pots.roth),
    )
    const capitalGains = fromBrokerage * gainShare
    // Roth never shows up here; that is the point of it. A conversion does:
    // it is taxed exactly as a withdrawal from the same account would be, and
    // the only difference is where the money lands afterwards.
    const converted = Math.max(0, rules.conversion ?? 0)
    const ordinary = fromDeferred + otherIncome + converted
    const taxableSS = taxableSocialSecurity(benefit, ordinary + capitalGains, status)
    const ordinaryIncome = ordinary + taxableSS
    const ordinaryTaxable = Math.max(0, ordinaryIncome - fed.standardDeduction)
    const gainsTax = capitalGainsTax(capitalGains, ordinaryTaxable, status, year)
    // Charged on the deferred draw alone, and charged inside the fixed point
    // so the withdrawal grows to cover it the way it grows to cover any other
    // tax. A penalty settled out of the same pot it is levied on would
    // otherwise leave the year short by a tenth of the draw.
    const penalty = rules.earlyPenalty
      ? fromDeferred * EARLY_WITHDRAWAL_PENALTY_RATE
      : 0
    const federalTax =
      taxOn(ordinaryIncome, fed.brackets, fed.standardDeduction) + gainsTax + penalty
    // States that exempt retirement withdrawals still tax a brokerage gain,
    // and almost all of them tax it as ordinary income rather than at a
    // separate rate.
    // Whether the state taxes the benefit is decided on this year's income,
    // not on the state alone: all eight that do exempt it below a limit, and
    // most retirees fall under theirs.
    const agi = fromDeferred + converted + otherIncome + capitalGains + taxableSS
    const stateTaxesSS = taxesSocialSecurityAt(state, status, agi, rules.age)
    const stateIncome =
      (withdrawalsExempt ? 0 : fromDeferred + converted) +
      otherIncome +
      capitalGains +
      (stateTaxesSS ? taxableSS : 0)
    const stateTax = taxOn(stateIncome, stateBrackets, stateDeduction)
    return {
      fromBrokerage,
      fromDeferred,
      fromRoth,
      gross,
      federalTax,
      federalGainsTax: gainsTax,
      earlyWithdrawalPenalty: penalty,
      stateTax,
      capitalGains,
      taxableSocialSecurity: taxableSS,
      requiredDistribution: forced,
      // A draw the pots did not cap met its need by construction — the loop
      // below was free to raise `gross` until it did — so the only draw that
      // can fall short is one that took everything there was. Deciding it on
      // the cap rather than on the arithmetic matters: the fixed point settles
      // to within fifty cents, and testing the difference directly would read
      // that residue as a failed year on every solvent plan.
      unfunded: gross < available ? 0 : Math.max(0, wanted - (gross - federalTax - stateTax)),
      // What a compulsory distribution left over once the year was paid for.
      //
      // Only a draw the floor pushed above the need can leave anything: a draw
      // sized to the need covers it and no more. Gated on that rather than on
      // the subtraction for the same reason `unfunded` is — the loop below
      // settles to within fifty cents, and a bare subtraction would hand back
      // a few spurious cents of surplus on every ordinary year.
      surplus:
        forced > wanted + federalTax + stateTax
          ? Math.max(0, gross - federalTax - stateTax - wanted)
          : 0,
    }
  }

  // The floor is the compulsory distribution, the target is whatever covers
  // the need and its tax, and the ceiling is what the pots actually hold.
  const floor = Math.min(forced, available)
  let gross = Math.min(Math.max(wanted, floor), available)
  let draw = priced(gross)
  for (let i = 0; i < 40; i++) {
    const next = Math.min(
      Math.max(wanted + draw.federalTax + draw.stateTax, floor),
      available,
    )
    if (Math.abs(next - gross) < 0.5) break
    gross = next
    draw = priced(gross)
  }
  return priced(gross)
}

/** The birthday after which a 401(k) or IRA withdrawal stops carrying a penalty. */
export const PENALTY_FREE_AGE = 59.5

/** Where a stretch's money came from, and what that cost. */
export interface PhaseSources {
  /** Taxable account: only the gain share is taxed, at capital-gains rates. */
  brokerage: number
  /** 401(k) and traditional IRA: ordinary income, in full. */
  deferred: number
  /** Roth: not taxed at all. */
  roth: number
  total: number
  /** Whether the projection, not the inputs, says these are real figures. */
  fromProjection: boolean
}

export interface TaxPhase {
  key: 'earlyPenalty' | 'penaltyFree' | 'withBenefit' | 'withBothBenefits'
  label: string
  detail: string
  /** What could be done about this stretch, rather than what it is. */
  scenario: string
  /**
   * Tax across the whole stretch, today's dollars, from the projection, split
   * by who levies it. Kept on the stretch's own basis so every figure in a
   * tile can be read against every other: a per-year withdrawal sitting beside
   * a whole-stretch tax bill divides to a rate nobody pays.
   */
  totalFederalTax: number
  totalStateTax: number
  /**
   * The 10% early-withdrawal penalty inside `totalFederalTax`, summed across
   * the stretch. Reported separately because it is the one charge here that a
   * different decision removes outright — waiting, or drawing from another
   * account — rather than one that only moves with the amount.
   */
  totalPenalty: number
  /**
   * Medicare surcharges across the stretch. Beside the tax figures rather than
   * inside them: it is a premium, not a tax, and a reader who added it into
   * either total would be describing a bill nobody sends.
   */
  totalIrmaa: number
  /** Health cover before Medicare, which the plan prices rather than asks for. */
  totalHealthPremium: number
  /** Whether the 401(k) or IRA is actually drawn on during it. */
  drawsDeferred: boolean
  /**
   * What actually paid for the stretch, summed from the projection in today's
   * dollars. The rate is a consequence of this mix and of nothing else, so a
   * tile that shows one without the other cannot be checked: the same spending
   * met from a brokerage account, a 401(k) and a Roth carries three different
   * bills.
   */
  sources: PhaseSources
  fromAge: number
  /** inclusive */
  toAge: number
  years: number
  /** the picture at the start of the stretch */
  rates: RateEstimate
  /**
   * The picture at its end, present only when it differs — which happens when
   * the COLA and the inflation rate are not the same, so the benefit's real
   * value drifts across the stretch instead of holding still.
   */
  endRates?: RateEstimate
}

/**
 * The whole retirement broken into the stretches over which the tax picture
 * is genuinely constant.
 *
 * In today's dollars there are only ever two or three: the working years,
 * the retired years before the benefit starts, and the years after.
 *
 * Spending is flat in real terms and the brackets are indexed, so within a
 * stretch the only thing that can move is the benefit — and only when its
 * cost-of-living adjustment differs from inflation. Where it does, the end of
 * the stretch is reported alongside its start rather than pretending to one
 * number.
 */
export function taxPhases(
  inputs: PlanInputs,
  stateCode: string,
  status: FilingStatus,
  /**
   * The projected years, when the caller has them. Only used to find the age
   * the 401(k) and IRA are first drawn on, which is the one thing the inputs
   * cannot say: the taxable account is spent first, so a plan holding one may
   * not touch tax-deferred money for years after retiring.
   */
  rows?: {
    age: number
    phase: string
    withdrawals: number
    fromBrokerage: number
    fromDeferred: number
    fromRoth: number
    taxes: number
    federalTax: number
    federalGainsTax: number
    earlyWithdrawalPenalty: number
    irmaaSurcharge: number
    healthPremium: number
    capitalGains: number
    stateTax: number
    socialSecurity: number
    taxableSocialSecurity: number
  }[],
): TaxPhase[] {
  const retirementAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const endAge = Math.max(inputs.endAge, retirementAge)
  const enteredClaimAge = Math.min(
    Math.max(inputs.socialSecurityAge, retirementAge),
    endAge,
  )
  const spending = inputs.monthlyRetirementSpending * 12
  const pensionDrift =
    (1 + inputs.pensionCola / 100) / (1 + inputs.inflationRate / 100)
  const realOtherAt = (age: number) =>
    (age >= inputs.pensionStartAge
      ? inputs.pensionMonthly *
        12 *
        Math.pow(pensionDrift, Math.max(0, age - inputs.pensionStartAge))
      : 0) +
    (age >= inputs.otherIncomeStartAge ? inputs.otherIncomeMonthly * 12 : 0)

  // The benefit in today's money at a given age. It arrives worth what was
  // entered and drifts only afterwards, by the gap between the COLA and
  // inflation.
  const drift =
    (1 + inputs.socialSecurityCola / 100) / (1 + inputs.inflationRate / 100)
  const claimFactor = benefitFactor(inputs.socialSecurityAge)
  const realBenefitAt = (age: number) =>
    inputs.socialSecurityMonthly *
    12 *
    claimFactor *
    Math.pow(drift, Math.max(0, age - inputs.socialSecurityAge))

  const phases: TaxPhase[] = []
  const penaltyEnd = Math.floor(PENALTY_FREE_AGE) // last year the penalty bites

  const retirementRows = (rows ?? []).filter((r) => r.phase === 'retirement')
  /**
   * The age Social Security first arrives, read off the projection.
   *
   * Not the entered claim age: a spouse claiming before the worker starts the
   * money years earlier, and a stretch built on the worker's date would put
   * their payments inside a tile whose heading says none are being paid.
   */
  const claimAge = (() => {
    const paid = retirementRows
      .filter((r) => (r.socialSecurity ?? 0) > 1)
      .map((r) => r.age)
    if (paid.length) return Math.min(...paid)
    // A plan with nothing entered is never paid anything, and a stretch headed
    // "with Social Security" whose own row reads "not started" contradicts
    // itself. Push the claim past the end and the stretch never opens.
    if (retirementRows.length && inputs.socialSecurityMonthly <= 0) return endAge + 1
    return enteredClaimAge
  })()
  /** Tax actually paid across a stretch, rather than a per-year figure times years. */
  const sumAcross = (
    from: number,
    to: number,
    f: (r: (typeof retirementRows)[number]) => number,
  ) =>
    retirementRows
      .filter((r) => r.age >= from && r.age <= to)
      .reduce((sum, r) => sum + (f(r) || 0), 0)
  const deferredDrawnIn = (from: number, to: number) =>
    retirementRows.some((r) => r.age >= from && r.age <= to && r.fromDeferred > 0)

  const sourcesAcross = (from: number, to: number): PhaseSources => {
    const rs = retirementRows.filter((r) => r.age >= from && r.age <= to)
    const sum = (f: (r: (typeof rs)[number]) => number) =>
      rs.reduce((a, r) => a + (f(r) || 0), 0)
    const brokerage = sum((r) => r.fromBrokerage)
    const deferred = sum((r) => r.fromDeferred)
    const roth = sum((r) => r.fromRoth)
    return {
      brokerage,
      deferred,
      roth,
      total: brokerage + deferred + roth,
      fromProjection: rs.length > 0,
    }
  }

  /**
   * The stretch's rates as the projection actually worked them out, averaged
   * over its years.
   *
   * The estimate passed in prices the whole withdrawal as ordinary income,
   * which is only right for a plan whose money is all in a 401(k). A plan
   * spending a taxable account pays tax on the gain alone, and one spending a
   * Roth pays none — so the estimate can be several times the real bill. It
   * stays as the fallback for a caller with no projection to hand.
   */
  const ratesAcross = (from: number, to: number, fallback: RateEstimate): RateEstimate => {
    const rs = retirementRows.filter((r) => r.age >= from && r.age <= to)
    if (!rs.length) return fallback
    const mean = (f: (r: (typeof rs)[number]) => number) =>
      rs.reduce((a, r) => a + (f(r) || 0), 0) / rs.length
    const gross = mean((r) => r.withdrawals ?? 0)
    const federalTax = mean((r) => r.federalTax ?? 0)
    const federalGainsTax = mean((r) => r.federalGainsTax ?? 0)
    const capitalGains = mean((r) => r.capitalGains ?? 0)
    const stateTax = mean((r) => r.stateTax ?? 0)
    const benefit = mean((r) => r.socialSecurity ?? 0)
    const taxableSS = mean((r) => r.taxableSocialSecurity ?? 0)
    const round = (v: number) => Math.round(v * 10) / 10
    return {
      ...fallback,
      federal: gross > 0 ? round((federalTax / gross) * 100) : 0,
      state: gross > 0 ? round((stateTax / gross) * 100) : 0,
      grossWithdrawal: gross,
      federalTax,
      federalGainsTax,
      capitalGains,
      stateTax,
      benefit,
      taxableSocialSecurity: taxableSS,
      taxableShare: benefit > 0 ? taxableSS / benefit : 0,
    }
  }

  /**
   * One sentence naming what pays for a stretch. The rate follows from this
   * and from nothing else, so it is the sentence that makes the figure above
   * it checkable rather than something to be taken on trust.
   */
  const fundedBy = (src: PhaseSources): string => {
    if (!src.fromProjection || src.total <= 0) return ''
    const share = (v: number) => Math.round((v / src.total) * 100)
    const parts: string[] = []
    if (share(src.brokerage) >= 1)
      parts.push(`${share(src.brokerage)}% from the brokerage account, where only the gain is taxed`)
    if (share(src.deferred) >= 1)
      parts.push(`${share(src.deferred)}% from the 401(k) or IRA, taxed as ordinary income`)
    if (share(src.roth) >= 1)
      parts.push(`${share(src.roth)}% from the Roth, not taxed at all`)
    if (!parts.length) return ''
    if (parts.length === 1) return `Spending here is paid ${parts[0]}.`
    const last = parts.pop() as string
    return `Spending here is paid ${parts.join(', ')} and ${last}.`
  }

  const add = (
    key: TaxPhase['key'],
    label: string,
    detail: string,
    scenario: string,
    from: number,
    to: number,
    rates: RateEstimate,
    endRates?: RateEstimate,
  ) => {
    if (to < from) return
    const real = ratesAcross(from, to, rates)
    // A range only means something when the projection did not already
    // average the drift into the single figure above it.
    const realEnd = retirementRows.length ? undefined : endRates
    phases.push({
      key,
      label,
      detail,
      scenario,
      fromAge: from,
      toAge: to,
      years: to - from + 1,
      totalFederalTax: sumAcross(from, to, (r) => r.federalTax),
      totalStateTax: sumAcross(from, to, (r) => r.stateTax),
      totalPenalty: sumAcross(from, to, (r) => r.earlyWithdrawalPenalty),
      totalIrmaa: sumAcross(from, to, (r) => r.irmaaSurcharge),
      totalHealthPremium: sumAcross(from, to, (r) => r.healthPremium),
      drawsDeferred: deferredDrawnIn(from, to),
      sources: sourcesAcross(from, to),
      rates: real,
      endRates: realEnd,
    })
  }

  // 1. Retired, and any 401(k) or IRA withdrawal still carries a penalty.
  const earlyTo = Math.min(penaltyEnd, claimAge - 1)
  const earlySources = sourcesAcross(retirementAge, earlyTo)
  if (retirementAge <= earlyTo) {
    const draws = deferredDrawnIn(retirementAge, earlyTo)
    add(
      'earlyPenalty',
      'Before 59½',
      draws
        ? `${fundedBy(earlySources)} The 401(k) and IRA money costs another 10% on top of the income tax at this age, and the rate shown includes it — which is most of why these years read more expensively than the ones after 59½.`
        : `${fundedBy(earlySources)} Nothing comes out of the 401(k) or IRA, so the 10% early-withdrawal penalty never applies.`,
      draws
        ? 'Spending a brokerage or Roth balance first, or waiting until 59½ to touch the 401(k), avoids the penalty entirely — worth about a tenth of every dollar taken from it.'
        : 'Keep it that way: any 401(k) or IRA withdrawal before 59½ would add 10% to the cost of these years.',
      retirementAge,
      earlyTo,
      taxYear(spending, 0, stateCode, status, realOtherAt(retirementAge)),
    )
  }

  // 2. Penalty gone, benefit not started. Usually the emptiest income years of
  // a life, and the only ones that can be filled on purpose.
  const freeFrom = Math.max(retirementAge, penaltyEnd + 1)
  if (freeFrom <= claimAge - 1) {
    add(
      'penaltyFree',
      // Only "from 59½" when that birthday is what starts it. Retiring later
      // makes this simply the stretch before the benefit.
      freeFrom === penaltyEnd + 1 ? 'From 59½' : 'Before Social Security',
      // Whether the rate moves at 59½ is the first thing a reader checks, and
      // the honest answer is that the birthday itself never moves it: only a
      // change in which account pays for the year does. Three cases, because
      // reading the same figure in both tiles means something different in
      // each of them.
      (() => {
        const here = sourcesAcross(freeFrom, claimAge - 1)
        const nowDeferred = here.deferred > 0
        const wasDeferred = earlySources.deferred > 0
        const opening = fundedBy(here)
        if (nowDeferred && wasDeferred)
          return `${opening} The 401(k) was already paying for the earlier years, so reaching 59½ changes nothing about the tax — the rate is the same as before. What ends is the 10% penalty on those withdrawals.`
        if (nowDeferred && !wasDeferred)
          return `${opening} This is where the 401(k) starts being drawn, and those dollars are ordinary income in full, unlike the taxable account that paid for the earlier years — which is why the rate steps up here.`
        return `${opening} The 401(k) and IRA are reachable without a penalty now, but nothing is taken from them yet, so the rate does not move at 59½. Social Security has not started either, so savings still cover every dollar of spending.`
      })(),
      'These are the cheapest years to move money out of the 401(k) on purpose: converting to a Roth, or simply drawing more than you need, fills the lower brackets while there is no benefit stacked on top of them.',
      freeFrom,
      claimAge - 1,
      taxYear(spending, 0, stateCode, status, realOtherAt(freeFrom)),
    )
  }

  // 3. Social Security arrives and starts pulling itself into tax.
  //
  // A couple claiming on different dates gets two stretches rather than one:
  // the second claim can treble what arrives each year, and averaging across
  // the step shows a figure that is wrong at both ends of it. Found from the
  // projection rather than re-derived from the claim ages, so it cannot drift
  // out of step with the model that actually pays the money — and so it also
  // catches a spouse who claims first.
  const secondClaimAge = (() => {
    // The value, not the label: FILING_STATUSES calls this one "joint", and a
    // test against that word would silently never fire.
    if (status !== 'married') return null
    const inStretch = retirementRows
      .filter((r) => r.age >= claimAge && r.age <= endAge - 1)
      .sort((a, b) => a.age - b.age)
    for (let i = 1; i < inStretch.length; i++) {
      const prev = inStretch[i - 1].socialSecurity ?? 0
      const here = inStretch[i].socialSecurity ?? 0
      // A cost-of-living drift moves this by a fraction of a percent; a second
      // claim moves it by tens of percent.
      if (prev > 1 && here > prev * 1.15) return inStretch[i].age
    }
    return null
  })()

  const benefitStretch = (
    key: TaxPhase['key'],
    label: string,
    from: number,
    to: number,
    detail: string,
    scenario: string,
  ) => {
    const startBenefit = realBenefitAt(from)
    const endBenefit = realBenefitAt(to)
    const startOther = realOtherAt(from)
    const endOther = realOtherAt(to)
    const rates = taxYear(spending, startBenefit, stateCode, status, startOther)
    const endRates =
      Math.abs(endBenefit - startBenefit) > 1 || Math.abs(endOther - startOther) > 1
        ? taxYear(spending, endBenefit, stateCode, status, endOther)
        : undefined
    add(key, label, detail, scenario, from, to, rates, endRates)
  }

  if (endAge > claimAge) {
    const split = secondClaimAge !== null && secondClaimAge > claimAge && secondClaimAge <= endAge - 1
    const firstTo = split ? (secondClaimAge as number) - 1 : endAge - 1
    benefitStretch(
      'withBenefit',
      split
        ? `From ${claimAge}, one Social Security`
        : `From ${claimAge}, with Social Security`,
      claimAge,
      firstTo,
      split
        ? `${fundedBy(sourcesAcross(claimAge, firstTo))} Only one of you has claimed, so a single payment covers part of the spending — savings still cover the rest, and both count toward the income that decides how much of that payment is taxed.`
        : `${fundedBy(sourcesAcross(claimAge, firstTo))} Social Security covers part of the spending, so less is withdrawn — but it also counts toward the income that decides how much of Social Security itself is taxed.`,
      split
        ? `These are the last years before the second claim lands, so they are the cheaper ones to take a large withdrawal in — once both payments arrive, every extra dollar drags more of them into tax.`
        : `Every extra dollar withdrawn here drags more of Social Security into tax with it, so a large one-off cost is cheaper met from a Roth. Claiming later than ${claimAge} would raise it for life and shorten this stretch.`,
    )
    if (split) {
      const from = secondClaimAge as number
      benefitStretch(
        'withBothBenefits',
        `From ${from}, both Social Security`,
        from,
        endAge - 1,
        `${fundedBy(sourcesAcross(from, endAge - 1))} The second claim lands here, so both payments arrive and far less has to come out of savings — but the two together also push more of themselves into tax.`,
        `With both payments running, a large one-off cost is cheapest met from a Roth: every ordinary dollar taken here drags more of both payments into tax behind it.`,
      )
    }
  }

  return phases
}

export function estimateRates(
  inputs: PlanInputs,
  stateCode: string,
  status: FilingStatus = 'single',
): RateEstimate {
  const retirementAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const drift =
    (1 + inputs.socialSecurityCola / 100) / (1 + inputs.inflationRate / 100)
  const benefit =
    retirementAge >= inputs.socialSecurityAge
      ? inputs.socialSecurityMonthly *
        12 *
        benefitFactor(inputs.socialSecurityAge) *
        Math.pow(drift, retirementAge - inputs.socialSecurityAge)
      : 0
  const pensionDrift =
    (1 + inputs.pensionCola / 100) / (1 + inputs.inflationRate / 100)
  const otherIncome =
    (retirementAge >= inputs.pensionStartAge
      ? inputs.pensionMonthly *
        12 *
        Math.pow(pensionDrift, retirementAge - inputs.pensionStartAge)
      : 0) +
    (retirementAge >= inputs.otherIncomeStartAge ? inputs.otherIncomeMonthly * 12 : 0)

  return taxYear(
    inputs.monthlyRetirementSpending * 12,
    benefit,
    stateCode,
    status,
    otherIncome,
  )
}
