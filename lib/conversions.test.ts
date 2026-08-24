import { describe, expect, it } from 'vitest'
import { compareConversions } from '@/lib/conversions'
import { buildInsights } from '@/lib/insights'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { DEFAULT_INPUTS, type PlanInputs, simulate } from '@/lib/retirement'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  taxState: 'CA',
  ...over,
})

/** A plan with a deferred balance big enough for the question to matter. */
const converter = plan({
  currentAge: 64,
  retirementAge: 65,
  endAge: 90,
  balance401k: 1_200_000,
  brokerageBalance: 400_000,
  rothIraBalance: 0,
  monthlyRetirementSpending: 5_000,
  socialSecurityAge: 70,
})

describe('a conversion in the projection', () => {
  const converted = (annual: number) =>
    simulate({
      ...converter,
      conversionAnnual: annual,
      conversionFromAge: 65,
      conversionToAge: 74,
    })

  it('is absent unless a schedule asks for one', () => {
    const { rows } = simulate(converter)
    expect(rows.every((r) => r.conversion === 0)).toBe(true)
  })

  it('moves money between the pots rather than out of the plan', () => {
    const { rows } = converted(40_000)
    const year = rows.find((r) => r.conversion > 0)!
    // It is not a withdrawal: withdrawals still account for themselves out of
    // the three sources, and the conversion is none of them.
    expect(
      year.fromBrokerage + year.fromDeferred + year.fromRoth,
    ).toBeCloseTo(year.withdrawals, 4)
    expect(year.conversion).toBeGreaterThan(0)
  })

  it('only runs inside the window it was given', () => {
    const { rows } = converted(40_000)
    for (const row of rows) {
      if (row.age < 65 || row.age > 74) {
        expect(row.conversion, `age ${row.age}`).toBe(0)
      }
    }
    expect(rows.filter((r) => r.conversion > 0).length).toBeGreaterThan(0)
  })

  it('fills the Roth and empties the 401(k)', () => {
    const none = converted(0).rows.at(-1)!
    const some = converted(40_000).rows.at(-1)!
    expect(some.rothBalance).toBeGreaterThan(none.rothBalance)
    expect(some.deferredBalance).toBeLessThan(none.deferredBalance)
  })

  it('shrinks the required distributions it was meant to shrink', () => {
    const none = converted(0).rows.find((r) => r.requiredDistribution > 0)!
    const some = converted(40_000).rows.find((r) => r.requiredDistribution > 0)!
    expect(some.requiredDistribution).toBeLessThan(none.requiredDistribution)
  })

  it('is taxed in the year it is made, and the withdrawal covers that tax', () => {
    const year = converted(40_000).rows.find((r) => r.conversion > 0)!
    const same = converted(0).rows.find((r) => r.age === year.age)!
    expect(year.taxes).toBeGreaterThan(same.taxes)
    // Spending is still met in full: the extra tax was drawn for, not
    // subtracted from what the household had to live on.
    expect(year.withdrawals - year.taxes).toBeCloseTo(year.spending, 0)
  })

  it('never converts more than the account holds beyond its distribution', () => {
    const { rows } = simulate({
      ...converter,
      conversionAnnual: 5_000_000,
      conversionFromAge: 65,
      conversionToAge: 74,
    })
    for (const row of rows) {
      expect(row.conversion, `age ${row.age}`).toBeLessThanOrEqual(
        row.startBalance + 1e-6,
      )
      expect(row.deferredBalance, `age ${row.age}`).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('holds every per-row invariant it held before', () => {
    for (const row of converted(40_000).rows) {
      expect(row.federalTax + row.stateTax).toBeCloseTo(row.taxes, 6)
      expect(
        row.brokerageBalance + row.deferredBalance + row.rothBalance,
      ).toBeCloseTo(row.endBalance, 4)
      expect(Number.isFinite(row.conversion)).toBe(true)
    }
  })
})

describe('compareConversions', () => {
  it('offers nothing when there is too little in the 401(k)', () => {
    expect(compareConversions(plan({ balance401k: 50_000 }))).toBeNull()
  })

  it('offers nothing once distributions have already started', () => {
    expect(
      compareConversions(plan({ currentAge: 76, retirementAge: 76, balance401k: 800_000 })),
    ).toBeNull()
  })

  it('opens the window at retirement and closes it before the first RMD', () => {
    const c = compareConversions(converter)!
    expect(c.fromAge).toBe(65)
    // Born 1962, so distributions begin at 75 and the window ends at 74.
    expect(c.toAge).toBe(74)
  })

  it('finds an amount that costs less than doing nothing', () => {
    const c = compareConversions(converter)!
    expect(c.none.annual).toBe(0)
    expect(c.best.annual).toBeGreaterThan(0)
    expect(c.best.lifetimeCost).toBeLessThan(c.none.lifetimeCost)
    expect(c.taxSaving).toBeCloseTo(c.none.lifetimeTax - c.best.lifetimeTax, 6)
    expect(c.irmaaSaving).toBeCloseTo(c.none.lifetimeIrmaa - c.best.lifetimeIrmaa, 6)
    expect(c.worthwhile).toBe(true)
  })

  it('counts the Medicare surcharge, not tax alone', () => {
    const c = compareConversions(converter)!
    for (const o of c.options) {
      expect(o.lifetimeCost).toBeCloseTo(o.lifetimeTax + o.lifetimeIrmaa, 6)
    }
    // Ranking on tax alone could pick an amount that quietly bought a
    // surcharge two years later. The winner is the cheapest all in.
    for (const o of c.options) {
      expect(o.lifetimeCost).toBeGreaterThanOrEqual(c.best.lifetimeCost - 1e-6)
    }
  })

  it('lowers the surcharge as well as the tax, at the amount it picks', () => {
    const c = compareConversions(converter)!
    // Smaller distributions later mean less income later, so a sensible
    // conversion buys its way out of the surcharge rather than into it.
    expect(c.best.lifetimeIrmaa).toBeLessThan(c.none.lifetimeIrmaa)
    expect(c.irmaaSaving).toBeGreaterThan(0)
  })

  it('shows a large conversion buying a surcharge of its own', () => {
    const c = compareConversions(converter)!
    // Converting the lot crosses thresholds in the conversion years
    // themselves, which is the cost the tax column alone cannot show.
    expect(c.everything.lifetimeIrmaa).toBeGreaterThan(c.best.lifetimeIrmaa)
  })

  it('picks the turn in the curve, not the largest amount', () => {
    const c = compareConversions(converter)!
    // It found somewhere that converting has gone too far, which is the whole
    // reason not to say "convert as much as you can". Measured all in: an
    // amount can still be saving tax while costing more overall.
    expect(c.excessive).not.toBeNull()
    expect(c.excessive!.annual).toBeGreaterThan(c.best.annual)
    expect(c.excessive!.lifetimeCost).toBeGreaterThan(c.none.lifetimeCost)
  })

  it('offers converting the whole account as a choice of its own', () => {
    const c = compareConversions(converter)!
    expect(c.everything.drainsPot).toBe(true)
    // Nothing is left to force out. Not exactly zero: an emptied account keeps
    // a fraction of a cent from the mid-year growth convention, so the test is
    // the same sub-dollar one the table uses to print "nothing".
    expect(c.everything.firstRmd).toBeLessThan(1)
    // Nothing is left sheltered to be forced out later, and nearly everything
    // that survives is Roth.
    expect(c.everything.endingRothShare).toBeGreaterThan(0.9)
    // It appears in the ladder rather than only in the summary.
    expect(c.options.some((o) => o.drainsPot)).toBe(true)
  })

  it('shows a ladder that rises, with nothing first and everything last', () => {
    const c = compareConversions(converter)!
    expect(c.options.length).toBeGreaterThanOrEqual(4)
    expect(c.options[0].annual).toBe(0)
    expect(c.options.at(-1)!.drainsPot).toBe(true)
    for (let i = 1; i < c.options.length; i++) {
      expect(c.options[i].annual).toBeGreaterThan(c.options[i - 1].annual)
    }
    // Every row carries its own confidence, not a placeholder.
    for (const o of c.options) expect(o.confidence).toBeGreaterThan(0)
  })

  it('shows amounts between nothing and the best, so the fall is visible', () => {
    const c = compareConversions(converter)!
    const between = c.options.filter((o) => o.annual > 0 && o.annual < c.best.annual)
    expect(between.length).toBeGreaterThan(0)
    // Each step toward the best costs less than doing nothing.
    for (const o of between) {
      expect(o.lifetimeCost).toBeLessThan(c.none.lifetimeCost)
    }
  })

  it('reports the reduction in the first required distribution', () => {
    const c = compareConversions(converter)!
    expect(c.rmdReduction).toBeGreaterThan(0)
    expect(c.rmdReduction).toBeCloseTo(c.none.firstRmd - c.best.firstRmd, 6)
  })

  it('leaves the plan it was given untouched', () => {
    const before = JSON.stringify(converter)
    compareConversions(converter)
    expect(JSON.stringify(converter)).toBe(before)
    // And the plan the rest of the page runs on still converts nothing.
    expect(simulate(converter).rows.every((r) => r.conversion === 0)).toBe(true)
  })

  /**
   * The caveat the competitive note calls the one correctness risk: a
   * conversion before 65 is ordinary income that an ACA subsidy is
   * means-tested against, and the projection does not model health cover. It
   * cannot price that, but it must not stay silent about it.
   */
  it('flags a window that opens before Medicare', () => {
    const early = compareConversions(
      plan({
        currentAge: 61,
        retirementAge: 62,
        endAge: 90,
        balance401k: 900_000,
        brokerageBalance: 300_000,
        monthlyRetirementSpending: 4_500,
      }),
    )!
    expect(early.fromAge).toBe(62)
    expect(early.beforeMedicare).toBe(true)
  })

  it('does not flag one that opens at 65 or later', () => {
    expect(compareConversions(converter)!.beforeMedicare).toBe(false)
  })
})

/**
 * The two places the planner talks about conversions must not disagree.
 *
 * The insight card used to quote the room below the 22% bracket in the first
 * retirement year — a different and worse figure than the tax tab solves for,
 * because it fits one year rather than the plan. On a $1.2m balance the card
 * said $50,400 while the table said $40,000, and a reader had no way to know
 * which to believe.
 */
describe('the insight card and the tax tab agree', () => {
  const cardFor = (inputs: PlanInputs) => {
    const conversions = compareConversions(inputs)
    const card = buildInsights(
      inputs,
      simulate(inputs),
      runMonteCarlo(inputs, 400),
      conversions,
    ).find((i) => i.key === 'conversion')
    return { conversions, card }
  }

  it('quotes the same amount as the table', () => {
    const { conversions, card } = cardFor(converter)
    expect(card).toBeDefined()
    const quoted = card!.body.match(/Moving \$([\d,]+) a year/)?.[1]
    expect(quoted).toBeDefined()
    expect(Number(quoted!.replace(/,/g, ''))).toBe(conversions!.best.annual)
  })

  it('shows no card at all when the caller has no comparison to give it', () => {
    // The old version worked the figure out itself, which is how the two came
    // to differ. It cannot any more: with nothing passed in there is nothing
    // to say.
    const card = buildInsights(
      converter,
      simulate(converter),
      runMonteCarlo(converter, 400),
    ).find((i) => i.key === 'conversion')
    expect(card).toBeUndefined()
  })

  it('stays silent when converting does not pay', () => {
    const inputs = plan({ currentAge: 64, retirementAge: 65, balance401k: 120_000 })
    const { conversions, card } = cardFor(inputs)
    if (conversions && !conversions.worthwhile) expect(card).toBeUndefined()
  })

  it('carries the health-cover caution when the window opens before 65', () => {
    const early = plan({
      currentAge: 61,
      retirementAge: 62,
      endAge: 90,
      balance401k: 900_000,
      brokerageBalance: 300_000,
      monthlyRetirementSpending: 4_500,
    })
    const { conversions, card } = cardFor(early)
    expect(conversions!.beforeMedicare).toBe(true)
    expect(card!.body).toMatch(/before Medicare does/)
    expect(card!.body).toMatch(/ACA premiums/)
    expect(card!.body).toMatch(/four times the poverty line/)
    expect(card!.body).toMatch(/means-tested/)

    // And does not carry it when the window opens at 65 or later. Every card
    // now mentions Medicare, because every card prices the surcharge — so the
    // test is on the health-cover paragraph specifically.
    const later = cardFor(converter).card!.body
    expect(later).not.toMatch(/before Medicare does/)
    expect(later).not.toMatch(/poverty line/)
  })
})

/**
 * Health cover in the ladder.
 *
 * The gap the competitive note called the one correctness risk: recommending a
 * conversion sized on tax alone, to someone whose subsidy it would destroy.
 */
describe('the ACA premiums column', () => {
  const early = plan({
    currentAge: 61,
    retirementAge: 62,
    endAge: 90,
    balance401k: 900_000,
    brokerageBalance: 300_000,
    monthlyRetirementSpending: 4_500,
  })

  it('costs nothing for a plan that retires straight onto Medicare', () => {
    const c = compareConversions(converter)!
    expect(c.beforeMedicare).toBe(false)
    for (const o of c.options) {
      expect(o.lifetimeAca, `${o.annual}`).toBe(0)
      expect(o.crossesCliff, `${o.annual}`).toBe(false)
    }
    expect(c.acaSaving).toBe(0)
  })

  it('costs something for every plan that retires before 65', () => {
    const c = compareConversions(early)!
    expect(c.beforeMedicare).toBe(true)
    for (const o of c.options) {
      expect(o.lifetimeAca, `${o.annual}`).toBeGreaterThan(0)
    }
  })

  it('rises with the amount converted, because the subsidy is means-tested', () => {
    const c = compareConversions(early)!
    const under = c.options.filter((o) => !o.crossesCliff)
    for (let i = 1; i < under.length; i++) {
      expect(under[i].lifetimeAca).toBeGreaterThan(under[i - 1].lifetimeAca)
    }
  })

  it('marks the amounts that lose the subsidy outright', () => {
    const c = compareConversions(early)!
    expect(c.cliffRows.length).toBeGreaterThan(0)
    for (const o of c.cliffRows) expect(o.crossesCliff).toBe(true)
    // Crossing costs far more than the taper that led up to it.
    const worst = c.cliffRows.reduce((a, o) => (o.lifetimeAca > a.lifetimeAca ? o : a))
    expect(worst.lifetimeAca).toBeGreaterThan(c.none.lifetimeAca * 5)
  })

  it('splits the benchmark price into what you pay and what is subsidised', () => {
    // The column shows the first; the line under it shows the second. Together
    // they are the whole price of the plan, which is what makes the label
    // honest — it is a cost, not a benefit, and it belongs in the all-in total.
    const c = compareConversions(early)!
    for (const o of c.options) {
      expect(o.lifetimeAcaSubsidy, `${o.annual}`).toBeGreaterThanOrEqual(0)
      if (o.crossesCliff) continue
      // More converted means more income, so a smaller subsidy and a bigger bill.
      expect(o.lifetimeAcaSubsidy, `${o.annual}`).toBeGreaterThan(0)
    }
    const ordered = c.options.filter((o) => !o.crossesCliff)
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].lifetimeAcaSubsidy).toBeLessThan(
        ordered[i - 1].lifetimeAcaSubsidy,
      )
    }
  })

  it('counts it in the all-in cost the winner is chosen on', () => {
    const c = compareConversions(early)!
    for (const o of c.options) {
      expect(o.lifetimeCost).toBeCloseTo(
        o.lifetimeTax + o.lifetimeIrmaa + o.lifetimeAca,
        6,
      )
      expect(o.lifetimeCost).toBeGreaterThanOrEqual(c.best.lifetimeCost - 1e-6)
    }
  })

  it('never picks an amount that crosses the cliff', () => {
    // The point of the whole exercise: the recommendation cannot be one that
    // destroys the subsidy, because the subsidy is now in the arithmetic.
    const c = compareConversions(early)!
    expect(c.best.crossesCliff).toBe(false)
  })

  it('reports what crossing would cost for a year, and who it is measured for', () => {
    const c = compareConversions(early)!
    expect(c.householdSize).toBe(1)
    expect(c.cliffCost).toBeGreaterThan(5_000)

    const couple = compareConversions(plan({ ...early, filingStatus: 'married' }))!
    expect(couple.householdSize).toBe(2)
    // Two policies rather than one.
    expect(couple.cliffCost).toBeCloseTo(c.cliffCost * 2, 0)
  })
})

/**
 * Yearly figures for the two costs that are premiums rather than tax.
 *
 * A lifetime total is the wrong unit for a premium: three years of marketplace
 * cover and twenty years of Medicare surcharge read as wildly different
 * numbers when added up, and as directly comparable ones when they are not.
 */
describe('per-year premium figures', () => {
  const early = plan({
    currentAge: 61,
    retirementAge: 62,
    endAge: 90,
    balance401k: 900_000,
    brokerageBalance: 300_000,
    monthlyRetirementSpending: 4_500,
  })

  it('averages the surcharge over the years it is actually charged', () => {
    const c = compareConversions(converter)!
    for (const o of c.options) {
      if (o.irmaaYears === 0) {
        expect(o.irmaaPerYear, `${o.annual}`).toBe(0)
        expect(o.lifetimeIrmaa, `${o.annual}`).toBeLessThan(1)
        continue
      }
      expect(o.irmaaPerYear, `${o.annual}`).toBeCloseTo(
        o.lifetimeIrmaa / o.irmaaYears,
        6,
      )
      // Not divided by the whole plan, which would bury a real cost under
      // years that never see it.
      expect(o.irmaaYears).toBeLessThan(40)
    }
  })

  it('averages the premium over the years cover has to be bought', () => {
    const c = compareConversions(early)!
    for (const o of c.options) {
      expect(o.acaYears, `${o.annual}`).toBe(c.fromAge < 65 ? 65 - c.fromAge : 0)
      expect(o.acaPerYear, `${o.annual}`).toBeCloseTo(o.lifetimeAca / o.acaYears, 6)
      expect(o.acaSubsidyPerYear, `${o.annual}`).toBeCloseTo(
        o.lifetimeAcaSubsidy / o.acaYears,
        6,
      )
    }
  })

  it('has no years of cover to average when Medicare starts at retirement', () => {
    const c = compareConversions(converter)!
    for (const o of c.options) {
      expect(o.acaYears, `${o.annual}`).toBe(0)
      expect(o.acaPerYear, `${o.annual}`).toBe(0)
    }
  })

  it('counts how many years lose the subsidy, not merely whether any did', () => {
    const c = compareConversions(early)!
    for (const o of c.options) {
      expect(o.acaCliffYears, `${o.annual}`).toBeLessThanOrEqual(o.acaYears)
      expect(o.crossesCliff, `${o.annual}`).toBe(o.acaCliffYears > 0)
    }
    // The row that empties the account crosses in the years it converts and is
    // subsidised in the rest — saying flatly that it has no subsidy would be
    // describing a different plan.
    const drained = c.options.find((o) => o.drainsPot)!
    if (drained.crossesCliff) {
      expect(drained.acaCliffYears).toBeLessThan(drained.acaYears)
      expect(drained.lifetimeAcaSubsidy).toBeGreaterThan(0)
    }
  })

  it('keeps the yearly figure a plausible premium rather than a lifetime one', () => {
    // The whole point of the change: these read as an insurance bill.
    const c = compareConversions(early)!
    for (const o of c.options) {
      expect(o.acaPerYear, `${o.annual}`).toBeLessThan(60_000)
    }
    expect(c.none.acaPerYear).toBeLessThan(c.best.acaPerYear)
  })
})
