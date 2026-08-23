import type { FilingStatus } from '@/lib/state-tax'
import { withdrawForNeed } from '@/lib/tax'
import { benefitFactor, spouseMonthlyBenefit } from '@/lib/social-security'
import { usesDerivedRates } from '@/lib/state-tax'

export interface PlanInputs {
  currentAge: number
  retirementAge: number
  endAge: number
  /** Taxable brokerage today. Only the gain is taxed, and at gains rates. */
  brokerageBalance: number
  /** How much of that balance is gain rather than what was paid in, as a %. */
  brokerageGainShare: number
  /** 401(k) and traditional IRA: ordinary income on the way out. */
  balance401k: number
  traditionalIraBalance: number
  /** Roth: nothing owed on the way out, so it is drawn last. */
  rothIraBalance: number
  monthlyContribution: number
  preRetirementReturn: number // annual %, e.g. 7
  preRetirementVolatility: number // annual standard deviation of returns, %
  postRetirementReturn: number // annual %, e.g. 4
  postRetirementVolatility: number // annual standard deviation of returns, %
  inflationRate: number // annual %, e.g. 2.5
  monthlyRetirementSpending: number
  /**
   * Spending rarely holds flat for thirty years. Two steps over the base
   * figure cover the shape people actually describe: more in the early years
   * while they are travelling, less once they slow down, often more again late
   * when care arrives.
   *
   * Each step is the monthly figure that applies from that age, in today's
   * dollars, so it reads as the amount someone would actually name. Zero means
   * no step, which is the default — a plan that says nothing here behaves
   * exactly as it did.
   */
  spendingStep1Age: number
  spendingStep1Monthly: number
  spendingStep2Age: number
  spendingStep2Monthly: number // in today's dollars
  socialSecurityMonthly: number // in today's dollars; 0 if none is expected
  socialSecurityAge: number // age the benefit is claimed
  socialSecurityCola: number // annual cost-of-living adjustment, %
  /**
   * The spouse's own benefit at full retirement age, today's dollars; 0 for a
   * spouse with no record of their own, who is then paid the spousal share.
   */
  spouseBenefitMonthly: number
  spouseClaimAge: number
  /** monthly pension in today's dollars; 0 if none */
  pensionMonthly: number
  pensionStartAge: number
  /** pensions often have no adjustment at all, which erodes them badly */
  pensionCola: number
  /** any other monthly income in today's dollars: rental, annuity, part-time */
  otherIncomeMonthly: number
  otherIncomeStartAge: number
  federalTaxRate: number // effective federal % on portfolio withdrawals
  stateTaxRate: number // effective state % on portfolio withdrawals
  taxState: string // two-letter code the rate came from, '' when set by hand
  filingStatus: FilingStatus
}

export interface YearRow {
  age: number
  year: number
  phase: 'accumulation' | 'retirement'
  startBalance: number
  contributions: number
  /**
   * What is actually spent this year: the figure entered, held level in real
   * terms, which means rising with inflation in the dollars of the day. This
   * is what the withdrawal is sized to cover, so the table can show the chain
   * rather than leaving it to be inferred from the other columns.
   */
  spending: number
  /**
   * The same spending in the dollars of that year: what will actually leave
   * the account once inflation has had its way. Carried explicitly rather
   * than as a multiplier, because it is a figure someone wants to read, not
   * a conversion applied to the whole table.
   */
  spendingThatYear: number
  /** Social Security received this year. */
  socialSecurity: number
  /** pension plus any other income received this year */
  otherIncome: number
  /** Gross withdrawal, i.e. including the tax withheld on it. */
  withdrawals: number
  /**
   * Which pot that withdrawal came out of. Kept per year because the answer
   * changes as the pots empty in turn, and the tax changes with it.
   */
  fromBrokerage: number
  fromDeferred: number
  fromRoth: number
  /** End-of-year balance of each pot, in today's dollars like every other. */
  brokerageBalance: number
  deferredBalance: number
  rothBalance: number
  /** Tax paid on this year's withdrawal. */
  taxes: number
  /**
   * That bill split by who levies it, and how much of the benefit was dragged
   * into tax alongside the withdrawal. Carried per year because the tax tab
   * has to explain a stretch from what actually happened in it rather than
   * from a representative year, and the two differ whenever the pots empty in
   * turn: a brokerage dollar is taxed on its gain, a 401(k) dollar in full,
   * and a Roth dollar not at all.
   */
  federalTax: number
  /** The capital-gains half of federalTax, and the gain it was charged on. */
  federalGainsTax: number
  capitalGains: number
  stateTax: number
  taxableSocialSecurity: number
  growth: number
  endBalance: number
}

export interface PlanResult {
  rows: YearRow[]
  balanceAtRetirement: number
  /** annual spending (nominal) in the first year of retirement */
  firstYearRetirementSpending: number
  /** age at which the balance is depleted, or null if it lasts */
  depletionAge: number | null
  /** does the money last through endAge? */
  lastsThroughRetirement: boolean
  /** total contributed over the accumulation phase */
  totalContributions: number
  /** peak balance reached, in today's dollars like everything else */
  peakBalance: number
  /** Social Security received in the first year it is claimed, nominal. */
  firstYearSocialSecurity: number
  /** total Social Security received across retirement, nominal */
  totalSocialSecurity: number
  /** total tax paid on withdrawals across retirement, nominal */
  totalTaxes: number
}

export const DEFAULT_INPUTS: PlanInputs = {
  currentAge: 30,
  retirementAge: 65,
  endAge: 90,
  brokerageBalance: 25000,
  brokerageGainShare: 40,
  balance401k: 100000,
  traditionalIraBalance: 0,
  rothIraBalance: 0,
  monthlyContribution: 800,
  preRetirementReturn: 7,
  // A growth-tilted portfolio; retirees usually hold something steadier.
  preRetirementVolatility: 15,
  // A balanced portfolio, nominal. Both return inputs are nominal, with
  // inflation handled separately — 7% against 2.5% inflation is about 4.4%
  // real, which is roughly what the 4% rule assumes.
  postRetirementReturn: 7,
  postRetirementVolatility: 8,
  inflationRate: 2.5,
  monthlyRetirementSpending: 4000,
  spendingStep1Age: 75,
  spendingStep1Monthly: 0,
  spendingStep2Age: 85,
  spendingStep2Monthly: 0,
  socialSecurityMonthly: 2000,
  // Full retirement age for anyone born in 1960 or later.
  socialSecurityAge: 67,
  // The 2026 adjustment. The past decade has averaged 3.1%.
  socialSecurityCola: 2.8,
  spouseBenefitMonthly: 0,
  spouseClaimAge: 67,
  // Optional, so they default to none rather than to a guess.
  pensionMonthly: 0,
  pensionStartAge: 65,
  // Most private pensions carry no cost-of-living adjustment.
  pensionCola: 0,
  otherIncomeMonthly: 0,
  otherIncomeStartAge: 65,
  // Placeholders only: with no state named these are worked out from the
  // federal brackets as soon as the figures are complete.
  federalTaxRate: 0,
  stateTaxRate: 0,
  taxState: '',
  filingStatus: 'single',
}

/**
 * The three figures we ask the user for rather than assume. They start `null`
 * so the form can render genuinely empty instead of pre-filling invented
 * numbers, and `null` stays distinct from a deliberate `0`.
 */
export const MONEY_FIELDS = [
  'brokerageBalance',
  'balance401k',
  'traditionalIraBalance',
  'rothIraBalance',
  'monthlyContribution',
  'monthlyRetirementSpending',
  'socialSecurityMonthly',
] as const

export type MoneyField = (typeof MONEY_FIELDS)[number]

export type PlanDraft = Omit<PlanInputs, MoneyField> & {
  [K in MoneyField]: number | null
}

/**
 * Sliders keep sensible defaults — they have no meaningful empty state.
 * The money fields are blanked from MONEY_FIELDS itself so the two cannot
 * drift apart when a field is added.
 */
export const EMPTY_DRAFT: PlanDraft = {
  ...DEFAULT_INPUTS,
  ...(Object.fromEntries(MONEY_FIELDS.map((f) => [f, null])) as {
    [K in MoneyField]: null
  }),
}

/**
 * The monthly spending that applies at a given age, in today's dollars.
 *
 * The later step wins where they overlap, so a second step set earlier than
 * the first cannot produce a phase that belongs to neither.
 */
export function monthlySpendingAt(
  inputs: Pick<
    PlanInputs,
    | 'monthlyRetirementSpending'
    | 'spendingStep1Age'
    | 'spendingStep1Monthly'
    | 'spendingStep2Age'
    | 'spendingStep2Monthly'
  >,
  age: number,
): number {
  const steps = [
    { age: inputs.spendingStep1Age, monthly: inputs.spendingStep1Monthly },
    { age: inputs.spendingStep2Age, monthly: inputs.spendingStep2Monthly },
  ]
    .filter((s) => s.monthly > 0)
    .sort((a, b) => a.age - b.age)

  let monthly = inputs.monthlyRetirementSpending
  for (const step of steps) if (age >= step.age) monthly = step.monthly
  return monthly
}

export function toDraft(inputs: PlanInputs): PlanDraft {
  return { ...inputs }
}

/** Returns null until every required figure has been supplied. */
/**
 * The fields a plan genuinely cannot be computed without: what you intend to
 * spend, and something to spend it from.
 *
 * Everything else counts as none when left blank, because none is an honest
 * answer to it. Someone already retired contributes nothing; someone without a
 * taxable account has no brokerage balance; not everyone will draw Social
 * Security. Treating those blanks as unanswered used to blank the whole page —
 * no projection, no tax rates, and none of the notes that explain them — which
 * reads as the tax section being broken rather than as a box left empty.
 */
export function missingRequired(draft: PlanDraft): MoneyField[] {
  const blank = (v: number | null) => v === null || Number.isNaN(v)
  const missing: MoneyField[] = []
  if (blank(draft.monthlyRetirementSpending)) missing.push('monthlyRetirementSpending')
  const balances = [
    draft.brokerageBalance,
    draft.balance401k,
    draft.traditionalIraBalance,
    draft.rothIraBalance,
  ]
  if (balances.every(blank)) missing.push('balance401k')
  return missing
}

export function toPlanInputs(draft: PlanDraft): PlanInputs | null {
  if (missingRequired(draft).length > 0) return null
  const filled = { ...draft }
  for (const field of MONEY_FIELDS) {
    const value = filled[field]
    if (value === null || Number.isNaN(value)) filled[field] = 0 as never
  }
  return filled as PlanInputs
}

/**
 * Runs a year-by-year simulation of the accumulation and drawdown phases.
 *
 * Conventions, all of them standard in retirement projections:
 *
 * Everything returned is in today's dollars. The simulation runs in nominal
 * terms internally — that is how compounding and a fixed monthly contribution
 * actually behave — and each figure is deflated on the way out, so a plan is
 * read on one basis throughout and the numbers entered come back unchanged.
 *
 * - Spending is entered in today's dollars and inflated to nominal terms
 *   inside the loop. Social Security is the amount you would receive today,
 *   at full retirement age, scaled by the claim age: 70% of it at 62, 124% at
 *   70. It arrives worth that in today's money; its
 *   cost-of-living adjustment then applies to each year after. The COLA is
 *   not the inflation rate — 2.8% for 2026 against a 2.5% default here — so
 *   once payments begin the benefit's real value drifts, gaining or losing
 *   purchasing power across a long retirement.
 * - Social Security offsets the spending need; only the shortfall is drawn
 *   from the portfolio.
 * - Tax rates vary by phase, not across the whole retirement. Before the
 *   benefit starts every dollar comes from savings; after it, withdrawals
 *   drop but part of the benefit becomes taxable, and the effective rate can
 *   rise even as the withdrawal falls. A single rate across both is wrong in
 *   both. With a state selected the rates come from that state's brackets per
 *   phase, and federal alone where no state is named; only rates set by hand
 *   are taken as given.
 * - Savings are held as one balance. The brokerage and tax-deferred figures
 *   are summed, and every withdrawal is taxed as ordinary income. In practice
 *   brokerage money is taxed more lightly — only its gains, at capital gains
 *   rates — so a plan leaning on it will read slightly pessimistic.
 * - Withdrawals are grossed up for tax on the whole withdrawal, not just the
 *   shortfall: to spend a net amount N at a combined rate t the portfolio must
 *   give up N / (1 - t), because the money added to cover the tax is itself
 *   taxed. Federal and state rates stack into that single effective rate.
 *   This treats the balance as tax-deferred, the common simplification.
 * - Social Security is left untaxed. In the US up to 85% of it can be taxable
 *   federally, though most states exempt it, so a plan leaning heavily on it
 *   will read slightly optimistic.
 * - Growth is applied to the average of the starting balance and net cash flow
 *   so contributions and withdrawals earn a partial year of return (mid-year
 *   convention).
 */
export function simulate(inputs: PlanInputs): PlanResult {
  const {
    currentAge,
    retirementAge,
    endAge,
    brokerageBalance,
    brokerageGainShare,
    balance401k,
    traditionalIraBalance,
    rothIraBalance,
    monthlyContribution,
    preRetirementReturn,
    postRetirementReturn,
    inflationRate,
    socialSecurityMonthly,
    socialSecurityAge,
    socialSecurityCola,
    spouseBenefitMonthly,
    spouseClaimAge,
    pensionMonthly,
    pensionStartAge,
    pensionCola,
    otherIncomeMonthly,
    otherIncomeStartAge,
    federalTaxRate,
    stateTaxRate,
    taxState,
    filingStatus,
  } = inputs

  const rows: YearRow[] = []
  const thisYear = new Date().getFullYear()
  const infl = inflationRate / 100
  const cola = socialSecurityCola / 100
  // Only the gap between the COLA and inflation moves the benefit in real
  // terms, and only once payments have started.
  const colaDrift = (1 + cola) / (1 + infl)
  // The entered figure is the benefit due at full retirement age; claiming
  // earlier or later scales it permanently.
  const claimFactor = benefitFactor(socialSecurityAge)
  // A pension arrives worth what was entered and then drifts by its own
  // adjustment, exactly as the benefit does. Other income is assumed to keep
  // pace with inflation, so it holds its value.
  const pensionDrift = (1 + pensionCola / 100) / (1 + infl)
  // Rates by age. With a state chosen they come from its brackets for each
  // phase of retirement; otherwise the hand-entered pair applies throughout.
  const guard = (v: number) => Math.min(Math.max(v, 0), 0.95)
  const flatRate = guard((federalTaxRate + stateTaxRate) / 100)
  // Worked per year rather than per phase: when the COLA differs from
  // inflation the benefit's real value moves every year, so the rate does too.
  // Three pots, because the tax on a dollar depends entirely on which one it
  // comes out of. 401(k) and traditional IRA are pooled: they are taxed
  // identically, and separating them in the arithmetic would only pretend to a
  // difference that is not there.
  let brokerage = brokerageBalance
  let deferred = balance401k + traditionalIraBalance
  let roth = rothIraBalance
  const currentSavings = brokerage + deferred + roth
  let balance = currentSavings
  let balanceAtRetirement: number | null = null
  let retirementDeflator = 1
  let depletionAge: number | null = null
  let totalContributions = 0
  let totalSocialSecurity = 0
  let totalTaxes = 0
  let peakBalance = currentSavings
  let firstYearRetirementSpending = 0
  let firstYearSocialSecurity = 0

  const safeRetirementAge = Math.max(retirementAge, currentAge)
  const safeEndAge = Math.max(endAge, safeRetirementAge)

  for (let age = currentAge; age < safeEndAge; age++) {
    const yearsFromNow = age - currentAge
    const isAccumulation = age < safeRetirementAge
    const startBalance = balance

    // The balance carried into the first year of retirement.
    if (age === safeRetirementAge) {
      balanceAtRetirement = startBalance
      retirementDeflator = 1 / Math.pow(1 + infl, yearsFromNow)
    }

    const inflator = Math.pow(1 + infl, yearsFromNow)

    let contributions = 0
    let socialSecurity = 0
    let otherIncome = 0
    let withdrawals = 0
    let taxes = 0
    let federalTax = 0
    let federalGainsTax = 0
    let capitalGains = 0
    let stateTax = 0
    let taxableSocialSecurity = 0
    let fromBrokerage = 0
    let fromDeferred = 0
    let fromRoth = 0
    let rate: number
    const annualSpendingReal = monthlySpendingAt(inputs, age) * 12

    if (isAccumulation) {
      rate = preRetirementReturn / 100
      contributions = monthlyContribution * 12
    } else {
      rate = postRetirementReturn / 100

      const annualSpending = annualSpendingReal * inflator

      // Social Security only once it has been claimed. It arrives worth what
      // was entered, then its own adjustment applies to each year after.
      if (age >= socialSecurityAge) {
        const yearsClaiming = age - socialSecurityAge
        socialSecurity =
          socialSecurityMonthly *
          12 *
          claimFactor *
          inflator *
          Math.pow(colaDrift, yearsClaiming)
      }

      // The spouse, on the same timeline. Their own record pays from their own
      // claim age, but the spousal share cannot start until the worker has
      // filed — so a plan that delays to 70 leaves a non-working spouse with
      // nothing at all until then, which is the cost of waiting that a single
      // benefit never shows.
      // Only a couple has a spousal share to claim. Without this gate a
      // single filer with no spouse would be paid half their own benefit
      // again, since the entitlement is computed from the worker's record.
      if (filingStatus === 'married') {
        const spousalStart = Math.max(spouseClaimAge, socialSecurityAge)
        const { own, paid } = spouseMonthlyBenefit(
          socialSecurityMonthly,
          spouseBenefitMonthly,
          spouseClaimAge,
          spousalStart,
        )
        // A spouse with no record of their own receives nothing until the
        // worker files, so that is when their benefit starts and when its
        // adjustment starts running — dating the drift from a claim age that
        // paid nothing would hand them years of COLA they never collected.
        const start = own > 0 ? spouseClaimAge : spousalStart
        if (age >= start) {
          const monthly = age >= spousalStart ? paid : own
          socialSecurity += monthly * 12 * inflator * Math.pow(colaDrift, age - start)
        }
      }

      // A pension and any other income reduce what savings must cover, and
      // both count as ordinary income for tax.
      if (age >= pensionStartAge) {
        otherIncome +=
          pensionMonthly * 12 * inflator * Math.pow(pensionDrift, age - pensionStartAge)
      }
      if (age >= otherIncomeStartAge) {
        otherIncome += otherIncomeMonthly * 12 * inflator
      }

      const shortfall = Math.max(0, annualSpending - socialSecurity - otherIncome)
      if (usesDerivedRates(taxState)) {
        // Taxable first, then tax-deferred, then Roth, with the tax on each
        // worked out from what it actually is: a gain at gains rates, a
        // 401(k) dollar as ordinary income, a Roth dollar not at all.
        const draw = withdrawForNeed(
          shortfall / inflator,
          socialSecurity / inflator,
          otherIncome / inflator,
          taxState,
          filingStatus,
          {
            brokerage: brokerage / inflator,
            gainShare: brokerageGainShare,
            deferred: deferred / inflator,
            roth: roth / inflator,
          },
        )
        withdrawals = draw.gross * inflator
        federalTax = draw.federalTax * inflator
        federalGainsTax = draw.federalGainsTax * inflator
        capitalGains = draw.capitalGains * inflator
        stateTax = draw.stateTax * inflator
        taxableSocialSecurity = draw.taxableSocialSecurity * inflator
        taxes = federalTax + stateTax
        fromBrokerage = draw.fromBrokerage * inflator
        fromDeferred = draw.fromDeferred * inflator
        fromRoth = draw.fromRoth * inflator
      } else {
        // A rate set by hand is a levy on withdrawals, so it says nothing
        // about which pot they came from. Drawn in the same order all the
        // same, so the balances still move the way they would.
        withdrawals = shortfall / (1 - flatRate)
        taxes = Math.max(0, withdrawals - shortfall)
        // A hand-entered rate is one levy split two ways, so the only honest
        // division is the ratio the two rates were given in.
        const rateSum = federalTaxRate + stateTaxRate
        federalTax = rateSum > 0 ? (taxes * federalTaxRate) / rateSum : taxes
        stateTax = taxes - federalTax
        fromBrokerage = Math.min(withdrawals, brokerage)
        fromDeferred = Math.min(withdrawals - fromBrokerage, deferred)
        fromRoth = Math.min(withdrawals - fromBrokerage - fromDeferred, roth)
      }
    }

    // Contributions go to the tax-deferred pot: for most people that is the
    // payroll 401(k), and it is the pot the money is going into if they have
    // not said otherwise.
    const flows = {
      brokerage: -fromBrokerage,
      deferred: contributions - fromDeferred,
      roth: -fromRoth,
    }
    // Mid-year convention, per pot: half of each pot's own flow grows with it.
    const grow = (bal: number, flow: number) => {
      const base = bal + flow / 2
      return Math.max(0, bal + flow + (base > 0 ? base * rate : 0))
    }
    const growth =
      grow(brokerage, flows.brokerage) +
      grow(deferred, flows.deferred) +
      grow(roth, flows.roth) -
      (brokerage + deferred + roth) -
      (contributions - withdrawals)
    brokerage = grow(brokerage, flows.brokerage)
    deferred = grow(deferred, flows.deferred)
    roth = grow(roth, flows.roth)

    let endBalance = brokerage + deferred + roth

    if (endBalance <= 0) {
      endBalance = 0
      if (depletionAge === null && !isAccumulation) depletionAge = age
    }

    // Deflators back to today's dollars: flows happen during the year, the
    // balance is measured at its end.
    const flowDeflator = 1 / inflator
    const balanceDeflator = 1 / Math.pow(1 + infl, yearsFromNow + 1)
    const realEndBalance = endBalance * balanceDeflator

    rows.push({
      // Labelled by the age you are during the year, so the first retirement
      // row carries the retirement age and the first benefit row carries the
      // claim age. depletionAge is measured the same way.
      age,
      year: thisYear + yearsFromNow,
      phase: isAccumulation ? 'accumulation' : 'retirement',
      // Start-of-year, so it deflates by the start-of-year factor.
      startBalance: startBalance * flowDeflator,
      contributions: contributions * flowDeflator,
      spending: isAccumulation ? 0 : annualSpendingReal,
      spendingThatYear: isAccumulation ? 0 : annualSpendingReal * inflator,
      socialSecurity: socialSecurity * flowDeflator,
      otherIncome: otherIncome * flowDeflator,
      withdrawals: withdrawals * flowDeflator,
      fromBrokerage: fromBrokerage * flowDeflator,
      fromDeferred: fromDeferred * flowDeflator,
      fromRoth: fromRoth * flowDeflator,
      brokerageBalance: brokerage * balanceDeflator,
      deferredBalance: deferred * balanceDeflator,
      rothBalance: roth * balanceDeflator,
      taxes: taxes * flowDeflator,
      federalTax: federalTax * flowDeflator,
      federalGainsTax: federalGainsTax * flowDeflator,
      capitalGains: capitalGains * flowDeflator,
      stateTax: stateTax * flowDeflator,
      taxableSocialSecurity: taxableSocialSecurity * flowDeflator,
      growth: growth * flowDeflator,
      endBalance: realEndBalance,
    })

    totalContributions += contributions * flowDeflator
    totalSocialSecurity += socialSecurity * flowDeflator
    totalTaxes += taxes * flowDeflator
    if (age === safeRetirementAge) firstYearRetirementSpending = annualSpendingReal
    if (socialSecurity > 0 && firstYearSocialSecurity === 0)
      firstYearSocialSecurity = socialSecurity * flowDeflator

    peakBalance = Math.max(peakBalance, realEndBalance)
    balance = endBalance
  }

  return {
    rows,
    // Retiring today means the current balance; a retirement age beyond the
    // horizon never reaches the loop, so fall back to the final balance.
    balanceAtRetirement: (balanceAtRetirement ?? balance) * retirementDeflator,
    firstYearRetirementSpending,
    depletionAge,
    lastsThroughRetirement: depletionAge === null,
    totalContributions,
    peakBalance,
    firstYearSocialSecurity,
    totalSocialSecurity,
    totalTaxes,
  }
}

export function formatCurrency(value: number, opts?: { compact?: boolean }): string {
  if (opts?.compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      // Pinned explicitly: with compact notation and only a maximum set,
      // Node's ICU keeps the trailing zero ($336.0K) while the browser trims
      // it ($336K), which renders as a hydration mismatch.
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}
