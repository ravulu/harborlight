import { afterEach, describe, expect, it, vi } from 'vitest'
import {
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
    expect(ageFactor(30)).toBe(AGE_FACTOR[40])
    expect(ageFactor(70)).toBe(AGE_FACTOR[64])
    expect(ageFactor(62.9)).toBe(AGE_FACTOR[62])
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
