import type { Bracket, FilingStatus } from '@/lib/state-tax'
import { findState, scheduleFor } from '@/lib/state-tax'
import { benefitFactor } from '@/lib/social-security'
import type { PlanInputs } from '@/lib/retirement'

/** 2026 federal brackets and standard deductions. */
export const FEDERAL: Record<
  FilingStatus,
  { brackets: Bracket[]; standardDeduction: number }
> = {
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
}

/**
 * 2026 long-term capital gains thresholds, on taxable income.
 *
 * Gains sit on top of ordinary income rather than beside it: the ordinary
 * income fills the lower brackets first, and only what is left of the band
 * holds the gain. A retiree living on a modest income can therefore realise a
 * good deal of gain at nothing at all, which is the whole reason a brokerage
 * balance is worth separating from a 401(k).
 */
export const CAPITAL_GAINS: Record<FilingStatus, Bracket[]> = {
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
}

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
): RateEstimate {
  const state = findState(stateCode)
  const withdrawalsExempt = state?.retirementExempt ?? false
  const schedule = state ? scheduleFor(state, status) : undefined
  const stateBrackets = schedule?.brackets ?? []
  const stateDeduction = schedule?.standardDeduction ?? 0
  const stateTaxesSS = state?.taxesSocialSecurity ?? false
  const fed = FEDERAL[status]

  const netNeed = Math.max(0, spending - benefit - otherIncome)

  const taxesFor = (withdrawal: number) => {
    const ordinary = withdrawal + otherIncome
    const taxableSS = taxableSocialSecurity(benefit, ordinary, status)
    const federalIncome = ordinary + taxableSS
    const federalTax = taxOn(federalIncome, fed.brackets, fed.standardDeduction)
    // A state that exempts retirement withdrawals still taxes a pension and
    // other income, so only the withdrawal is dropped from the base.
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
    stateTaxesSocialSecurity: stateTaxesSS,
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
): number {
  if (gain <= 0) return 0
  const brackets = CAPITAL_GAINS[status]
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
  stateTax: number
  capitalGains: number
  taxableSocialSecurity: number
  /** What the pots could not cover, if they ran dry. */
  unfunded: number
}

/**
 * How to take `need` out of the three pots, and what it costs in tax.
 *
 * Drawn taxable first, then tax-deferred, then Roth. That is the conventional
 * order and it is conventional for a reason: it leaves the sheltered accounts
 * compounding longest, and it spends the pot whose tax is already partly paid
 * before the one where none of it is.
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
): Draw {
  const state = findState(stateCode)
  const withdrawalsExempt = state?.retirementExempt ?? false
  const schedule = scheduleFor(state ?? ({} as never), status)
  const stateBrackets = state ? schedule.brackets : []
  const stateDeduction = state ? schedule.standardDeduction : 0
  const stateTaxesSS = state?.taxesSocialSecurity ?? false
  const fed = FEDERAL[status]
  const gainShare = Math.min(1, Math.max(0, pots.gainShare / 100))

  const priced = (gross: number): Draw => {
    const fromBrokerage = Math.min(gross, Math.max(0, pots.brokerage))
    const fromDeferred = Math.min(gross - fromBrokerage, Math.max(0, pots.deferred))
    const fromRoth = Math.min(
      gross - fromBrokerage - fromDeferred,
      Math.max(0, pots.roth),
    )
    const capitalGains = fromBrokerage * gainShare
    // Roth never shows up here; that is the point of it.
    const ordinary = fromDeferred + otherIncome
    const taxableSS = taxableSocialSecurity(benefit, ordinary + capitalGains, status)
    const ordinaryIncome = ordinary + taxableSS
    const ordinaryTaxable = Math.max(0, ordinaryIncome - fed.standardDeduction)
    const gainsTax = capitalGainsTax(capitalGains, ordinaryTaxable, status)
    const federalTax =
      taxOn(ordinaryIncome, fed.brackets, fed.standardDeduction) + gainsTax
    // States that exempt retirement withdrawals still tax a brokerage gain,
    // and almost all of them tax it as ordinary income rather than at a
    // separate rate.
    const stateIncome =
      (withdrawalsExempt ? 0 : fromDeferred) +
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
      stateTax,
      capitalGains,
      taxableSocialSecurity: taxableSS,
      unfunded: Math.max(0, gross - fromBrokerage - fromDeferred - fromRoth),
    }
  }

  let gross = Math.max(0, need)
  let draw = priced(gross)
  for (let i = 0; i < 40; i++) {
    const next = Math.max(0, need) + draw.federalTax + draw.stateTax
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
        ? `${fundedBy(earlySources)} The 401(k) and IRA money normally costs another 10% on top of the income tax at this age. The projection does not charge it, so these years really cost more than the rate shown.`
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
