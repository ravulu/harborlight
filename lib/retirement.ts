import type { FilingStatus } from '@/lib/state-tax'
import {
  EARLY_WITHDRAWAL_PENALTY_RATE,
  PENALTY_FREE_AGE,
  withdrawForNeed,
} from '@/lib/tax'
import { requiredDistribution, rmdAge } from '@/lib/rmd'
import {
  LOOKBACK_YEARS,
  MEDICARE_AGE,
  annualSurcharge,
  irmaaTableFor,
  magiOf,
} from '@/lib/irmaa'
import { benefitFactor, spouseMonthlyBenefit } from '@/lib/social-security'
import { acaCostFor, acaMagiOf, policyAges } from '@/lib/aca'

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
  /**
   * Pay, and the match terms on it.
   *
   * Only used to work out the employer match, which cannot be computed from a
   * contribution alone: a match is a share of pay up to a limit, so both the
   * pay and the limit have to be known. Zero salary means "not said", and the
   * match is then nothing rather than a guess.
   */
  annualSalary: number
  /** cents matched per dollar contributed, as a percent — 50 or 100 usually */
  employerMatchPercent: number
  /** how much of pay the match applies to, as a percent — often 6 */
  employerMatchLimitPercent: number
  /**
   * The HSA: taxed at neither end when it pays for care, which nothing else
   * is. Held apart from the Roth because it is the pot to spend on the medical
   * costs retirement brings, and because nothing is ever forced out of it.
   */
  hsaBalance: number
  hsaMonthlyContribution: number
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
  /**
   * How health cover is paid for between stopping work and Medicare at 65.
   *
   * Asked rather than priced, because the cost cannot be guessed from the plan
   * but the arrangement can simply be stated. "What does marketplace cover cost
   * you" is a question almost nobody can answer; "will you be on the
   * marketplace" is one almost everybody can.
   *
   * `marketplace` prices each year from that year's own income, subsidy and
   * all. `own` charges what was entered, for a retiree, COBRA or spouse's
   * plan. `none` charges nothing, for cover that costs the household nothing.
   */
  healthCoverBefore65: 'marketplace' | 'own' | 'none'
  /** What that own plan costs a month, today's dollars. Only read for `own`. */
  healthPremiumMonthly: number
  /**
   * Children or others on the household's health plan, by the year they were
   * born.
   *
   * Only marketplace cover reads this, and it moves two things at once: the
   * poverty line the subsidy is means-tested against rises with each person,
   * and so does the premium. A household of four keeps its credit $44,000
   * further up than a couple does, and pays more for the plan it is keeping.
   *
   * Birth years rather than ages, so a saved plan still means the same thing
   * when it is opened again. They come off as they reach 26, each in their own
   * year, which is why this is a list rather than a count.
   */
  dependentBirthYears: number[]
  /**
   * What health care costs a month from 65, on top of Medicare itself.
   *
   * Kept out of the spending figure rather than folded into it, because the
   * spending figure is one number for the whole of retirement and this cost
   * does not start until 65. Someone retiring at 55 who put their Medigap and
   * Part D premiums into their monthly spending was being charged them for ten
   * years before Medicare began — and charged marketplace cover for the same
   * years on top.
   */
  healthAfter65Monthly: number
  socialSecurityMonthly: number // in today's dollars; 0 if none is expected
  socialSecurityAge: number // age the benefit is claimed
  socialSecurityCola: number // annual cost-of-living adjustment, %
  /**
   * The spouse's own benefit at full retirement age, today's dollars; 0 for a
   * spouse with no record of their own, who is then paid the spousal share.
   */
  spouseBenefitMonthly: number
  spouseClaimAge: number
  /**
   * PARKED — carried but not yet acted on. See the note in `simulate`.
   *
   * The age from which the plan would be a household of one. Kept on the type
   * and in the stored schema so that turning the modelling back on is a change
   * to the projection alone, with no migration and no plan needing re-entry.
   */
  survivorFromAge: number
  /** monthly pension in today's dollars; 0 if none */
  pensionMonthly: number
  pensionStartAge: number
  /** pensions often have no adjustment at all, which erodes them badly */
  pensionCola: number
  /** any other monthly income in today's dollars: rental, annuity, part-time */
  otherIncomeMonthly: number
  otherIncomeStartAge: number
  /**
   * What the brackets came to, as a percentage — a readout, not a setting.
   *
   * Recomputed by `withDerivedRates` on every edit and on load, and read by
   * nothing in `simulate`: tax is worked out from the brackets, the state
   * tables and the account a dollar came from. Kept on the plan so the panel
   * and the stored record can show the figure without re-deriving it.
   */
  federalTaxRate: number
  stateTaxRate: number
  taxState: string // two-letter code; '' means no state income tax
  filingStatus: FilingStatus
  /**
   * A Roth conversion schedule: move this much out of the 401(k) and IRA each
   * year between these ages, paying ordinary income tax on it now so that
   * nothing is owed on it later.
   *
   * Optional, and absent from the input form on purpose. Nothing the user
   * enters sets these; `compareConversions` fills them on candidate plans it
   * builds internally, the way `compareClaimAges` varies the claim age. That
   * keeps a conversion a thing the planner suggests rather than a figure
   * someone has to commit to before seeing what it does — and it keeps the
   * stored schema, which has a column per field, untouched.
   */
  conversionAnnual?: number
  conversionFromAge?: number
  conversionToAge?: number
}

export interface YearRow {
  age: number
  year: number
  phase: 'accumulation' | 'retirement'
  startBalance: number
  contributions: number
  /**
   * What the employer added alongside them. Kept apart because it is not your
   * money going in — it is the return on the part of your own that earned it,
   * and no other line in the plan pays 50% in the year it is paid.
   */
  employerMatch: number
  /** Paid into the HSA, and taken out of it. Never taxed either way. */
  hsaContribution: number
  fromHsa: number
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
  /**
   * Gross withdrawal, i.e. including the tax withheld on it. Never more than
   * the pots held: a year the plan cannot fund shows a smaller withdrawal and
   * a shortfall beside it, rather than a draw on an empty account.
   */
  withdrawals: number
  /**
   * What this year's spending needed and the pots could not cover, after tax.
   *
   * Zero on a plan that funds itself, which is every year of most of them.
   * Above zero it is the year the plan failed, and it is carried per year
   * rather than summarised because the size of the gap is the thing worth
   * showing — coming up $2,000 short at 88 is not the same failure as coming
   * up $40,000 short at 72.
   */
  unfunded: number
  /**
   * Which pot that withdrawal came out of. Kept per year because the answer
   * changes as the pots empty in turn, and the tax changes with it.
   */
  fromBrokerage: number
  fromDeferred: number
  fromRoth: number
  /**
   * Moved from the 401(k) and IRA into the Roth this year. Not a withdrawal:
   * the money stays in the plan and the balance does not fall by it. What it
   * costs is the ordinary income tax due on it now, which the withdrawal above
   * has been grossed up to cover.
   */
  conversion: number
  /** End-of-year balance of each pot, in today's dollars like every other. */
  brokerageBalance: number
  deferredBalance: number
  rothBalance: number
  hsaBalance: number
  /**
   * The distribution the law required from the 401(k) and IRA this year, and
   * how much of the withdrawal was left over once the year had been paid for.
   *
   * A required distribution is not sized to what a household needs, so a plan
   * with a large deferred balance and modest spending is pushed into taking —
   * and being taxed on — more than it meant to. `surplus` is what happens to
   * the excess: it has been taxed, so it moves to the brokerage account
   * rather than staying sheltered or disappearing.
   */
  requiredDistribution: number
  surplus: number
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
  /**
   * The 10% additional tax on a deferred withdrawal taken before 59½. Part of
   * federalTax, like federalGainsTax, rather than a charge beside it.
   */
  earlyWithdrawalPenalty: number
  /**
   * The Medicare surcharge this year, on income from two years earlier.
   *
   * Only the amount above the standard premium — the standard premium is an
   * ordinary cost of being 65 and belongs in spending, where the expense
   * estimator already offers it as a line. This is the part that is charged
   * for having had income, and the part a conversion buys.
   *
   * Not a tax: it is a premium, so it is spent rather than withheld, and it
   * sits outside `taxes` and outside `federalTax`. It raises the withdrawal
   * because the year has to fund it.
   */
  irmaaSurcharge: number
  /**
   * Health cover before Medicare, and what a subsidy took off it.
   *
   * Beside the spending rather than inside it, exactly as the Medicare
   * surcharge is: it is a real cost the year has to fund, and burying it in
   * the spending figure would make the figure the user typed disagree with
   * the one the plan charged.
   */
  healthPremium: number
  healthSubsidy: number
  /**
   * Whether this year's income passed 400% of the poverty line and gave up the
   * whole credit.
   *
   * Recorded rather than left to be worked out again downstream. It was worked
   * out again downstream, in `compareConversions`, and the second calculation
   * priced marketplace cover for households that had told us they were covered
   * some other way — because it read the ages and not the setting.
   */
  healthOverCliff: boolean
  /**
   * Modified adjusted gross income this year, as Medicare measures it. Carried
   * because it is what sets the surcharge two years later, and because a
   * reader looking at a surcharge wants to see the income that caused it.
   */
  magi: number
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
  /**
   * What the employer added across the same years, and what a larger
   * contribution would still collect each year and currently does not.
   */
  totalEmployerMatch: number
  matchLeftBehind: number
  /** peak balance reached, in today's dollars like everything else */
  peakBalance: number
  /** Social Security received in the first year it is claimed, nominal. */
  firstYearSocialSecurity: number
  /** total Social Security received across retirement, nominal */
  totalSocialSecurity: number
  /** total tax paid on withdrawals across retirement, nominal */
  totalTaxes: number
  /** total Medicare surcharges across retirement, today's dollars */
  totalIrmaa: number
  /** What health cover before Medicare costs the household, over the plan. */
  totalHealthPremium: number
}

/**
 * How many times a year is re-solved to settle its health premium.
 *
 * Four is far more than a converging year needs — two passes usually agree to
 * the dollar. It exists for the year that will not converge, at the 400%
 * cliff, where the answer steps rather than slides.
 */
const HEALTH_SOLVE_PASSES = 4

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
  // Left at nothing rather than guessed: a match is an arrangement with an
  // employer, and inventing one would put money in a plan nobody is owed.
  annualSalary: 0,
  employerMatchPercent: 0,
  employerMatchLimitPercent: 0,
  hsaBalance: 0,
  hsaMonthlyContribution: 0,
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
  healthCoverBefore65: 'marketplace',
  healthPremiumMonthly: 0,
  dependentBirthYears: [],
  healthAfter65Monthly: 0,
  socialSecurityMonthly: 2000,
  // Full retirement age for anyone born in 1960 or later.
  socialSecurityAge: 67,
  // The 2026 adjustment. The past decade has averaged 3.1%.
  socialSecurityCola: 2.8,
  spouseBenefitMonthly: 0,
  spouseClaimAge: 67,
  // Not assumed. Naming a year is the user's to do.
  survivorFromAge: 0,
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
 *   phase, and federal alone where no state is named. Nothing is taken as
 *   given: the rates on the plan are outputs of this, never inputs to it.
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
/**
 * TODO — survivor benefits are not modelled.
 *
 * When one of a couple dies the survivor keeps the larger of the two Social
 * Security benefits and loses the smaller outright, and from then on files
 * single: half the brackets, half the standard deduction, half the thresholds
 * for the Medicare surcharge. Income falls and the rate charged on it rises,
 * in the same year. On a couple with $3,000 and $1,600 monthly benefits it was
 * worth about $42,000 of extra lifetime tax — the largest single thing that
 * can happen to a married plan.
 *
 * It was built and then taken back out, to be returned to deliberately rather
 * than shipped half-considered. What remains is `PlanInputs.survivorFromAge`
 * and its column in the stored schema, both carried and both ignored, so that
 * turning it on again is a change to this function alone: no migration, and no
 * saved plan needing to be re-entered.
 *
 * The two halves have to arrive together. Cutting the benefit without moving
 * the filing status models a fall in income and misses most of the cost.
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
    healthCoverBefore65,
    healthPremiumMonthly,
    healthAfter65Monthly,
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
    taxState,
    filingStatus,
    // Absent on every stored plan, and on every plan the form produces. Only
    // the candidates `compareConversions` builds ever set them.
    annualSalary,
    employerMatchPercent,
    employerMatchLimitPercent,
    hsaBalance,
    hsaMonthlyContribution,
    conversionAnnual = 0,
    conversionFromAge = 0,
    conversionToAge = 0,
  } = inputs

  const rows: YearRow[] = []
  const thisYear = new Date().getFullYear()
  // Set by birth year, so it is a property of the plan rather than of the age
  // reached in any given row.
  const rmdStart = rmdAge(currentAge, thisYear)
  /**
   * Modified adjusted gross income by age, in today's dollars, so a year can
   * look back two to find the income its Medicare surcharge is charged on.
   *
   * Real rather than nominal because the thresholds are indexed to inflation,
   * exactly as the tax brackets are — comparing a nominal income thirty years
   * out against today's thresholds would put almost every plan in the top tier
   * for no reason but the passage of time.
   *
   * Working years are recorded as nothing, because the projection does not
   * model a salary. For someone who retires at 65 that understates the first
   * two Medicare years, which are charged on the last two years of work.
   */
  const magiByAge = new Map<number, number>()
  /** What the poverty line and the benchmark premium are measured against. */
  const married = inputs.filingStatus === 'married'
  let totalIrmaa = 0
  let totalHealthPremium = 0
  let totalEmployerMatch = 0
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
  // Worked per year rather than per phase: when the COLA differs from
  // inflation the benefit's real value moves every year, so the rate does too.
  // Three pots, because the tax on a dollar depends entirely on which one it
  // comes out of. 401(k) and traditional IRA are pooled: they are taxed
  // identically, and separating them in the arithmetic would only pretend to a
  // difference that is not there.
  let brokerage = brokerageBalance
  let deferred = balance401k + traditionalIraBalance
  let roth = rothIraBalance
  let hsa = hsaBalance
  const currentSavings = brokerage + deferred + roth + hsa

  /**
   * What the employer puts in alongside each year's contribution.
   *
   * A match is a share of pay up to a limit, not a share of whatever you
   * happen to contribute — so contributing past the limit earns nothing more,
   * and contributing under it leaves money behind. Both halves of that are why
   * it needs the salary and the limit rather than the contribution alone.
   */
  const matchable = (annualSalary * employerMatchLimitPercent) / 100
  const employeeAnnual = monthlyContribution * 12
  const employerMatchAnnual =
    (Math.min(employeeAnnual, matchable) * employerMatchPercent) / 100
  /** What a larger contribution would still collect, and currently does not. */
  const matchLeftBehind =
    (Math.max(0, matchable - employeeAnnual) * employerMatchPercent) / 100
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
    let employerMatch = 0
    let hsaContribution = 0
    let fromHsa = 0
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
    let unfunded = 0
    let conversion = 0
    let irmaaSurcharge = 0
    let healthPremium = 0
    let healthSubsidy = 0
    let healthOverCliff = false
    /** Cover that is known rather than worked out: an own plan, or Medicare-side costs. */
    let statedHealth = 0
    let magi = 0
    let required = 0
    let surplus = 0
    let earlyPenalty = 0
    let rate: number
    const annualSpendingReal = monthlySpendingAt(inputs, age) * 12

    if (isAccumulation) {
      rate = preRetirementReturn / 100
      contributions = monthlyContribution * 12
      employerMatch = employerMatchAnnual
      hsaContribution = hsaMonthlyContribution * 12
    } else {
      rate = postRetirementReturn / 100

      const annualSpending = annualSpendingReal * inflator

      // From the year a spouse dies the household is one person: the survivor
      // keeps the larger benefit and files single. Both arrive together, and
      // both cut the same way — which is why a widow's income can fall while
      // the rate charged on it rises.

      // Social Security only once it has been claimed. It arrives worth what
      // was entered, then its own adjustment applies to each year after.
      let ownBenefit = 0
      if (age >= socialSecurityAge) {
        const yearsClaiming = age - socialSecurityAge
        ownBenefit =
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
      let spouseBenefit = 0
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
          spouseBenefit = monthly * 12 * inflator * Math.pow(colaDrift, age - start)
        }
      }

      socialSecurity = ownBenefit + spouseBenefit

      // A pension and any other income reduce what savings must cover, and
      // both count as ordinary income for tax.
      if (age >= pensionStartAge) {
        otherIncome +=
          pensionMonthly * 12 * inflator * Math.pow(pensionDrift, age - pensionStartAge)
      }
      if (age >= otherIncomeStartAge) {
        otherIncome += otherIncomeMonthly * 12 * inflator
      }

      // The surcharge is set by income two years ago, so it is known before
      // this year's withdrawal is solved and adds no circularity: it is simply
      // one more thing the year has to pay for.
      if (age >= MEDICARE_AGE) {
        const lookback = magiByAge.get(age - LOOKBACK_YEARS) ?? 0
        // The table that governs this calendar year, and the income restated
        // in that table's own dollars. Thresholds are indexed to inflation, so
        // a real income tested against a future year's nominal thresholds
        // would look smaller every year for no reason but the passage of time.
        // Beyond the last table entered, the last one is used and its
        // thresholds hold constant in real terms.
        const rowYear = thisYear + yearsFromNow
        const table = irmaaTableFor(rowYear)
        // Two conversions, and they are not the same one. The income has to
        // reach the table in the table's own dollars; the surcharge comes back
        // in those same dollars and has to reach this row in the row's. They
        // cancel only when the table is the row's own year — which is why
        // multiplying by `inflator` here, as this once did, charged the
        // surcharge inflation twice over on every future year.
        const toTableDollars = Math.pow(1 + infl, table.year - thisYear)
        const fromTableDollars = Math.pow(1 + infl, rowYear - table.year)
        irmaaSurcharge =
          annualSurcharge(lookback * toTableDollars, filingStatus, table.year) *
          fromTableDollars
      }

      /**
       * Marketplace cover applies only between stopping work and Medicare.
       * While still working, cover comes with the job; from 65 it is Medicare,
       * whose surcharge is charged above.
       */
      const beforeMedicare = age < MEDICARE_AGE
      const onMarketplace =
        beforeMedicare && healthCoverBefore65 === 'marketplace'
      const ownHealthPremium =
        beforeMedicare && healthCoverBefore65 === 'own'
          ? healthPremiumMonthly * 12 * inflator
          : 0
      /**
       * From 65 the cost is known rather than worked out, so it is simply
       * charged: Medicare's own premiums plus whatever sits on top of them.
       * No settling loop, because nothing here depends on the year's income —
       * the part that does is the surcharge, and that has its own lookback.
       */
      const after65Premium = beforeMedicare
        ? 0
        : healthAfter65Monthly * 12 * inflator
      statedHealth = ownHealthPremium + after65Premium

      /**
       * What the year has to find, before health cover.
       *
       * Cover is the one cost here set by the same year's income — and that
       * income depends on what the year withdraws to pay for the cover. IRMAA
       * escapes the same circle with its two-year lookback; this cannot, so
       * the year is solved more than once and allowed to settle.
       */
      const baseShortfall = Math.max(
        0,
        annualSpending +
          irmaaSurcharge +
          ownHealthPremium +
          after65Premium -
          socialSecurity -
          otherIncome,
      )

      for (let pass = 0; pass < HEALTH_SOLVE_PASSES; pass++) {
        const shortfall = Math.max(0, baseShortfall + healthPremium)

        // Both rules apply whichever way the tax is worked out, so they are
        // decided once, before the branch. The distribution is taken against the
        // balance carried into the year, which is the previous year's closing
        // balance — the figure the rule is written against.
        const rmdThisYear = requiredDistribution(deferred, age, rmdStart)
        const penalised = age < PENALTY_FREE_AGE

        // A conversion cannot be made out of a required distribution — the
        // distribution has to be taken and taxed first, and only what is left
        // may be moved. So the year's schedule is capped at the balance beyond
        // the RMD, and the withdrawal solve below is handed a deferred pot with
        // the converted money already set aside.
        const scheduled =
          conversionAnnual > 0 &&
          age >= conversionFromAge &&
          age <= conversionToAge
            ? conversionAnnual * inflator
            : 0
        conversion = Math.min(scheduled, Math.max(0, deferred - rmdThisYear))

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
            deferred: (deferred - conversion) / inflator,
            // The HSA is untaxed on the way out exactly as the Roth is, so the
            // tax engine has no reason to tell them apart. They go in as one
            // pot and the draw is split below — HSA first, because it is the
            // one earmarked for the medical costs retirement brings, and the
            // one whose advantage is lost if it is never spent on them.
            roth: (roth + hsa) / inflator,
          },
          {
            requiredDeferred: rmdThisYear / inflator,
            earlyPenalty: penalised,
            age,
            conversion: conversion / inflator,
          },
        )
        withdrawals = draw.gross * inflator
        federalTax = draw.federalTax * inflator
        federalGainsTax = draw.federalGainsTax * inflator
        earlyPenalty = draw.earlyWithdrawalPenalty * inflator
        capitalGains = draw.capitalGains * inflator
        stateTax = draw.stateTax * inflator
        taxableSocialSecurity = draw.taxableSocialSecurity * inflator
        taxes = federalTax + stateTax
        fromBrokerage = draw.fromBrokerage * inflator
        fromDeferred = draw.fromDeferred * inflator
        fromRoth = draw.fromRoth * inflator
        fromHsa = Math.min(fromRoth, hsa)
        fromRoth -= fromHsa
        unfunded = draw.unfunded * inflator
        required = draw.requiredDistribution * inflator
        surplus = draw.surplus * inflator

        // Cover is priced off this year's own income, so it can only be known
        // once the year has been solved — and paying for it raises the income
        // it is priced off. Repeat until the figure stops moving.
        if (!onMarketplace) break
        const cost = acaCostFor(
          acaMagiOf({
            fromDeferred: fromDeferred / inflator,
            conversion: conversion / inflator,
            otherIncome: otherIncome / inflator,
            socialSecurity: socialSecurity / inflator,
            capitalGains: capitalGains / inflator,
          }),
          // Who is on the policy this year, not a count fixed at the start of
          // it. Children come off as they turn 26, and both the poverty line
          // and the premium step down with them.
          policyAges(age, married, inputs.dependentBirthYears, thisYear + yearsFromNow),
          // The row's own year, so cover in 2040 is priced on 2040's assumed
          // benchmark rather than on the last published one. Stated in today's
          // dollars like the MAGI above it — `acaTableFor` explains why the
          // poverty line does not move and the premium does.
          thisYear + yearsFromNow,
        )
        const next = cost.net * inflator
        healthSubsidy = cost.subsidy * inflator
        healthOverCliff = cost.overCliff

        /**
         * Stop on the figure the solve above actually funded, never on the one
         * just computed from it.
         *
         * The row has to add up: a year reporting a premium larger than the
         * withdrawal it raised to pay for it is telling the reader something
         * untrue about its own arithmetic, and the year-by-year table would
         * show the difference. Breaking here rather than after the assignment
         * costs at most the settling tolerance and keeps the row coherent.
         */
        if (Math.abs(next - healthPremium) < 0.5) break
        if (pass === HEALTH_SOLVE_PASSES - 1) break

        /**
         * Never revised downward.
         *
         * The sequence only rises — paying for cover raises income, which
         * raises what cover costs — so taking the larger is what the iteration
         * would reach anyway. It also settles the cliff, where the step is not
         * gradual: a household just under 400% of the poverty line that has to
         * withdraw for its premium is pushed over by doing so, and genuinely
         * does lose the whole credit. Rising monotonically means this
         * terminates rather than oscillating across that edge.
         */
        healthPremium = Math.max(healthPremium, next)
      }
    }

    // What this year counted as income, in today's dollars, for the surcharge
    // two years from now to be charged on.
    magi = magiOf({
      fromDeferred: fromDeferred / inflator,
      conversion: conversion / inflator,
      otherIncome: otherIncome / inflator,
      taxableSocialSecurity: taxableSocialSecurity / inflator,
      capitalGains: capitalGains / inflator,
    })
    magiByAge.set(age, magi)

    // Contributions go to the tax-deferred pot: for most people that is the
    // payroll 401(k), and it is the pot the money is going into if they have
    // not said otherwise.
    //
    // A required distribution larger than the year needed leaves cash in hand.
    // It has already been taxed and it may not go back into the account it was
    // forced out of, so it lands in the brokerage — which is also why a plan
    // with big distributions slowly converts a deferred balance into a taxable
    // one, and why the gains rate starts to matter late in such a plan.
    const flows = {
      brokerage: surplus - fromBrokerage,
      hsa: hsaContribution - fromHsa,
      // A conversion leaves the deferred pot and arrives in the Roth. It nets
      // to nothing across the plan, which is why it does not appear in
      // `withdrawals` and does not move the total balance — only the tax it
      // triggers does, and that has already been drawn above.
      deferred: contributions + employerMatch - fromDeferred - conversion,
      roth: -fromRoth + conversion,
    }
    // Mid-year convention, per pot: half of each pot's own flow grows with it.
    const grow = (bal: number, flow: number) => {
      const base = bal + flow / 2
      return Math.max(0, bal + flow + (base > 0 ? base * rate : 0))
    }
    const growth =
      grow(brokerage, flows.brokerage) +
      grow(deferred, flows.deferred) +
      grow(roth, flows.roth) +
      grow(hsa, flows.hsa) -
      (brokerage + deferred + roth + hsa) -
      // The net flow across all three pots. The surplus left the deferred pot
      // inside `withdrawals` and came back into the brokerage, so it nets out
      // of the money that actually left the plan.
      (contributions + employerMatch + hsaContribution - withdrawals + surplus)
    brokerage = grow(brokerage, flows.brokerage)
    deferred = grow(deferred, flows.deferred)
    roth = grow(roth, flows.roth)
    hsa = grow(hsa, flows.hsa)

    let endBalance = brokerage + deferred + roth + hsa

    if (endBalance <= 0) endBalance = 0

    /**
     * Depletion is called from the shortfall, not from the balance.
     *
     * The balance never quite gets there. `grow` credits return on half of
     * each year's outflow, so a pot drawn to nothing is handed a little of it
     * back, and the balance approaches zero across the remaining years
     * without ever crossing it. A test on `endBalance <= 0` therefore never
     * fires, and a plan whose money ran out at 72 reports that it lasted.
     *
     * A year that could not fund its spending is the failure, whatever is
     * left in the account afterwards. That is what `unfunded` records.
     */
    if (unfunded > 0 && depletionAge === null && !isAccumulation) depletionAge = age

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
      employerMatch: employerMatch * flowDeflator,
      hsaContribution: hsaContribution * flowDeflator,
      fromHsa: fromHsa * flowDeflator,
      spending: isAccumulation ? 0 : annualSpendingReal,
      spendingThatYear: isAccumulation ? 0 : annualSpendingReal * inflator,
      socialSecurity: socialSecurity * flowDeflator,
      otherIncome: otherIncome * flowDeflator,
      withdrawals: withdrawals * flowDeflator,
      unfunded: unfunded * flowDeflator,
      fromBrokerage: fromBrokerage * flowDeflator,
      fromDeferred: fromDeferred * flowDeflator,
      fromRoth: fromRoth * flowDeflator,
      conversion: conversion * flowDeflator,
      brokerageBalance: brokerage * balanceDeflator,
      deferredBalance: deferred * balanceDeflator,
      rothBalance: roth * balanceDeflator,
      hsaBalance: hsa * balanceDeflator,
      taxes: taxes * flowDeflator,
      requiredDistribution: required * flowDeflator,
      surplus: surplus * flowDeflator,
      federalTax: federalTax * flowDeflator,
      federalGainsTax: federalGainsTax * flowDeflator,
      earlyWithdrawalPenalty: earlyPenalty * flowDeflator,
      irmaaSurcharge: irmaaSurcharge * flowDeflator,
      healthPremium: (healthPremium + statedHealth) * flowDeflator,
      healthSubsidy: healthSubsidy * flowDeflator,
      healthOverCliff,
      magi,
      capitalGains: capitalGains * flowDeflator,
      stateTax: stateTax * flowDeflator,
      taxableSocialSecurity: taxableSocialSecurity * flowDeflator,
      growth: growth * flowDeflator,
      endBalance: realEndBalance,
    })

    totalContributions += contributions * flowDeflator
    totalEmployerMatch += employerMatch * flowDeflator
    totalSocialSecurity += socialSecurity * flowDeflator
    totalTaxes += taxes * flowDeflator
    totalIrmaa += irmaaSurcharge * flowDeflator
    totalHealthPremium += (healthPremium + statedHealth) * flowDeflator
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
    totalEmployerMatch,
    matchLeftBehind,
    peakBalance,
    firstYearSocialSecurity,
    totalSocialSecurity,
    totalTaxes,
    totalIrmaa,
    totalHealthPremium,
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
