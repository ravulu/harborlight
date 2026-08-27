import { CAPITAL_GAINS, FEDERAL, taxOn } from '@/lib/tax'
import { findState, type FilingStatus } from '@/lib/state-tax'

/**
 * What someone owns that the projection does not model, and what selling it
 * would actually cost.
 *
 * The planner tracks four pots, split by how a dollar is taxed on the way out.
 * A rental, a fund position, a stake in a business and a promissory note do
 * not fit that: they are not balances drawn down smoothly, they are lumps of
 * value that arrive on a date. So they live here instead, and the division of
 * labour is the same one the rest of the app uses — the owner supplies the
 * facts, this supplies the tax.
 *
 * Nothing here feeds the projection. That decision is deliberately open, and
 * until it is made this is a net-worth view with the tax worked out, not a
 * source of retirement income.
 */

export type HoldingKind =
  | 'home'
  | 'realEstate'
  | 'syndication'
  | 'personal'
  | 'crypto'
  | 'fund'
  | 'business'
  | 'deposit'
  | 'note'

export const HOLDING_KINDS: { kind: HoldingKind; label: string; hint: string }[] = [
  { kind: 'home', label: 'Home you live in', hint: 'The one you live in' },
  {
    kind: 'realEstate',
    label: 'Rental property',
    hint: 'One you own outright — the deed is in your name',
  },
  {
    kind: 'syndication',
    label: 'Property fund or syndication',
    hint: 'A share of a deal somebody else runs',
  },
  {
    kind: 'personal',
    label: 'Car or belongings',
    hint: 'Vehicles, art, anything worth listing',
  },
  { kind: 'crypto', label: 'Crypto', hint: 'Held long enough to be a long-term gain' },
  { kind: 'fund', label: 'Fund position', hint: 'Venture or private equity' },
  { kind: 'business', label: 'Business equity', hint: 'A stake you expect to sell' },
  {
    kind: 'deposit',
    label: 'CD or savings',
    hint: 'A bank pays it, and reports it every year',
  },
  {
    kind: 'note',
    label: 'Private loan',
    hint: 'Interest when it reaches you, principal at maturity',
  },
]

export interface Holding {
  id: string
  kind: HoldingKind
  name: string
  /** What it is worth today, as the owner reckons it. */
  value: number
  /**
   * What was put in. Zero means unknown, and the whole sale is taxed as gain.
   *
   * Not asked for a deposit or a private loan and not read for either: what
   * was lent and what it is worth are the same figure, so `value` carries it
   * and this is kept equal to it. A note bought at a discount would break
   * that — market discount is ordinary income — and is out of scope here.
   */
  basis: number
  /** Assumed annual change in value until sale. */
  growthPercent: number
  /**
   * The age it is expected to be sold. Null means held indefinitely.
   *
   * Not used by a deposit or a private loan: those mature on a date rather
   * than at an age, and carry `maturityYear` instead. A certificate is bought
   * knowing the year it comes back, and asking for it as an age would make
   * somebody do the subtraction the app can do for them.
   */
  saleAge: number | null
  /** The calendar year it matures. Interest-bearing kinds only. */
  maturityYear?: number | null
  /**
   * Whether this is money the household would actually spend, or a backstop.
   *
   * Today it only splits the two totals at the top of the screen. The label on
   * it promises a reach into the retirement projection that does not exist
   * yet — this screen is the first piece of a household balance sheet, and how
   * the two join up is deliberately still open. Left as it is on purpose:
   * not dead code, and not to be wired to `simulate` without that design.
   */
  counted: boolean

  // Property only
  ownedYears?: number
  landSharePercent?: number
  mortgage?: number
  /** What the mortgage charges. Interest is deductible; principal is not. */
  mortgageRatePercent?: number
  /**
   * Rent by the month, and the costs by the year.
   *
   * Each stored in the period it is thought about in, rather than normalised
   * on the way in. Rent is quoted monthly and the bills arrive annually, so
   * asking for either in the other unit invites a division nobody wanted to
   * do — and storing a converted figure would round what was typed.
   */
  monthlyRent?: number
  /**
   * The three costs separately rather than as one figure.
   *
   * Asked apart because they are looked up apart — a tax bill, a policy and a
   * rule of thumb come from three different places, and a single "costs"
   * box gets a guess where three boxes get three real numbers.
   */
  propertyTax?: number
  insurance?: number
  maintenance?: number
  primaryResidence?: boolean

  // Interest-bearing only
  interestPercent?: number
  /**
   * Whether the interest reaches you each year, or builds up until the end.
   *
   * What that does to the tax depends on who owes it, which is why a bank
   * deposit and a private loan are separate kinds rather than one:
   *
   * - A **deposit** is reported every year on a 1099 whether it is withdrawn
   *   or left to compound. The bank credits it, so it has been received.
   * - A **private loan** is reported when it reaches you. An individual is a
   *   cash-basis taxpayer, so interest that genuinely accrues is not income
   *   until it is paid — and then all of it is income in the year it arrives.
   */
  interestPaidOut?: boolean

  /** Qualified small business stock — §1202. Fund and business stakes only. */
  qsbs?: boolean

  /**
   * A syndication's share of the depreciation, as the K-1 reports it.
   *
   * A limited partner does not own the building and cannot work its
   * depreciation out from a purchase price — the partnership does that and
   * passes down a share. So it is asked for rather than derived, which is also
   * the only figure the investor actually has.
   *
   * It does the same two jobs a rental's depreciation does: shelters the
   * distributions on the way through, and is recaptured on the way out.
   */
  annualDepreciationShare?: number
  /** Cash distributed each year, before any of it is taxed. */
  annualDistribution?: number

  /**
   * They sponsor this deal as well as investing in it.
   *
   * The two roles are not two shades of the same thing. Capital is bought and
   * taxed on what it gains; a promote is earned and taxed under its own rule.
   * A sponsor who files them as one position reports the wrong tax on both.
   */
  sponsors?: boolean
  /**
   * What running the deal pays a year — asset management and the rest.
   *
   * Ordinary income for services, and the depreciation does not touch it. That
   * shelter belongs to the property; a fee is earned by working.
   */
  sponsorFees?: number
  /**
   * What the promote is expected to be worth at exit, in today's money.
   *
   * Asked as one figure rather than modelled from a waterfall. Reproducing one
   * needs the deal's total equity, the preferred return, the catch-up and the
   * hurdle tiers — five guesses that would produce a precise-looking number
   * from no better information than the sponsor's own pro forma, which is
   * where this figure already is.
   *
   * Carried, not bought, so none of it is basis: every dollar is gain.
   */
  promoteAtExit?: number
}

/** Residential rental property, straight line, in years. */
export const DEPRECIATION_YEARS = 27.5
/** Unrecaptured §1250 gain is capped at this rate rather than the ordinary one. */
export const RECAPTURE_RATE = 0.25
/** Net investment income tax, and the MAGI it starts at. */
export const NIIT_RATE = 0.038
export const NIIT_THRESHOLD: Record<FilingStatus, number> = {
  single: 200_000,
  married: 250_000,
}
/** §121, on a home lived in two of the last five years. */
export const HOME_EXCLUSION: Record<FilingStatus, number> = {
  single: 250_000,
  married: 500_000,
}
/** §1202: the greater of this and ten times basis comes out untaxed. */
export const QSBS_FLOOR = 10_000_000
/** What a sale costs to transact, as a share of the price. */
export const SELLING_COST_SHARE = 0.06

/**
 * How the proceeds of a sale divide up, before any rate is applied.
 *
 * Every kind of holding is a different way of filling this in, and one shared
 * step turns it into tax. Keeping the split separate from the rates is what
 * makes each kind testable on its own and stops five copies of the bracket
 * arithmetic appearing.
 */
export interface Decomposition {
  /** Return of capital, an excluded gain — money that is never taxed. */
  untaxed: number
  /** Depreciation taken back, at its own capped rate. */
  recapture: number
  /** Stacks on top of ordinary income at the gains rates. */
  longTermGain: number
  /** Interest and anything else charged at the ordinary rates. */
  ordinary: number
}

const empty = (): Decomposition => ({
  untaxed: 0,
  recapture: 0,
  longTermGain: 0,
  ordinary: 0,
})

/** Anything with a roof: taxed on sale, and costing money to keep meanwhile. */
export const isProperty = (h: Holding) =>
  h.kind === 'home' || h.kind === 'realEstate'

/**
 * A share of a deal rather than a deed.
 *
 * Taxed like property on the way out — depreciation is recaptured at its own
 * capped rate — and reported like a fund on the way in, because a limited
 * partner is handed figures rather than working them out. Neither existing
 * kind fitted: `realEstate` derives depreciation from a purchase price the
 * investor does not have, and `fund` models none at all, which would leave
 * the recapture off an exit entirely.
 */
export const isSyndication = (h: Holding) => h.kind === 'syndication'

/**
 * How long a carried interest must be held to be taxed as a long-term gain.
 *
 * Three years, not the one that applies to everything else here — §1061,
 * added in 2017 to reach exactly this. It is worth deriving rather than
 * asking, because a sponsor who exits early loses the rate on the largest
 * single item in the deal and rarely sees it coming.
 */
export const CARRY_HOLDING_YEARS = 3

/** The promote only, and only on a deal the reader sponsors. */
export const promoteOf = (h: Holding) =>
  isSyndication(h) && h.sponsors ? (h.promoteAtExit ?? 0) : 0

/**
 * Whether the promote clears the three-year test at exit.
 *
 * Counted from when they took the interest to when the deal sells. A holding
 * with no exit date is still being held, so it goes on clearing it.
 */
export function carryIsLongTerm(
  h: Holding,
  currentAge: number,
  thisYear: number,
): boolean {
  const ends = endAgeOf(h, currentAge, thisYear)
  const held =
    (h.ownedYears ?? 0) + (ends !== null ? Math.max(0, ends - currentAge) : 0)
  return held >= CARRY_HOLDING_YEARS
}

/** Carries debt of its own — a mortgage, or a loan against the thing itself. */
export const canCarryDebt = (h: Holding) => isProperty(h) || h.kind === 'personal'

/** A deposit or a private loan: principal back at the end, interest meanwhile. */
export const isInterestBearing = (h: Holding) =>
  h.kind === 'deposit' || h.kind === 'note'

/**
 * The age at which a holding ends, whichever way it was entered.
 *
 * One resolver rather than two paths through every calculation: a maturity
 * year becomes an age here and nothing downstream needs to know which of the
 * two the owner typed.
 */
export function endAgeOf(
  h: Holding,
  currentAge: number,
  thisYear: number,
): number | null {
  if (!isInterestBearing(h)) return h.saleAge
  return h.maturityYear ? currentAge + (h.maturityYear - thisYear) : null
}

/**
 * What a holding is assumed to be worth on the day it ends.
 *
 * Interest-bearing holdings are the exception and have no growth rate of their
 * own: the principal of a note or a certificate does not appreciate. Left to
 * accrue, the interest is what makes the figure rise; paid out, the balance
 * simply sits there until maturity.
 */
export function valueAtSale(
  h: Holding,
  currentAge: number,
  thisYear: number,
): number {
  const ends = endAgeOf(h, currentAge, thisYear)
  if (ends === null) return h.value
  const years = Math.max(0, ends - currentAge)
  if (isInterestBearing(h)) {
    return h.interestPaidOut === false
      ? h.value * Math.pow(1 + (h.interestPercent ?? 0) / 100, years)
      : h.value
  }
  return h.value * Math.pow(1 + h.growthPercent / 100, years)
}

/**
 * Depreciation a rental is assumed to have taken by the time it is sold.
 *
 * Land does not depreciate, so only the building share does — and the total
 * can never exceed the building itself. Claimed or not, it is recaptured on
 * sale: the IRS charges it on what was allowable rather than on what was
 * taken, which is the part that surprises people.
 */
export function accumulatedDepreciation(
  h: Holding,
  currentAge: number,
  thisYear: number,
): number {
  if (isSyndication(h)) {
    // Their share, for as long as they have held it, and deliberately not
    // capped at the capital they put in.
    //
    // Capping there would be right if capital were basis, but a partner's
    // basis also carries their share of the partnership's debt — and property
    // deals are always levered, which is what makes depreciation of this size
    // allowable at all. A $200,000 stake in a deal with $400,000 of debt
    // behind it supports far more depreciation than $200,000, so capping
    // understated the recapture on the way out.
    //
    // It needs no upper bound of its own: `decompose` already takes recapture
    // as the lesser of this and the gain, so it can never exceed what there is
    // to tax.
    const ends = endAgeOf(h, currentAge, thisYear)
    const held =
      (h.ownedYears ?? 0) + (ends !== null ? Math.max(0, ends - currentAge) : 0)
    return (h.annualDepreciationShare ?? 0) * held
  }
  if (h.kind !== 'realEstate' || h.primaryResidence) return 0
  // A rental only. Depreciation is a deduction against rental income, and a
  // home earns none — the fact that a car wears out is not a deduction either.
  const land = (h.landSharePercent ?? 20) / 100
  const building = Math.max(0, h.basis * (1 - land))
  const ends = endAgeOf(h, currentAge, thisYear)
  const held =
    (h.ownedYears ?? 0) + (ends !== null ? Math.max(0, ends - currentAge) : 0)
  return Math.min(building, (building / DEPRECIATION_YEARS) * held)
}

/**
 * The proceeds of a sale, split into what each part is taxed as.
 *
 * A note is the odd one out and worth reading twice: its principal comes back
 * untouched, because getting your own money returned is not income. The
 * interest was taxed along the way, year by year, rather than at the end.
 */
export function decompose(
  h: Holding,
  currentAge: number,
  thisYear: number,
  status: FilingStatus,
): Decomposition {
  const d = empty()
  const gross = valueAtSale(h, currentAge, thisYear)

  if (isInterestBearing(h)) {
    // Getting your own money back is never income, so the principal is
    // untaxed either way. What differs is the interest built up on top.
    d.untaxed = h.value
    const accrued = Math.max(0, valueAtSale(h, currentAge, thisYear) - h.value)

    if (h.kind === 'deposit') {
      // A bank credits it and reports it as it goes, so by the time the
      // certificate matures every dollar of it has already been taxed.
      d.untaxed += accrued
    } else {
      // A private loan reaches a cash-basis lender only when it is paid.
      // Years of interest then land as ordinary income in a single year —
      // which is the part worth seeing, because one year of it can cost a
      // health subsidy or move a Medicare premium two years later.
      d.ordinary = accrued
    }
    return d
  }

  const costs = gross * SELLING_COST_SHARE
  const depreciation = accumulatedDepreciation(h, currentAge, thisYear)
  const adjustedBasis = Math.max(0, h.basis - depreciation)
  const gain = Math.max(0, gross - costs - adjustedBasis)

  d.untaxed = Math.min(adjustedBasis, gross - costs)

  // The promote sits on top of all of it, with no basis to shelter any of it
  // and its own holding test to pass. Kept out of the arithmetic above on
  // purpose: none of the exclusions reach it and the selling costs are already
  // out of it, because a promote is what the waterfall pays after those.
  const promote = promoteOf(h)
  if (promote > 0) {
    if (carryIsLongTerm(h, currentAge, thisYear)) d.longTermGain += promote
    else d.ordinary += promote
  }

  if (gain === 0) return d

  let taxable = gain

  // A home lived in is excluded first, up to the statutory amount.
  if (h.kind === 'home' || (h.kind === 'realEstate' && h.primaryResidence)) {
    const excluded = Math.min(taxable, HOME_EXCLUSION[status])
    d.untaxed += excluded
    taxable -= excluded
  }

  // Qualified small business stock, likewise — and far larger.
  if (h.qsbs && (h.kind === 'fund' || h.kind === 'business')) {
    const cap = Math.max(QSBS_FLOOR, h.basis * 10)
    const excluded = Math.min(taxable, cap)
    d.untaxed += excluded
    taxable -= excluded
  }

  // Depreciation comes back before anything else is treated as gain.
  const recaptured = Math.min(taxable, depreciation)
  d.recapture = recaptured
  // Added to, not assigned. The promote above is already long-term gain when
  // it clears its holding test, and an assignment here would quietly drop it.
  d.longTermGain += taxable - recaptured

  return d
}

export interface RealisationTax {
  recapture: number
  capitalGains: number
  ordinary: number
  niit: number
  state: number
  total: number
}

/**
 * What the split costs, given whatever else is earned that year.
 *
 * Stacked rather than charged in isolation: a gain sits on top of ordinary
 * income, so the same sale costs different amounts to two people. The
 * `otherIncome` figure is what makes the answer honest rather than a headline
 * rate applied to a big number.
 */
export function taxOnRealisation(
  d: Decomposition,
  otherIncome: number,
  status: FilingStatus,
  stateCode: string,
): RealisationTax {
  const schedule = FEDERAL[status]
  const ordinaryBase = otherIncome + d.ordinary

  // Ordinary tax is the difference the sale makes, not the whole bill.
  const ordinary = Math.max(
    0,
    taxOn(ordinaryBase, schedule.brackets, schedule.standardDeduction) -
      taxOn(otherIncome, schedule.brackets, schedule.standardDeduction),
  )

  // Gains stack above ordinary income, so they are charged as the slice
  // between "ordinary alone" and "ordinary plus the gain".
  const gains = CAPITAL_GAINS[status]
  const stacked = (amount: number, floor: number) =>
    Math.max(
      0,
      taxOn(floor + amount, gains, schedule.standardDeduction) -
        taxOn(floor, gains, schedule.standardDeduction),
    )

  const capitalGains = stacked(d.longTermGain, ordinaryBase)
  // Recapture is charged at the ordinary rates but capped at 25%.
  const recaptureAtOrdinary = Math.max(
    0,
    taxOn(
      ordinaryBase + d.recapture,
      schedule.brackets,
      schedule.standardDeduction,
    ) - taxOn(ordinaryBase, schedule.brackets, schedule.standardDeduction),
  )
  const recapture = Math.min(recaptureAtOrdinary, d.recapture * RECAPTURE_RATE)

  // The 3.8% surtax, on the smaller of the investment income and the amount
  // by which the year's income clears the threshold.
  const investment = d.longTermGain + d.recapture
  const magi = ordinaryBase + investment
  const over = Math.max(0, magi - NIIT_THRESHOLD[status])
  const niit = Math.min(investment, over) * NIIT_RATE

  // State tax makes no distinction between a gain and a wage in most places,
  // so the whole realised amount is charged at the state's own brackets.
  const st = findState(stateCode)
  const realised = d.recapture + d.longTermGain + d.ordinary
  const schedules = st?.[status]
  const state = schedules
    ? Math.max(
        0,
        taxOn(otherIncome + realised, schedules.brackets, schedules.standardDeduction) -
          taxOn(otherIncome, schedules.brackets, schedules.standardDeduction),
      )
    : 0

  return {
    recapture,
    capitalGains,
    ordinary,
    niit,
    state,
    total: recapture + capitalGains + ordinary + niit + state,
  }
}

export interface Realisation {
  holding: Holding
  age: number
  gross: number
  sellingCosts: number
  mortgagePayoff: number
  depreciation: number
  decomposition: Decomposition
  tax: RealisationTax
  /** What actually reaches the bank, after costs, the mortgage and the tax. */
  netProceeds: number
}

export function realise(
  h: Holding,
  currentAge: number,
  thisYear: number,
  otherIncome: number,
  status: FilingStatus,
  stateCode: string,
): Realisation | null {
  const ends = endAgeOf(h, currentAge, thisYear)
  if (ends === null) return null
  const capital = valueAtSale(h, currentAge, thisYear)
  // Selling costs come off the capital only. A promote is paid out of the
  // waterfall after the deal has already borne them, so charging it again
  // would take the same 6% twice.
  const sellingCosts = isInterestBearing(h) ? 0 : capital * SELLING_COST_SHARE
  const gross = capital + promoteOf(h)
  const d = decompose(h, currentAge, thisYear, status)
  const tax = taxOnRealisation(d, otherIncome, status, stateCode)
  const mortgagePayoff = canCarryDebt(h) ? (h.mortgage ?? 0) : 0

  return {
    holding: h,
    age: ends,
    gross,
    sellingCosts,
    mortgagePayoff,
    depreciation: accumulatedDepreciation(h, currentAge, thisYear),
    decomposition: d,
    tax,
    netProceeds: Math.max(0, gross - sellingCosts - mortgagePayoff - tax.total),
  }
}

export interface HoldingIncome {
  /** What lands in the account each year, after costs and mortgage interest. */
  cash: number
  /** What the return reports, which for a rental is a good deal less. */
  taxable: number
  /** The gap, which is depreciation doing the sheltering. */
  shelter: number
}

/**
 * What a holding pays while it is still held.
 *
 * Rent and interest are the two that pay anything. The distinction that
 * matters is between the cash and the taxable figure: depreciation shelters a
 * rental so the taxable income is often half the money received — and it is
 * the taxable figure, not the cash, that decides a health subsidy or a
 * Medicare surcharge.
 */
export function annualIncome(h: Holding, currentAge: number): HoldingIncome {
  if (isInterestBearing(h)) {
    const interest = h.value * ((h.interestPercent ?? 0) / 100)
    const received = h.interestPaidOut !== false
    return {
      cash: received ? interest : 0,
      // A bank reports it every year regardless. A private loan is income
      // only once it has been paid.
      taxable: h.kind === 'deposit' || received ? interest : 0,
      shelter: 0,
    }
  }
  if (isSyndication(h)) {
    // Distributions arrive whole and are taxed on what is left after the
    // partnership's depreciation has been applied to them. In the early years
    // of a deal that is often most of it, which is why the cash and the K-1
    // disagree so sharply.
    const distributions = h.annualDistribution ?? 0
    const shelter = Math.min(distributions, h.annualDepreciationShare ?? 0)
    // Fees are for services rather than from the property, so the
    // depreciation cannot reach them. Every dollar is taxed the year it lands.
    const fees = h.sponsors ? (h.sponsorFees ?? 0) : 0
    return {
      cash: distributions + fees,
      taxable: Math.max(0, distributions - shelter) + fees,
      shelter,
    }
  }

  // A home and a car earn nothing. What they cost is real and is reported
  // separately by `annualCosts`, because netting an outgoing against income
  // would show a household with a paid-off house as earning less than one
  // renting.
  if (h.kind !== 'realEstate') return { cash: 0, taxable: 0, shelter: 0 }

  /**
   * Mortgage interest, not the mortgage payment.
   *
   * The interest is a cost and comes off the rental income. The principal
   * repaid alongside it is money moving from one pocket to another — it leaves
   * the account and arrives as equity — so counting it as a cost would report
   * a landlord poorer than they are.
   */
  const interest = (h.mortgage ?? 0) * ((h.mortgageRatePercent ?? 0) / 100)
  const costs =
    (h.propertyTax ?? 0) + (h.insurance ?? 0) + (h.maintenance ?? 0) + interest
  const cash = (h.monthlyRent ?? 0) * 12 - costs
  const land = (h.landSharePercent ?? 20) / 100
  const building = Math.max(0, h.basis * (1 - land))
  const owned = h.ownedYears ?? 0
  // Depreciation runs out after the recovery period, and the shelter with it.
  const shelter =
    h.primaryResidence || owned >= DEPRECIATION_YEARS
      ? 0
      : building / DEPRECIATION_YEARS
  return { cash, taxable: Math.max(0, cash - shelter), shelter }
}

/**
 * What a holding costs to keep for a year, whatever it earns.
 *
 * Separate from income on purpose. A rental nets its costs against its rent
 * and reports the difference; a home and a car have no rent to net against,
 * so their costs are household outgoings and belong on their own line.
 */
export function annualCosts(h: Holding): number {
  if (h.kind === 'home') {
    const interest = (h.mortgage ?? 0) * ((h.mortgageRatePercent ?? 0) / 100)
    return (
      (h.propertyTax ?? 0) + (h.insurance ?? 0) + (h.maintenance ?? 0) + interest
    )
  }
  if (h.kind === 'personal') {
    return (
      (h.insurance ?? 0) +
      (h.maintenance ?? 0) +
      (h.mortgage ?? 0) * ((h.mortgageRatePercent ?? 0) / 100)
    )
  }
  return 0
}

export interface NetWorth {
  /** Everything, at today's values, less what is owed on it. */
  total: number
  /** The part the plan is allowed to count. */
  counted: number
  /** The part held but not counted — a backstop rather than a plan. */
  held: number
  debt: number
}

export function netWorth(holdings: Holding[]): NetWorth {
  let gross = 0
  let debt = 0
  let counted = 0
  for (const h of holdings) {
    const owed = canCarryDebt(h) ? (h.mortgage ?? 0) : 0
    const equity = h.value - owed
    gross += h.value
    debt += owed
    if (h.counted) counted += equity
  }
  const total = gross - debt
  return { total, counted, held: total - counted, debt }
}
