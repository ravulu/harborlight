import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  benchmarkAnnualFor,
  policyAges,
  ACA_YEAR,
  AGE_FACTOR,
  APPLICABLE_PERCENTAGE,
  BENCHMARK_40_MONTHLY,
  CLIFF,
  FPL_BASE,
  FPL_PER_EXTRA_PERSON,
  MEDICARE_AGE,
  acaCost,
  acaMagiOf,
  ageFactor,
  applicablePercentage,
  benchmarkAnnual,
  povertyLine,
} from '@/lib/aca'

describe('the 2026 figures', () => {
  it('uses the prior year’s poverty guidelines, as the credit always does', () => {
    expect(ACA_YEAR).toBe(2026)
    // 2025 guidelines, 48 contiguous states.
    expect(povertyLine(1)).toBe(15_650)
    expect(povertyLine(2)).toBe(21_150)
    expect(povertyLine(2) - povertyLine(1)).toBe(FPL_PER_EXTRA_PERSON)
    expect(povertyLine(4)).toBe(FPL_BASE + 3 * FPL_PER_EXTRA_PERSON)
  })

  it('treats a household of less than one as one', () => {
    expect(povertyLine(0)).toBe(povertyLine(1))
    expect(povertyLine(-3)).toBe(povertyLine(1))
  })

  /**
   * The table from IRS Rev. Proc. 2025-25 §3.01. Pinned tier by tier because a
   * single mistyped percentage moves every subsidy figure on the page, and the
   * arithmetic downstream would not look any different for it.
   */
  it('carries the applicable percentage table exactly', () => {
    expect(APPLICABLE_PERCENTAGE).toEqual([
      { from: 0, initial: 2.1, final: 2.1 },
      { from: 1.33, initial: 3.14, final: 4.19 },
      { from: 1.5, initial: 4.19, final: 6.6 },
      { from: 2.0, initial: 6.6, final: 8.44 },
      { from: 2.5, initial: 8.44, final: 9.96 },
      { from: 3.0, initial: 9.96, final: 9.96 },
    ])
  })

  it('tops out at three times the youngest rate, which is the legal maximum', () => {
    expect(AGE_FACTOR[64]).toBe(3.0)
    expect(AGE_FACTOR[40]).toBe(1.278)
  })
})

describe('applicablePercentage', () => {
  it('interpolates within a tier rather than stepping', () => {
    // Halfway through the 150–200% tier is halfway between 4.19 and 6.60.
    expect(applicablePercentage(1.75)).toBeCloseTo((4.19 + 6.6) / 2, 6)
  })

  it('lands on the published figure at the bottom of each tier', () => {
    for (const tier of APPLICABLE_PERCENTAGE) {
      expect(applicablePercentage(tier.from), `tier from ${tier.from}`).toBeCloseTo(
        tier.initial,
        6,
      )
    }
  })

  it('holds flat across the top tier, where initial and final agree', () => {
    expect(applicablePercentage(3.0)).toBeCloseTo(9.96, 6)
    expect(applicablePercentage(3.5)).toBeCloseTo(9.96, 6)
    expect(applicablePercentage(4.0)).toBeCloseTo(9.96, 6)
  })

  it('rises with income all the way to the cliff', () => {
    let last = -1
    for (let r = 0; r <= CLIFF; r += 0.05) {
      const pct = applicablePercentage(r)
      expect(pct, `at ${r.toFixed(2)}x`).toBeGreaterThanOrEqual(last - 1e-9)
      last = pct
    }
  })

  it('is nothing past the cliff, because there is no credit to reduce', () => {
    expect(applicablePercentage(4.001)).toBe(0)
    expect(applicablePercentage(10)).toBe(0)
  })
})

describe('benchmarkAnnual', () => {
  it('prices the 40-year-old benchmark at the published average', () => {
    expect(benchmarkAnnual(40, 1)).toBeCloseTo(BENCHMARK_40_MONTHLY * 12, 6)
  })

  it('charges an older household more, up to three times the youngest rate', () => {
    expect(benchmarkAnnual(62, 1)).toBeGreaterThan(benchmarkAnnual(50, 1))
    expect(benchmarkAnnual(64, 1) / benchmarkAnnual(40, 1)).toBeCloseTo(
      3.0 / 1.278,
      6,
    )
  })

  it('charges a couple twice, because a policy is priced per person', () => {
    expect(benchmarkAnnual(62, 2)).toBeCloseTo(benchmarkAnnual(62, 1) * 2, 6)
  })

  it('holds the ends of the age curve rather than running off it', () => {
    // The bottom used to be 40, with a note that nobody on this path was ever
    // under 50. That was true while a household could only be one or two
    // adults; a child on the policy walks straight past it, and a child rated
    // at forty was charged two-thirds more than a child costs.
    expect(ageFactor(-5)).toBe(AGE_FACTOR[0])
    expect(ageFactor(70)).toBe(AGE_FACTOR[64])
    expect(ageFactor(62.9)).toBe(AGE_FACTOR[62])
  })

  it('rates a child as a child, all the way down to nought', () => {
    // Flat below 15, so every one of these is the exact figure rather than the
    // nearest one. A child costs roughly a quarter of what a sixty-year-old
    // does, which is the whole difference this curve was hiding.
    for (const age of [0, 5, 10, 14]) expect(ageFactor(age)).toBe(0.765)
    expect(ageFactor(15)).toBeGreaterThan(ageFactor(14))
    expect(ageFactor(21)).toBe(1)
    expect(ageFactor(10) / ageFactor(60)).toBeLessThan(0.3)
  })

  it('rises the whole way up, never falling back', () => {
    let last = 0
    for (let age = 0; age <= 64; age++) {
      const f = ageFactor(age)
      expect(f, `age ${age}`).toBeGreaterThanOrEqual(last)
      last = f
    }
  })
})

describe('a household priced member by member', () => {
  it('charges each person at their own age, not the subscriber\'s', () => {
    // Every member used to be rated at the subscriber's age and multiplied up.
    // A sixty-year-old with two children was quoted 56% more than the plan
    // costs, because each child was charged as a sixty-year-old.
    const flat = benchmarkAnnual(60, 4)
    const real = benchmarkAnnualFor([60, 60, 10, 13])
    expect(real).toBeLessThan(flat)
    expect(real / flat).toBeLessThan(0.7)
  })

  it('still charges a couple of the same age twice over', () => {
    // The old behaviour was right for the one household it could describe, and
    // that has to keep holding or every existing plan moves.
    expect(benchmarkAnnualFor([62, 62])).toBeCloseTo(benchmarkAnnual(62, 1) * 2, 6)
    expect(benchmarkAnnualFor([62])).toBeCloseTo(benchmarkAnnual(62, 1), 6)
  })

  it('charges for only the three oldest children', () => {
    const three = benchmarkAnnualFor([60, 60, 18, 16, 13])
    const five = benchmarkAnnualFor([60, 60, 18, 16, 13, 10, 8])
    expect(five).toBe(three)
  })

  it('counts somebody who has turned 21 as an adult, cap or no cap', () => {
    // The cap is on children, so a fourth person of 21 is charged even though
    // a fourth person of 20 would not be.
    const grown = benchmarkAnnualFor([60, 60, 18, 16, 13, 21])
    const child = benchmarkAnnualFor([60, 60, 18, 16, 13, 20])
    expect(grown).toBeGreaterThan(child)
  })

  it('costs nothing for nobody', () => {
    expect(benchmarkAnnualFor([])).toBe(0)
  })
})

describe('who is on the policy in a given year', () => {
  it('drops each dependent in the year they turn 26, one at a time', () => {
    const born = [2010, 2013]
    const at = (year: number) => policyAges(60, true, born, year).length
    expect(at(2030)).toBe(4)
    // 2010 turns 26 in 2036; 2013 in 2039.
    expect(at(2035)).toBe(4)
    expect(at(2036)).toBe(3)
    expect(at(2038)).toBe(3)
    expect(at(2039)).toBe(2)
    expect(at(2050)).toBe(2)
  })

  it('ignores a dependent who is not born yet', () => {
    expect(policyAges(50, false, [2030], 2026)).toEqual([50])
  })

  it('takes the spouse to be the same age, which is all the plan knows', () => {
    expect(policyAges(58, true, [], 2026)).toEqual([58, 58])
    expect(policyAges(58, false, [], 2026)).toEqual([58])
  })

  it('puts each dependent in at their age that year', () => {
    expect(policyAges(60, false, [2010, 2013], 2030)).toEqual([60, 20, 17])
  })
})

/**
 * The cliff is the whole reason this module exists.
 *
 * Everywhere else in the tax code an extra dollar of income costs a fraction
 * of a dollar. Here it can cost thousands, and it does so silently — the
 * projection charges no tax on it and nothing else on the page would show it.
 */
describe('the subsidy cliff', () => {
  const line = povertyLine(1)

  it('still pays a credit at exactly four times the poverty line', () => {
    const at = acaCost(line * CLIFF, 62, 1)
    expect(at.overCliff).toBe(false)
    expect(at.subsidy).toBeGreaterThan(0)
  })

  it('pays nothing a dollar past it', () => {
    const over = acaCost(line * CLIFF + 1, 62, 1)
    expect(over.overCliff).toBe(true)
    expect(over.subsidy).toBe(0)
    expect(over.net).toBeCloseTo(over.benchmark, 6)
  })

  it('costs thousands for that one dollar', () => {
    const under = acaCost(line * CLIFF, 62, 1)
    const over = acaCost(line * CLIFF + 1, 62, 1)
    const jump = over.net - under.net
    expect(jump).toBeGreaterThan(5_000)
    // Which is the entire credit that was being paid the moment before.
    expect(jump).toBeCloseTo(under.subsidy, 0)
  })

  it('sits at twice the income for a couple', () => {
    expect(povertyLine(2) * CLIFF).toBeCloseTo(84_600, 6)
    expect(acaCost(84_000, 62, 2).overCliff).toBe(false)
    expect(acaCost(85_000, 62, 2).overCliff).toBe(true)
  })

  it('says how much room is left before it', () => {
    const c = acaCost(50_000, 62, 1)
    expect(c.roomBelowCliff).toBeCloseTo(line * CLIFF - 50_000, 6)
    expect(acaCost(line * CLIFF + 5_000, 62, 1).roomBelowCliff).toBe(0)
  })
})

describe('acaCost below the cliff', () => {
  it('asks for the applicable share of income and credits the rest', () => {
    const magi = 40_000
    const c = acaCost(magi, 62, 1)
    const expected = (magi * applicablePercentage(c.fplRatio)) / 100
    expect(c.net).toBeCloseTo(expected, 6)
    expect(c.subsidy).toBeCloseTo(c.benchmark - expected, 6)
  })

  it('never charges more than the plan costs, or credits more than it costs', () => {
    for (const magi of [0, 10_000, 30_000, 55_000, 62_000]) {
      const c = acaCost(magi, 62, 1)
      expect(c.net, `at ${magi}`).toBeGreaterThanOrEqual(0)
      expect(c.net, `at ${magi}`).toBeLessThanOrEqual(c.benchmark + 1e-6)
      expect(c.subsidy, `at ${magi}`).toBeLessThanOrEqual(c.benchmark + 1e-6)
    }
  })

  it('costs more as income rises, right up to the cliff', () => {
    let last = -1
    for (let magi = 20_000; magi < povertyLine(1) * CLIFF; magi += 2_500) {
      const net = acaCost(magi, 62, 1).net
      expect(net, `at ${magi}`).toBeGreaterThan(last)
      last = net
    }
  })
})

describe('acaMagiOf', () => {
  const row = {
    fromDeferred: 20_000,
    conversion: 15_000,
    otherIncome: 6_000,
    socialSecurity: 24_000,
    capitalGains: 4_000,
    // On a real row and deliberately not counted.
    fromRoth: 30_000,
  }

  it('counts the whole Social Security benefit, not only the taxable part', () => {
    // This is what separates it from the Medicare measure: a household can sit
    // comfortably inside a tax bracket and still be over the cliff.
    expect(acaMagiOf(row)).toBe(69_000)
  })

  it('does not count a Roth withdrawal', () => {
    const bigger = { ...row, fromRoth: 400_000 }
    expect(acaMagiOf(bigger)).toBe(acaMagiOf(row))
  })

  it('counts a conversion, which is the whole problem', () => {
    expect(acaMagiOf(row) - acaMagiOf({ ...row, conversion: 0 })).toBe(15_000)
  })
})

describe('Medicare age', () => {
  it('is when marketplace cover stops mattering', () => {
    expect(MEDICARE_AGE).toBe(65)
  })
})

/**
 * The same staleness guard the tax and IRMAA tables carry.
 *
 * The poverty guidelines are reissued every January, the applicable percentage
 * table every summer, and the benchmark premium every autumn. All three go out
 * of date annually and nothing about the arithmetic would say so.
 */
describe('the ACA year', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('has not been overtaken by the calendar', () => {
    const currentYear = new Date().getFullYear()
    expect(
      currentYear,
      `lib/aca.ts holds ${ACA_YEAR} figures but it is now ${currentYear}. Update ` +
        `FPL_BASE, APPLICABLE_PERCENTAGE and BENCHMARK_40_MONTHLY from the ` +
        `published figures, then move ACA_YEAR. Note the poverty guidelines ` +
        `used are the previous year's — that is how the credit works.`,
    ).toBeLessThanOrEqual(ACA_YEAR)
  })

  it('trips as soon as the calendar passes it', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${ACA_YEAR + 1}-06-15T12:00:00`))
    expect(new Date().getFullYear()).toBeGreaterThan(ACA_YEAR)
  })
})
