import { describe, expect, it, afterEach, vi } from 'vitest'
import { buildInsights } from '@/lib/insights'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { DEFAULT_INPUTS, type PlanInputs, simulate } from '@/lib/retirement'
import {
  IRMAA_TABLES,
  IRMAA_TIERS,
  IRMAA_YEARS,
  ASSUMED_INDEXATION,
  ASSUMED_PREMIUM_GROWTH,
  currentIrmaaYear,
  irmaaTableFor,
  IRMAA_YEAR,
  LOOKBACK_YEARS,
  MEDICARE_AGE,
  STANDARD_PART_B_MONTHLY,
  annualSurcharge,
  irmaaTierFor,
  magiOf,
  monthlySurcharge,
  roomBelowNextTier,
} from '@/lib/irmaa'

/**
 * The published 2026 figures, written out as the total Part B premium a person
 * is actually billed rather than as the surcharge the module stores. Pinned in
 * this form on purpose: it is the number a reader can check against their own
 * Medicare letter, and it catches an error in the subtraction the table was
 * built with.
 */
const PUBLISHED_PART_B_TOTAL = [202.9, 284.1, 405.8, 527.5, 649.2, 689.9]
const PUBLISHED_PART_D = [0, 14.5, 37.5, 60.4, 83.3, 91.0]

describe('the 2026 tier table', () => {
  it('reconstructs the published Part B premiums', () => {
    IRMAA_TIERS.single.forEach((tier, i) => {
      expect(tier.partB + STANDARD_PART_B_MONTHLY, `tier ${i}`).toBeCloseTo(
        PUBLISHED_PART_B_TOTAL[i],
        2,
      )
    })
  })

  it('carries the published Part D surcharges', () => {
    IRMAA_TIERS.single.forEach((tier, i) => {
      expect(tier.partD, `tier ${i}`).toBeCloseTo(PUBLISHED_PART_D[i], 2)
    })
  })

  it('charges a married couple at the same amounts, on doubled thresholds', () => {
    IRMAA_TIERS.married.forEach((tier, i) => {
      expect(tier.partB, `tier ${i} part B`).toBe(IRMAA_TIERS.single[i].partB)
      expect(tier.partD, `tier ${i} part D`).toBe(IRMAA_TIERS.single[i].partD)
    })
    // Every threshold is twice the single one, except the top, where the law
    // uses $750,000 rather than the $1,000,000 doubling would give.
    for (let i = 1; i < 5; i++) {
      expect(IRMAA_TIERS.married[i].from, `tier ${i}`).toBe(
        IRMAA_TIERS.single[i].from * 2 - 1,
      )
    }
    expect(IRMAA_TIERS.married[5].from).toBe(750_000)
    expect(IRMAA_TIERS.single[5].from).toBe(500_000)
  })

  it('rises with every step and starts at nothing', () => {
    for (const status of ['single', 'married'] as const) {
      const tiers = IRMAA_TIERS[status]
      expect(tiers[0].partB).toBe(0)
      expect(tiers[0].partD).toBe(0)
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].from, `${status} ${i}`).toBeGreaterThan(tiers[i - 1].from)
        expect(tiers[i].partB, `${status} ${i}`).toBeGreaterThan(tiers[i - 1].partB)
        expect(tiers[i].partD, `${status} ${i}`).toBeGreaterThan(tiers[i - 1].partD)
      }
    }
  })

  it('looks back exactly two years, from 65', () => {
    expect(LOOKBACK_YEARS).toBe(2)
    expect(MEDICARE_AGE).toBe(65)
  })
})

describe('irmaaTierFor', () => {
  it('puts a household under the first threshold in the standard tier', () => {
    expect(irmaaTierFor(0, 'single')).toBe(0)
    expect(irmaaTierFor(109_000, 'single')).toBe(0)
    expect(irmaaTierFor(218_000, 'married')).toBe(0)
  })

  it('is a cliff: one dollar over moves the whole premium', () => {
    expect(irmaaTierFor(109_000, 'single')).toBe(0)
    expect(irmaaTierFor(109_001, 'single')).toBe(1)
    expect(monthlySurcharge(109_000, 'single')).toBe(0)
    expect(monthlySurcharge(109_001, 'single')).toBeCloseTo(81.2 + 14.5, 2)
  })

  it('reaches the top tier and stays there', () => {
    expect(irmaaTierFor(500_000, 'single')).toBe(5)
    expect(irmaaTierFor(50_000_000, 'single')).toBe(5)
    expect(irmaaTierFor(750_000, 'married')).toBe(5)
  })

  it('needs twice the income to reach a tier filing jointly', () => {
    expect(irmaaTierFor(150_000, 'single')).toBe(2)
    expect(irmaaTierFor(150_000, 'married')).toBe(0)
    expect(irmaaTierFor(300_000, 'married')).toBe(2)
  })
})

describe('annualSurcharge', () => {
  it('is nothing for the great majority of plans', () => {
    expect(annualSurcharge(80_000, 'single')).toBe(0)
    expect(annualSurcharge(200_000, 'married')).toBe(0)
  })

  it('charges one person twelve months of the surcharge', () => {
    expect(annualSurcharge(120_000, 'single')).toBeCloseTo((81.2 + 14.5) * 12, 2)
  })

  it('charges a couple twice, because both are on Medicare', () => {
    expect(annualSurcharge(230_000, 'married')).toBeCloseTo(
      (81.2 + 14.5) * 12 * 2,
      2,
    )
  })

  it('costs a top-tier couple over thirteen thousand a year', () => {
    expect(annualSurcharge(800_000, 'married')).toBeCloseTo((487 + 91) * 12 * 2, 2)
    expect(annualSurcharge(800_000, 'married')).toBeGreaterThan(13_000)
  })
})

describe('magiOf', () => {
  const row = {
    fromDeferred: 40_000,
    conversion: 30_000,
    otherIncome: 12_000,
    taxableSocialSecurity: 20_000,
    capitalGains: 8_000,
    // Present on a real row and deliberately not counted.
    fromRoth: 25_000,
  }

  it('counts every dollar the year treated as income', () => {
    expect(magiOf(row)).toBe(110_000)
  })

  it('does not count a Roth withdrawal', () => {
    // Bound to a name rather than passed inline: TypeScript only checks a
    // fresh object literal for excess properties, and the point here is that
    // magiOf tolerates being handed a whole row and ignores the rest of it.
    const spendingTheRoth = { ...row, fromRoth: 500_000 }
    expect(magiOf(spendingTheRoth)).toBe(magiOf(row))
  })

  it('counts a conversion, which is the whole problem', () => {
    const without = magiOf({ ...row, conversion: 0 })
    expect(magiOf(row) - without).toBe(30_000)
    // And that difference is what pushes this household over the first
    // threshold: $80,000 without it, $110,000 with.
    expect(irmaaTierFor(without, 'single')).toBe(0)
    expect(irmaaTierFor(magiOf(row), 'single')).toBe(1)
  })
})

describe('roomBelowNextTier', () => {
  it('says how far there is to go before the next step', () => {
    expect(roomBelowNextTier(100_000, 'single')).toBe(9_001)
    expect(roomBelowNextTier(109_001, 'single')).toBe(28_000)
  })

  it('is unbounded at the top, where there is no next step', () => {
    expect(roomBelowNextTier(600_000, 'single')).toBe(Infinity)
  })
})

/**
 * The same staleness guard the income tax tables carry. Thresholds move with
 * inflation each year and the premiums with Medicare's own costs, so these go
 * out of date annually and the arithmetic would not say so.
 */
describe('the IRMAA year', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has not been overtaken by the calendar', () => {
    const currentYear = new Date().getFullYear()
    expect(
      currentYear,
      `lib/irmaa.ts holds published figures up to ${IRMAA_YEAR} but it is now ` +
        `${currentYear}. The app has not broken — it is rolling the ${IRMAA_YEAR} ` +
        `table forward and labelling it estimated. Add ` +
        `IRMAA_TABLES[${currentYear}] from the published figures and move ` +
        `IRMAA_YEAR to replace the estimate with the real thing.`,
    ).toBeLessThanOrEqual(IRMAA_YEAR)
  })

  it('trips as soon as the calendar passes it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${IRMAA_YEAR + 1}-06-15T12:00:00`))
    expect(new Date().getFullYear()).toBeGreaterThan(IRMAA_YEAR)
  })
})

/**
 * The statutory shape of the Part B surcharge, as a cross-check on the figures
 * transcribed above.
 *
 * The tiers are not arbitrary amounts: the law sets each one as a share of the
 * total cost of Part B — 35%, 50%, 65%, 80% and 85%, against the 25% the
 * standard premium covers. So each tier's total premium is a fixed multiple of
 * the standard one, and the multiples never change even though the dollars do.
 *
 * That makes this a genuine second opinion on the table: a mistyped threshold
 * would survive the published-figures test above, because both would be typed
 * from the same page, but a mistyped premium fails here.
 */
describe('the statutory multiples', () => {
  const MULTIPLES = [1, 1.4, 2.0, 2.6, 3.2, 3.4]

  it('reproduces every Part B tier from the standard premium', () => {
    IRMAA_TIERS.single.forEach((tier, i) => {
      const total = tier.partB + STANDARD_PART_B_MONTHLY
      // Within a dime: CMS rounds each published premium to the nearest $0.10.
      expect(total, `tier ${i}`).toBeCloseTo(
        STANDARD_PART_B_MONTHLY * MULTIPLES[i],
        0,
      )
    })
  })
})

/**
 * Keyed by year so the annual update is additive.
 *
 * Adding 2027 next November must leave 2026 exactly where it is: a plan run
 * today and the same plan reopened in five years should still agree about what
 * 2026 charged. Overwriting one table each year would quietly rewrite history.
 */
describe('the year-keyed tables', () => {
  it('holds a table for every year it lists, each naming its own year', () => {
    expect(IRMAA_YEARS.length).toBeGreaterThan(0)
    for (const year of IRMAA_YEARS) {
      expect(IRMAA_TABLES[year].year, `table ${year}`).toBe(year)
    }
  })

  it('lists its years oldest first', () => {
    for (let i = 1; i < IRMAA_YEARS.length; i++) {
      expect(IRMAA_YEARS[i]).toBeGreaterThan(IRMAA_YEARS[i - 1])
    }
  })

  it('returns the table for a year it knows', () => {
    expect(irmaaTableFor(IRMAA_YEAR).year).toBe(IRMAA_YEAR)
    expect(irmaaTableFor(IRMAA_YEAR).tiers).toBe(IRMAA_TIERS)
  })

  it('holds the first table for years before it', () => {
    expect(irmaaTableFor(1990).year).toBe(IRMAA_YEARS[0])
    expect(irmaaTableFor(1990).estimated).toBeFalsy()
  })

  it('rolls forward rather than waiting for someone to type a new year in', () => {
    const last = IRMAA_YEARS[IRMAA_YEARS.length - 1]
    const next = irmaaTableFor(last + 1)
    expect(next.year).toBe(last + 1)
    expect(next.estimated).toBe(true)
    // Thresholds land on round thousands, as the published ones do.
    expect(next.tiers.single[1].from % 1_000).toBe(0)
    expect(next.tiers.single[1].from).toBeGreaterThan(
      IRMAA_TABLES[last].tiers.single[1].from,
    )
  })

  it('grows the surcharges faster than the thresholds, as Medicare does', () => {
    // The premium tracks what Medicare costs to run, not what shops charge.
    // Indexing both at CPI would understate the surcharge every year.
    expect(ASSUMED_PREMIUM_GROWTH).toBeGreaterThan(ASSUMED_INDEXATION)

    const last = IRMAA_YEARS[IRMAA_YEARS.length - 1]
    const base = IRMAA_TABLES[last]
    const ahead = irmaaTableFor(last + 10)
    const thresholdRise = ahead.tiers.single[1].from / base.tiers.single[1].from
    const premiumRise = ahead.tiers.single[1].partB / base.tiers.single[1].partB
    expect(premiumRise).toBeGreaterThan(thresholdRise)
    expect(ahead.standardPartB).toBeGreaterThan(base.standardPartB)
  })

  it('keeps the tiers ordered and the shape intact however far forward', () => {
    const far = irmaaTableFor(IRMAA_YEARS[IRMAA_YEARS.length - 1] + 30)
    for (const status of ['single', 'married'] as const) {
      const tiers = far.tiers[status]
      expect(tiers).toHaveLength(6)
      expect(tiers[0].partB).toBe(0)
      expect(tiers[0].partD).toBe(0)
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].from, `${status} ${i}`).toBeGreaterThan(tiers[i - 1].from)
        expect(tiers[i].partB, `${status} ${i}`).toBeGreaterThan(tiers[i - 1].partB)
      }
    }
  })

  it('prices against the calendar year, not the last one entered', () => {
    expect(currentIrmaaYear()).toBe(new Date().getFullYear())
    expect(irmaaTableFor(currentIrmaaYear()).year).toBe(currentIrmaaYear())
  })

  it('uses the most recent table at or before the year asked for', () => {
    // Holds however many years are entered: with only one it is that one, and
    // when 2027 is added a 2026 row must still get the 2026 figures.
    for (const year of IRMAA_YEARS) {
      expect(irmaaTableFor(year).year).toBe(year)
      // The year before the next table still belongs to this one.
      expect(irmaaTableFor(year + 0.9).year).toBe(year)
    }
  })

  it('answers the same for the latest year whether or not it is asked', () => {
    expect(annualSurcharge(150_000, 'single')).toBe(
      annualSurcharge(150_000, 'single', IRMAA_YEAR),
    )
    expect(irmaaTierFor(150_000, 'single')).toBe(
      irmaaTierFor(150_000, 'single', IRMAA_YEAR),
    )
    expect(roomBelowNextTier(150_000, 'single')).toBe(
      roomBelowNextTier(150_000, 'single', IRMAA_YEAR),
    )
  })
})

/**
 * The card under the projection.
 *
 * Two shapes, because there are two things worth saying. A plan that pays the
 * surcharge needs to be told what it costs and — the part no table can show —
 * which year's income caused it, two years before the bill. A plan that does
 * not pay it but runs close needs to be told how close, because the threshold
 * is a cliff: the year to be careful in is the one nothing has gone wrong in
 * yet.
 */
describe('the IRMAA insight', () => {
  const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
    ...DEFAULT_INPUTS,
    taxState: 'CA',
    ...over,
  })

  const cardFor = (inputs: PlanInputs) => {
    const result = simulate(inputs)
    const card = buildInsights(inputs, result, runMonteCarlo(inputs, 300)).find(
      (i) => i.key === 'irmaa',
    )
    return { result, card }
  }

  const payer = plan({
    currentAge: 64,
    retirementAge: 65,
    endAge: 88,
    balance401k: 1_200_000,
    brokerageBalance: 400_000,
    monthlyRetirementSpending: 5_000,
    socialSecurityAge: 70,
  })

  it('names what the surcharge costs across the plan', () => {
    const { result, card } = cardFor(payer)
    expect(result.totalIrmaa).toBeGreaterThan(0)
    expect(card).toBeDefined()
    // The headline figure is the one the projection actually charged.
    const quoted = card!.title.match(/\$([\d,]+)/)?.[1]
    expect(Number(quoted!.replace(/,/g, ''))).toBe(Math.round(result.totalIrmaa))
  })

  it('points at the year two years earlier that caused the first bill', () => {
    const { result, card } = cardFor(payer)
    const first = result.rows.find((r) => r.irmaaSurcharge > 0)!
    const cause = result.rows.find((r) => r.age === first.age - LOOKBACK_YEARS)!
    expect(card!.body).toContain(`first pays it at ${first.age}`)
    expect(card!.body).toContain(`at ${cause.age}`)
    // And the income it names is that year's, not the year being charged.
    expect(cause.magi).not.toBeCloseTo(first.magi, 0)
  })

  it('says it is a premium rather than a tax', () => {
    // It sits outside `taxes` in the projection, so a reader adding the two
    // together would be describing a bill nobody sends.
    expect(cardFor(payer).card!.body).toMatch(/premium rather than a tax/)
  })

  it('mentions both people when the surcharge is charged twice', () => {
    const couple = cardFor(
      plan({
        filingStatus: 'married',
        currentAge: 64,
        retirementAge: 65,
        endAge: 88,
        balance401k: 3_000_000,
        brokerageBalance: 500_000,
        monthlyRetirementSpending: 8_000,
      }),
    )
    expect(couple.card!.body).toMatch(/charged per person/)
    expect(cardFor(payer).card!.body).not.toMatch(/charged per person/)
  })

  it('does not say "rising to" when there is only one year of it', () => {
    const once = cardFor(
      plan({
        currentAge: 64,
        retirementAge: 65,
        endAge: 88,
        balance401k: 1_000_000,
        brokerageBalance: 200_000,
        monthlyRetirementSpending: 4_500,
        socialSecurityAge: 70,
      }),
    )
    const surcharged = once.result.rows.filter((r) => r.irmaaSurcharge > 0)
    if (surcharged.length === 1) {
      expect(once.card!.body).toMatch(/that one year is the only one/)
      expect(once.card!.body).not.toMatch(/rising to/)
    }
  })

  it('warns about the cliff when a plan runs close without crossing', () => {
    const near = cardFor(
      plan({
        currentAge: 64,
        retirementAge: 65,
        endAge: 84,
        balance401k: 900_000,
        brokerageBalance: 200_000,
        monthlyRetirementSpending: 4_200,
        socialSecurityAge: 70,
      }),
    )
    expect(near.result.totalIrmaa).toBe(0)
    expect(near.card).toBeDefined()
    expect(near.card!.title).toMatch(/headroom/)
    expect(near.card!.body).toMatch(/cliff rather than a slope/)
  })

  it('stays quiet for a plan nowhere near a threshold', () => {
    const { result, card } = cardFor(
      plan({
        currentAge: 64,
        retirementAge: 65,
        endAge: 84,
        balance401k: 600_000,
        brokerageBalance: 200_000,
        monthlyRetirementSpending: 3_800,
        socialSecurityAge: 70,
      }),
    )
    expect(result.totalIrmaa).toBe(0)
    expect(card).toBeUndefined()
  })
})

/**
 * The surcharge must be inflated exactly once.
 *
 * `simulate` restates real income into the dollars of the table it is testing
 * against, and the surcharge comes back in those same dollars — so it has to
 * be carried to the row's own year and no further. An earlier version
 * multiplied by the year's inflator on top of that, which charged inflation
 * twice and roughly doubled the lifetime figure. The tell is the rate at which
 * the surcharge grows in real terms: it should track premium growth net of
 * inflation, not premium growth outright.
 */
describe('the surcharge charged in the projection', () => {
  const inputs: PlanInputs = {
    ...DEFAULT_INPUTS,
    taxState: 'CA',
    currentAge: 64,
    retirementAge: 65,
    endAge: 88,
    balance401k: 1_200_000,
    brokerageBalance: 400_000,
    monthlyRetirementSpending: 5_000,
    socialSecurityAge: 70,
  }

  it('grows in real terms at premium growth net of inflation', () => {
    const infl = inputs.inflationRate / 100
    const expected = (1 + ASSUMED_PREMIUM_GROWTH) / (1 + infl)
    const doubleCounted = 1 + ASSUMED_PREMIUM_GROWTH

    const charged = simulate(inputs).rows.filter((r) => r.irmaaSurcharge > 0)
    expect(charged.length).toBeGreaterThan(4)

    // Year-on-year steps, ignoring the jumps where the household crosses into
    // a higher tier — those are a change of tier, not a change of price.
    const steps = charged
      .slice(1)
      .map((r, i) => r.irmaaSurcharge / charged[i].irmaaSurcharge)
      .filter((ratio) => ratio < 1.5)

    expect(steps.length).toBeGreaterThan(3)
    for (const ratio of steps) {
      expect(ratio).toBeCloseTo(expected, 3)
      // The value the double-counting bug produced, named so the test says
      // what it is defending against.
      expect(Math.abs(ratio - doubleCounted)).toBeGreaterThan(0.02)
    }
  })

  it('is reported in today\'s dollars, like every other flow on the row', () => {
    const rows = simulate(inputs).rows
    const first = rows.find((r) => r.irmaaSurcharge > 0)!
    // A first-tier surcharge is about $1,150 a year in 2026 money. Inflated
    // twice it would be several times that by the time it is first charged.
    expect(first.irmaaSurcharge).toBeLessThan(4_000)
    expect(first.irmaaSurcharge).toBeGreaterThan(500)
  })
})
