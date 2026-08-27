import { describe, expect, it } from 'vitest'
import {
  DEPRECIATION_YEARS,
  annualCosts,
  endAgeOf,
  HOLDING_KINDS,
  HOME_EXCLUSION,
  NIIT_RATE,
  NIIT_THRESHOLD,
  QSBS_FLOOR,
  RECAPTURE_RATE,
  SELLING_COST_SHARE,
  accumulatedDepreciation,
  annualIncome,
  carryIsLongTerm,
  decompose,
  netWorth,
  realise,
  taxOnRealisation,
  valueAtSale,
  type Holding,
} from '@/lib/holdings'
import { blankHolding } from '@/lib/holdings-store'

/**
 * Fixed rather than taken from the clock. A maturity year is measured against
 * the year it is read in, and a test whose answer changes on 1 January is a
 * test that fails at midnight for nobody's benefit.
 */
const YEAR = 2026

const rental = (over: Partial<Holding> = {}): Holding => ({
  id: 'r',
  kind: 'realEstate',
  name: 'Oak St',
  value: 700_000,
  basis: 400_000,
  growthPercent: 3,
  saleAge: 70,
  counted: false,
  ownedYears: 16,
  landSharePercent: 20,
  mortgage: 120_000,
  monthlyRent: 3_000,
  propertyTax: 6_000,
  insurance: 2_000,
  maintenance: 4_000,
  mortgageRatePercent: 0,
  primaryResidence: false,
  ...over,
})

describe('depreciation', () => {
  it('runs on the building only, because land does not depreciate', () => {
    // $400k basis, 20% land -> $320k building over 27.5 years.
    const perYear = (400_000 * 0.8) / DEPRECIATION_YEARS
    const held = 16 + (70 - 60)
    expect(accumulatedDepreciation(rental(), 60, YEAR)).toBeCloseTo(perYear * held, 4)
  })

  it('never exceeds the building it is writing down', () => {
    const old = rental({ ownedYears: 60, saleAge: 70 })
    expect(accumulatedDepreciation(old, 60, YEAR)).toBeCloseTo(400_000 * 0.8, 4)
  })

  it('does not apply to a home somebody lives in', () => {
    expect(accumulatedDepreciation(rental({ primaryResidence: true }), 60, YEAR)).toBe(0)
  })
})

describe('how a sale divides up', () => {
  it('adds back to the proceeds, so nothing is lost or invented', () => {
    const d = decompose(rental(), 60, YEAR, 'married')
    const gross = valueAtSale(rental(), 60, YEAR)
    const parts = d.untaxed + d.recapture + d.longTermGain + d.ordinary
    // Everything except the selling costs is accounted for by one bucket.
    expect(parts).toBeCloseTo(gross * 0.94, 2)
  })

  it('takes the depreciation back before treating anything as gain', () => {
    const d = decompose(rental(), 60, YEAR, 'married')
    expect(d.recapture).toBeCloseTo(accumulatedDepreciation(rental(), 60, YEAR), 4)
    expect(d.longTermGain).toBeGreaterThan(0)
  })

  it('excludes a lived-in home up to the statutory amount', () => {
    const home = rental({ primaryResidence: true, basis: 300_000 })
    const single = decompose(home, 60, YEAR, 'single')
    const married = decompose(home, 60, YEAR, 'married')
    // The couple shelters more, by exactly the difference in the exclusions.
    expect(married.longTermGain).toBeCloseTo(
      Math.max(0, single.longTermGain - (HOME_EXCLUSION.married - HOME_EXCLUSION.single)),
      4,
    )
  })

  it('excludes qualified small business stock, and only where it applies', () => {
    const stake: Holding = {
      id: 'b', kind: 'business', name: 'Co', value: 6_000_000, basis: 50_000,
      growthPercent: 0, saleAge: 62, counted: false, qsbs: true,
    }
    expect(decompose(stake, 60, YEAR, 'single').longTermGain).toBe(0)
    expect(decompose({ ...stake, qsbs: false }, 60, YEAR, 'single').longTermGain).toBeGreaterThan(0)
    // The floor is the greater of $10M and ten times basis.
    expect(QSBS_FLOOR).toBe(10_000_000)
  })

  it('returns a note\u2019s principal untaxed, because it was never income', () => {
    const note: Holding = {
      id: 'n', kind: 'note', name: 'Loan', value: 250_000, basis: 250_000,
      growthPercent: 0, saleAge: 65, counted: false, interestPercent: 7,
    }
    const d = decompose(note, 60, YEAR, 'single')
    expect(d.untaxed).toBe(250_000)
    expect(d.longTermGain).toBe(0)
    expect(d.recapture).toBe(0)
  })
})

describe('what the sale costs', () => {
  it('caps the recapture rate, which is the point of it being its own bucket', () => {
    const d = decompose(rental(), 60, YEAR, 'married')
    const tax = taxOnRealisation(d, 90_000, 'married', 'CA')
    expect(tax.recapture).toBeLessThanOrEqual(d.recapture * RECAPTURE_RATE + 0.5)
    expect(tax.recapture).toBeGreaterThan(0)
  })

  it('charges the surtax only on the amount above the threshold', () => {
    const d = decompose(rental(), 60, YEAR, 'married')
    const investment = d.longTermGain + d.recapture
    const over = 90_000 + investment - NIIT_THRESHOLD.married
    const tax = taxOnRealisation(d, 90_000, 'married', '')
    expect(tax.niit).toBeCloseTo(Math.min(investment, over) * NIIT_RATE, 2)
  })

  it('charges no surtax to a household below the threshold', () => {
    const small: Holding = {
      id: 'c', kind: 'crypto', name: 'BTC', value: 30_000, basis: 20_000,
      growthPercent: 0, saleAge: 65, counted: false,
    }
    const tax = taxOnRealisation(decompose(small, 60, YEAR, 'single'), 20_000, 'single', '')
    expect(tax.niit).toBe(0)
  })

  it('costs more in a state that taxes, and nothing where none is chosen', () => {
    const d = decompose(rental(), 60, YEAR, 'married')
    expect(taxOnRealisation(d, 90_000, 'married', 'CA').state).toBeGreaterThan(0)
    expect(taxOnRealisation(d, 90_000, 'married', '').state).toBe(0)
  })

  it('costs more to somebody who already earns more, because gains stack', () => {
    const d = decompose(rental(), 60, YEAR, 'married')
    const quiet = taxOnRealisation(d, 20_000, 'married', '')
    const busy = taxOnRealisation(d, 400_000, 'married', '')
    expect(busy.total).toBeGreaterThan(quiet.total)
  })
})

describe('what reaches the bank', () => {
  it('takes costs, the mortgage and the tax off the sale price', () => {
    const r = realise(rental(), 60, YEAR, 90_000, 'married', 'CA')!
    expect(r.netProceeds).toBeCloseTo(
      r.gross - r.sellingCosts - r.mortgagePayoff - r.tax.total,
      2,
    )
    // Sanity: a $940k sale does not leave $900k.
    expect(r.netProceeds).toBeLessThan(r.gross * 0.7)
  })

  it('has nothing to report for a holding with no sale planned', () => {
    expect(realise(rental({ saleAge: null }), 60, YEAR, 90_000, 'single', '')).toBeNull()
  })
})

describe('income while it is held', () => {
  it('shelters rent by the depreciation, which is the surprise', () => {
    const i = annualIncome(rental(), 60)
    // 3,000 a month is 36,000 a year, less 6,000 tax, 2,000 insurance and
    // 4,000 maintenance.
    expect(i.cash).toBe(24_000)
    expect(i.shelter).toBeCloseTo((400_000 * 0.8) / DEPRECIATION_YEARS, 4)
    expect(i.taxable).toBeCloseTo(i.cash - i.shelter, 4)
    // It is the taxable figure a subsidy is judged on, so the gap matters.
    expect(i.taxable).toBeLessThan(i.cash * 0.6)
  })

  it('stops sheltering once the recovery period is over', () => {
    expect(annualIncome(rental({ ownedYears: 30 }), 60).taxable).toBe(24_000)
  })

  it('reads rent by the month and the costs by the year', () => {
    // Each stored in the period it is thought about in. Getting this backwards
    // would be a twelve-fold error in the most visible figure on the page.
    expect(annualIncome(rental({ monthlyRent: 1_000 }), 60).cash).toBe(
      12_000 - 12_000,
    )
    expect(annualIncome(rental({ monthlyRent: 2_000 }), 60).cash).toBe(
      24_000 - 12_000,
    )
  })

  it('deducts mortgage interest but not the principal repaid', () => {
    // Interest is a cost. The principal alongside it leaves the account and
    // arrives as equity, so counting it would report the owner poorer.
    const financed = rental({ mortgage: 200_000, mortgageRatePercent: 6 })
    expect(annualIncome(financed, 60).cash).toBe(24_000 - 12_000)
    // And it reduces the taxable figure by the same amount.
    expect(annualIncome(financed, 60).taxable).toBeCloseTo(
      annualIncome(rental(), 60).taxable - 12_000,
      4,
    )
  })

  it('treats note interest as ordinary income in full', () => {
    const note: Holding = {
      id: 'n', kind: 'note', name: 'Loan', value: 200_000, basis: 200_000,
      growthPercent: 0, saleAge: null, counted: false, interestPercent: 6,
    }
    const i = annualIncome(note, 60)
    expect(i.cash).toBe(12_000)
    expect(i.taxable).toBe(12_000)
  })

  it('pays nothing on a stake or a coin', () => {
    expect(annualIncome({ ...rental(), kind: 'crypto' }, 60).cash).toBe(0)
  })
})

describe('net worth', () => {
  it('nets the debt off and keeps counted apart from held', () => {
    const w = netWorth([rental(), rental({ id: 'r2', counted: true, mortgage: 0 })])
    expect(w.debt).toBe(120_000)
    expect(w.total).toBe(700_000 - 120_000 + 700_000)
    expect(w.counted).toBe(700_000)
    // The whole point of the screen having two totals rather than one.
    expect(w.held).toBe(w.total - w.counted)
  })
})

/**
 * The ownership rule, decided 2026-08-26.
 *
 * Liquid balances belong to the planner; illiquid belong here. Neither may
 * hold the other's kind. That is what lets family net worth be a plain sum of
 * the two with no reconciliation step — and the failure it prevents is a
 * net-worth figure that counts every retirement account twice, which is the
 * kind of error nobody spots by reading a total.
 */
describe('the line between this and the planner', () => {
  it('offers no kind that the projection already holds', () => {
    const liquid = ['brokerage', '401k', 'ira', 'roth', 'hsa', 'savings', 'cash']
    for (const k of HOLDING_KINDS) {
      expect(liquid, `${k.kind} belongs to the planner`).not.toContain(k.kind)
      expect(k.label.toLowerCase()).not.toMatch(/401|ira|roth|brokerage|hsa/)
    }
  })

  it('lists exactly the kinds that belong here, and no more', () => {
    // Adding one is a decision about the line, not a detail. `deposit` is the
    // one that bends it: a savings account is liquid, and by the rule alone it
    // would sit on `PlanInputs`. It is here because the projection taxes a
    // brokerage withdrawal as a capital gain, and interest is ordinary income
    // — so putting a certificate there understates the tax by half. The real
    // organising principle is how a thing is taxed, and liquidity is usually
    // the same answer.
    //
    // `syndication` is the other bend. A limited partner holds a share of a
    // deal, not a deed, which by the ownership rule reads like `fund`. It is
    // its own kind because a property partnership passes depreciation down and
    // that depreciation is recaptured on exit — the tax `fund` models none of.
    // Same test, same principle: the kind follows the tax.
    expect(HOLDING_KINDS.map((k) => k.kind).sort()).toEqual([
      'business',
      'crypto',
      'deposit',
      'fund',
      'home',
      'note',
      'personal',
      'realEstate',
      'syndication',
    ])
  })
})

/**
 * A note, a certificate and a private loan behave alike and unlike everything
 * else here: the principal does not appreciate, it matures rather than being
 * sold, and the interest is ordinary income charged as it is earned.
 */
describe('interest-bearing holdings', () => {
  const cd = (over: Partial<Holding> = {}): Holding => ({
    id: 'n',
    kind: 'deposit',
    name: '5-year CD',
    value: 200_000,
    basis: 200_000,
    // Deliberately absurd: a note has no growth rate, and if this ever leaks
    // into the value the figure would be wrong by a factor of four.
    growthPercent: 15,
    saleAge: null,
    // Five years out, which at 60 is the age 65 this used to say.
    maturityYear: YEAR + 5,
    counted: false,
    interestPercent: 5,
    interestPaidOut: true,
    ...over,
  })

  it('ignores the growth rate entirely, because principal does not appreciate', () => {
    expect(valueAtSale(cd(), 60, YEAR)).toBe(200_000)
  })

  it('builds up instead when the interest is left to accrue', () => {
    expect(valueAtSale(cd({ interestPaidOut: false }), 60, YEAR)).toBeCloseTo(
      200_000 * Math.pow(1.05, 5),
      4,
    )
  })

  it('costs nothing to mature — there are no selling costs on a repayment', () => {
    expect(realise(cd(), 60, YEAR, 50_000, 'single', 'CA')!.sellingCosts).toBe(0)
  })
})

/**
 * The rule differs by who owes the interest, which is why a bank deposit and a
 * private loan are separate kinds rather than one with a switch.
 *
 * A bank credits the interest and reports it on a 1099 every year, so it is
 * income whether or not it is withdrawn. An individual lending privately is a
 * cash-basis taxpayer and is taxed when the money arrives — so interest that
 * genuinely accrues is not income until it is paid, and then all of it lands
 * in a single year.
 */
describe('a bank deposit and a private loan are taxed differently', () => {
  const held = (kind: 'deposit' | 'note', paidOut: boolean): Holding => ({
    id: kind,
    kind,
    name: kind,
    value: 200_000,
    basis: 200_000,
    growthPercent: 0,
    saleAge: null,
    maturityYear: YEAR + 5,
    counted: false,
    interestPercent: 5,
    interestPaidOut: paidOut,
    ...({} as Partial<Holding>),
  })

  it('taxes a compounding deposit every year, received or not', () => {
    const i = annualIncome(held('deposit', false), 60)
    expect(i.cash).toBe(0)
    expect(i.taxable).toBe(10_000)
  })

  it('taxes an accruing private loan in no year until it is paid', () => {
    const i = annualIncome(held('note', false), 60)
    expect(i.cash).toBe(0)
    expect(i.taxable).toBe(0)
  })

  it('taxes both the same way when the interest is actually paid out', () => {
    for (const kind of ['deposit', 'note'] as const) {
      const i = annualIncome(held(kind, true), 60)
      expect(i.cash, kind).toBe(10_000)
      expect(i.taxable, kind).toBe(10_000)
    }
  })

  it('owes nothing at maturity on a deposit, because it was taxed on the way', () => {
    const d = decompose(held('deposit', false), 60, YEAR, 'single')
    expect(d.ordinary).toBe(0)
    expect(d.untaxed).toBeCloseTo(valueAtSale(held('deposit', false), 60, YEAR), 4)
  })

  it('lands every year of accrued loan interest in the maturity year', () => {
    // Five years at 5% on $200,000 comes back as $255,256, of which $55,256
    // is ordinary income all at once — a spike big enough to cost a health
    // subsidy before 65 and to move a Medicare premium two years later.
    const loan = held('note', false)
    const d = decompose(loan, 60, YEAR, 'single')
    expect(d.untaxed).toBe(200_000)
    expect(d.ordinary).toBeCloseTo(200_000 * Math.pow(1.05, 5) - 200_000, 4)
    // And it is charged at ordinary rates, not the gains rates.
    const tax = taxOnRealisation(d, 50_000, 'single', '')
    expect(tax.ordinary).toBeGreaterThan(0)
    expect(tax.capitalGains).toBe(0)
  })

  it('charges a paid-out loan nothing at maturity', () => {
    const d = decompose(held('note', true), 60, YEAR, 'single')
    expect(d.ordinary).toBe(0)
    expect(d.untaxed).toBe(200_000)
  })
})

/**
 * For a loan the principal is the basis. Asking twice for the same money gives
 * two boxes that can disagree, and whichever one is read makes the other a
 * silent lie — so only one is asked for, and nothing reads the other.
 */
describe('a loan has one figure, not two', () => {
  const loan = (basis: number): Holding => ({
    id: 'n',
    kind: 'note',
    name: 'Loan',
    value: 200_000,
    // Deliberately inconsistent: nothing should be reading it.
    basis,
    growthPercent: 0,
    saleAge: null,
    maturityYear: YEAR + 5,
    counted: false,
    interestPercent: 5,
    interestPaidOut: true,
  })

  it('ignores the basis entirely, whatever it is set to', () => {
    for (const b of [0, 200_000, 999_999]) {
      expect(decompose(loan(b), 60, YEAR, 'single').untaxed, `basis ${b}`).toBe(200_000)
      expect(decompose(loan(b), 60, YEAR, 'single').longTermGain, `basis ${b}`).toBe(0)
    }
  })

  it('returns the principal untaxed rather than treating it as a gain', () => {
    // The failure this guards against: reading a zero basis as "all of it is
    // profit", which would tax somebody on getting their own money back.
    const d = decompose(loan(0), 60, YEAR, 'single')
    expect(d.untaxed).toBe(200_000)
    expect(taxOnRealisation(d, 50_000, 'single', 'CA').total).toBe(0)
  })

  it('does the same for a bank deposit', () => {
    const d = decompose({ ...loan(0), kind: 'deposit' }, 60, YEAR, 'single')
    expect(d.untaxed).toBe(200_000)
    expect(d.longTermGain).toBe(0)
  })
})

/**
 * A home and the family's belongings: on the balance sheet without being
 * investments. They earn nothing, they cost money to keep, and only one of
 * them is expected to be worth more later.
 */
describe('a home and the things around it', () => {
  const home = (over: Partial<Holding> = {}): Holding => ({
    id: 'h', kind: 'home', name: 'Home', value: 800_000, basis: 300_000,
    growthPercent: 3, saleAge: null, counted: false, mortgage: 250_000,
    mortgageRatePercent: 5, propertyTax: 9_000, insurance: 2_400,
    maintenance: 6_000, ...over,
  })

  const car = (over: Partial<Holding> = {}): Holding => ({
    id: 'c', kind: 'personal', name: 'Car', value: 40_000, basis: 55_000,
    growthPercent: -10, saleAge: null, counted: false, mortgage: 18_000,
    mortgageRatePercent: 6, insurance: 1_800, maintenance: 2_200, ...over,
  })

  it('never depreciates a home, whatever else it looks like', () => {
    // Depreciation is a deduction against rental income and a home earns none.
    // Claiming it would invent a recapture bill on the way out.
    expect(accumulatedDepreciation(home({ saleAge: 75 }), 60, YEAR)).toBe(0)
    expect(decompose(home({ saleAge: 75 }), 60, YEAR, 'married').recapture).toBe(0)
  })

  it('excludes the gain on a home up to the statutory amount', () => {
    const single = decompose(home({ saleAge: 61 }), 60, YEAR, 'single')
    const married = decompose(home({ saleAge: 61 }), 60, YEAR, 'married')
    expect(married.longTermGain).toBeLessThan(single.longTermGain)
  })

  it('reports what a home costs rather than netting it against nothing', () => {
    // Rent has its costs taken off it. A home has no rent, so its costs are
    // household outgoings and belong on their own line — otherwise a family
    // with a paid-off house looks like it earns less than one renting.
    expect(annualIncome(home(), 60).cash).toBe(0)
    expect(annualCosts(home())).toBe(9_000 + 2_400 + 6_000 + 250_000 * 0.05)
  })

  it('lets a car lose value, which is the usual direction', () => {
    expect(valueAtSale(car({ saleAge: 63 }), 60, YEAR)).toBeCloseTo(
      40_000 * Math.pow(0.9, 3), 4,
    )
  })

  it('never turns a loss on belongings into a deduction', () => {
    // A gain on personal property is taxable; a loss is not deductible. The
    // floor at zero keeps a depreciating car from sheltering other income.
    const d = decompose(car({ saleAge: 63 }), 60, YEAR, 'single')
    expect(d.longTermGain).toBe(0)
    expect(taxOnRealisation(d, 80_000, 'single', 'CA').total).toBe(0)
  })

  it('counts debt on both against what the family is worth', () => {
    const w = netWorth([home(), car()])
    expect(w.debt).toBe(250_000 + 18_000)
    expect(w.total).toBe(800_000 + 40_000 - 268_000)
  })
})

/**
 * A certificate matures on a date, not at an age. Entering the year keeps the
 * figure the one written on the paperwork, and the subtraction becomes the
 * app's job rather than the owner's.
 */
describe('maturity is a year, and everything else is an age', () => {
  const cd = (over: Partial<Holding> = {}): Holding => ({
    id: 'd',
    kind: 'deposit',
    name: 'CD',
    value: 100_000,
    basis: 100_000,
    growthPercent: 0,
    saleAge: null,
    maturityYear: YEAR + 4,
    counted: false,
    interestPercent: 5,
    interestPaidOut: false,
    ...over,
  })

  it('turns the year into the age the household will be', () => {
    expect(endAgeOf(cd(), 60, YEAR)).toBe(64)
    expect(endAgeOf(cd(), 45, YEAR)).toBe(49)
    // And it moves as the calendar does: the same paper, read a year later,
    // is a year nearer.
    expect(endAgeOf(cd(), 61, YEAR + 1)).toBe(64)
  })

  it('reads the sale age for everything that is not interest-bearing', () => {
    const house: Holding = { ...cd(), kind: 'realEstate', saleAge: 70, maturityYear: 2099 }
    expect(endAgeOf(house, 60, YEAR)).toBe(70)
  })

  it('has no end for either kind when its own field is blank', () => {
    expect(endAgeOf(cd({ maturityYear: null }), 60, YEAR)).toBeNull()
    expect(endAgeOf({ ...cd(), kind: 'crypto', saleAge: null }, 60, YEAR)).toBeNull()
  })

  it('compounds for exactly the years between now and maturity', () => {
    expect(valueAtSale(cd(), 60, YEAR)).toBeCloseTo(100_000 * Math.pow(1.05, 4), 4)
    // A year later, one year less of it left to run.
    expect(valueAtSale(cd(), 61, YEAR + 1)).toBeCloseTo(100_000 * Math.pow(1.05, 3), 4)
  })

  it('does not grow at all once the year has passed', () => {
    expect(valueAtSale(cd({ maturityYear: YEAR - 2 }), 60, YEAR)).toBe(100_000)
  })
})

describe('a share of a deal, not a deed', () => {
  const lp = (over: Partial<Holding> = {}): Holding => ({
    ...blankHolding('syndication'),
    name: 'Multifamily LP',
    value: 300_000,
    basis: 200_000,
    growthPercent: 0,
    ownedYears: 5,
    annualDistribution: 16_000,
    annualDepreciationShare: 12_000,
    ...over,
  })

  it('taxes only what the K-1 depreciation does not shelter', () => {
    // $16,000 of cash arrives, $12,000 of it sheltered. The gap is the whole
    // reason a syndication feels tax-free while it runs.
    expect(annualIncome(lp(), 55)).toEqual({
      cash: 16_000,
      taxable: 4_000,
      shelter: 12_000,
    })
  })

  it('never shelters more than the cash it is applied to', () => {
    const heavy = lp({ annualDistribution: 5_000, annualDepreciationShare: 12_000 })
    expect(annualIncome(heavy, 55).taxable).toBe(0)
    expect(annualIncome(heavy, 55).shelter).toBe(5_000)
  })

  it('recaptures the passed-through depreciation when the deal exits', () => {
    const d = decompose(lp({ saleAge: 60 }), 55, 2026, 'single')
    // Five years held plus five more to the exit, at $12,000 a year, is
    // $120,000 of basis given back over the whole hold — and it comes back at
    // 25% before any of the rest is treated as a gain.
    expect(d.recapture).toBeCloseTo(120_000, 0)
    expect(d.recapture + d.longTermGain + d.untaxed).toBeCloseTo(
      300_000 * (1 - SELLING_COST_SHARE),
      0,
    )
  })

  it('passes down more depreciation than the capital put in', () => {
    // Thirty years at $12,000 is $360,000 against $200,000 of capital, and
    // that is right rather than an overflow. A partner's basis carries their
    // share of the partnership's debt, and a property deal is always levered
    // — which is what makes depreciation of this size allowable at all.
    const long = lp({ ownedYears: 25, saleAge: 60 })
    expect(accumulatedDepreciation(long, 55, 2026)).toBe(360_000)
    // It still cannot outrun the gain, because recapture is the lesser of the
    // two. That is the bound; the capital never was.
    const d = decompose(long, 55, 2026, 'single')
    expect(d.recapture).toBeLessThanOrEqual(300_000)
  })

  it('is taxed differently from the same money in a rental', () => {
    const shape = { value: 300_000, basis: 200_000, growthPercent: 0, ownedYears: 5, saleAge: 60 }
    const direct = decompose(
      { ...blankHolding('realEstate'), ...shape, name: 'Rental' },
      55,
      2026,
      'single',
    )
    const share = decompose(lp({ saleAge: 60 }), 55, 2026, 'single')
    // A rental derives its depreciation from the building; a share is handed
    // one. Filing them under the same kind would report the wrong tax.
    expect(share.recapture).not.toBeCloseTo(direct.recapture, 0)
  })
})

describe('sponsoring the deal you are also invested in', () => {
  const gp = (over: Partial<Holding> = {}): Holding => ({
    ...blankHolding('syndication'),
    name: 'Deal I run',
    value: 300_000,
    basis: 200_000,
    growthPercent: 0,
    ownedYears: 5,
    annualDistribution: 16_000,
    annualDepreciationShare: 12_000,
    sponsors: true,
    sponsorFees: 40_000,
    promoteAtExit: 250_000,
    saleAge: 60,
    ...over,
  })

  it('does not let the depreciation shelter the fees', () => {
    // The shelter belongs to the property. A fee is earned by working, so it
    // is taxed whole even in a year the distributions are fully sheltered.
    const i = annualIncome(gp({ annualDistribution: 10_000 }), 55)
    expect(i.cash).toBe(50_000)
    expect(i.shelter).toBe(10_000)
    expect(i.taxable).toBe(40_000)
  })

  it('ignores the sponsor figures until they say they sponsor it', () => {
    const passive = gp({ sponsors: false })
    expect(annualIncome(passive, 55).cash).toBe(16_000)
    expect(decompose(passive, 55, 2026, 'single').longTermGain).toBeLessThan(
      decompose(gp(), 55, 2026, 'single').longTermGain,
    )
  })

  it('taxes the promote as a long-term gain once it clears three years', () => {
    const d = decompose(gp(), 55, 2026, 'single')
    expect(carryIsLongTerm(gp(), 55, 2026)).toBe(true)
    expect(d.ordinary).toBe(0)
    // Every dollar of it is gain — a promote is carried, not bought, so none
    // of it is basis to come back untaxed.
    const without = decompose(gp({ promoteAtExit: 0 }), 55, 2026, 'single')
    expect(d.longTermGain - without.longTermGain).toBeCloseTo(250_000, 0)
    expect(d.untaxed).toBeCloseTo(without.untaxed, 0)
  })

  it('taxes the promote as ordinary income on an exit inside three years', () => {
    // §1061. The capital beside it still gets the long-term rate on the same
    // sale — which is the whole reason the two are separate fields.
    const quick = gp({ ownedYears: 0, saleAge: 57 })
    expect(carryIsLongTerm(quick, 55, 2026)).toBe(false)
    const d = decompose(quick, 55, 2026, 'single')
    expect(d.ordinary).toBeCloseTo(250_000, 0)
    expect(d.longTermGain).toBeGreaterThan(0)
  })

  it('costs real money to exit a year early', () => {
    const held = taxOnRealisation(
      decompose(gp({ ownedYears: 2, saleAge: 56 }), 55, 2026, 'single'),
      150_000,
      'single',
      'CA',
    )
    const early = taxOnRealisation(
      decompose(gp({ ownedYears: 1, saleAge: 56 }), 55, 2026, 'single'),
      150_000,
      'single',
      'CA',
    )
    // Same deal, same sale, one year of holding between them — and the rate on
    // the promote changes. This is the finding the three-year test exists for.
    expect(early.total).toBeGreaterThan(held.total)
  })

  it('charges the selling cost on the capital but not on the promote', () => {
    const r = realise(gp(), 55, 2026, 150_000, 'single', 'CA')!
    expect(r.gross).toBeCloseTo(300_000 + 250_000, 0)
    // 6% of the capital alone. A promote is paid out of the waterfall after
    // the deal has already borne those costs.
    expect(r.sellingCosts).toBeCloseTo(300_000 * SELLING_COST_SHARE, 0)
  })

  it('leaves the promote out of net worth, because it is contingent', () => {
    expect(netWorth([gp()])).toEqual(netWorth([gp({ promoteAtExit: 0 })]))
  })

  it('still reports the promote on a deal whose capital merely returns', () => {
    // No gain on the capital at all, and the carry is still income.
    const flat = gp({ value: 200_000, basis: 200_000, annualDepreciationShare: 0 })
    expect(decompose(flat, 55, 2026, 'single').longTermGain).toBeCloseTo(
      250_000,
      0,
    )
  })
})
