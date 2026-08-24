import { describe, expect, it } from 'vitest'
import {
  UNIFORM_LIFETIME,
  requiredDistribution,
  rmdAge,
  rmdDivisor,
} from '@/lib/rmd'

describe('rmdAge', () => {
  // SECURE 2.0 sets the age by birth year: 73 for 1951–1959, 75 from 1960.
  it('is 75 for anyone born in 1960 or later', () => {
    expect(rmdAge(60, 2026)).toBe(75) // born 1966
    expect(rmdAge(66, 2026)).toBe(75) // born 1960, the first year
  })

  it('is 73 for anyone born before 1960', () => {
    expect(rmdAge(67, 2026)).toBe(73) // born 1959, the last year
    expect(rmdAge(80, 2026)).toBe(73)
  })

  it('turns on the birth year, not on the age reached', () => {
    // The same person, asked in two different years, gets the same answer.
    expect(rmdAge(64, 2026)).toBe(rmdAge(65, 2027))
  })
})

describe('the Uniform Lifetime Table', () => {
  it('matches the published divisors at the ages people check', () => {
    expect(UNIFORM_LIFETIME[72]).toBe(27.4)
    expect(UNIFORM_LIFETIME[73]).toBe(26.5)
    expect(UNIFORM_LIFETIME[75]).toBe(24.6)
    expect(UNIFORM_LIFETIME[80]).toBe(20.2)
    expect(UNIFORM_LIFETIME[85]).toBe(16.0)
    expect(UNIFORM_LIFETIME[90]).toBe(12.2)
    expect(UNIFORM_LIFETIME[95]).toBe(8.9)
    expect(UNIFORM_LIFETIME[100]).toBe(6.4)
    expect(UNIFORM_LIFETIME[120]).toBe(2.0)
  })

  it('covers every age from 72 to 120 with no holes', () => {
    for (let age = 72; age <= 120; age++) {
      expect(UNIFORM_LIFETIME[age], `age ${age}`).toBeGreaterThan(0)
    }
    expect(Object.keys(UNIFORM_LIFETIME)).toHaveLength(120 - 72 + 1)
  })

  it('falls monotonically, so the required share only ever rises', () => {
    for (let age = 73; age <= 120; age++) {
      expect(UNIFORM_LIFETIME[age], `age ${age}`).toBeLessThan(UNIFORM_LIFETIME[age - 1])
    }
  })
})

describe('rmdDivisor', () => {
  it('holds the first row below the table and the last row above it', () => {
    expect(rmdDivisor(50)).toBe(UNIFORM_LIFETIME[72])
    expect(rmdDivisor(130)).toBe(UNIFORM_LIFETIME[120])
  })

  it('ignores a fractional age rather than interpolating', () => {
    expect(rmdDivisor(80.9)).toBe(UNIFORM_LIFETIME[80])
  })
})

describe('requiredDistribution', () => {
  it('is nothing before the start age', () => {
    expect(requiredDistribution(1_000_000, 74, 75)).toBe(0)
    expect(requiredDistribution(1_000_000, 60, 75)).toBe(0)
  })

  it('is the balance over the divisor from the start age on', () => {
    // A $2,000,000 balance at 80 divides by 20.2.
    expect(requiredDistribution(2_000_000, 80, 75)).toBeCloseTo(2_000_000 / 20.2, 6)
    expect(requiredDistribution(2_000_000, 80, 75)).toBeCloseTo(99_009.9, 1)
  })

  it('is nothing from an account with nothing in it', () => {
    expect(requiredDistribution(0, 85, 75)).toBe(0)
    expect(requiredDistribution(-100, 85, 75)).toBe(0)
  })

  it('takes a rising share of the same balance as the years pass', () => {
    const balance = 1_000_000
    const shares = [75, 80, 85, 90, 95].map(
      (age) => requiredDistribution(balance, age, 75) / balance,
    )
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThan(shares[i - 1])
    }
    // Roughly a twenty-fifth at 75 and better than a ninth at 95.
    expect(shares[0]).toBeCloseTo(1 / 24.6, 6)
    expect(shares[4]).toBeCloseTo(1 / 8.9, 6)
  })
})
