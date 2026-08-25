import { describe, expect, it } from 'vitest'
import { FAQ } from '@/lib/faq'
import { DEFAULT_INPUTS, simulate, type PlanInputs } from '@/lib/retirement'
import { MEDICARE_AGE, povertyLine, CLIFF } from '@/lib/aca'
import { IRMAA_TIERS_2026, LOOKBACK_YEARS } from '@/lib/irmaa'
import { PENALTY_FREE_AGE, SS_THRESHOLDS } from '@/lib/tax'
import { SIMULATION_RUNS } from '@/lib/monte-carlo'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'
import { benefitFactor } from '@/lib/social-security'
import { compareClaiming } from '@/lib/claiming'

const all = FAQ.map((x) => `${x.q} ${x.a}`).join('\n')
const answer = (fragment: string) =>
  FAQ.find((x) => x.q.toLowerCase().includes(fragment.toLowerCase()))!

describe('the FAQ as a document', () => {
  it('asks and answers something every time', () => {
    for (const { q, a } of FAQ) {
      expect(q.trim().endsWith('?'), q).toBe(true)
      expect(a.length, q).toBeGreaterThan(80)
    }
  })

  it('asks each question once', () => {
    const qs = FAQ.map((x) => x.q.toLowerCase())
    expect(new Set(qs).size).toBe(qs.length)
  })
})

/**
 * The FAQ describes what the projection does, so it can stop being true
 * without anybody touching it. It already did once: it told readers the
 * planner did not charge the 10% early-withdrawal penalty for a good while
 * after the planner started charging it. These are the claims most likely to
 * rot, checked against the engine rather than against memory.
 */
describe('claims the engine has to keep true', () => {
  it('does not deny charging the early-withdrawal penalty, which it charges', () => {
    const p: PlanInputs = {
      ...DEFAULT_INPUTS,
      currentAge: 52,
      retirementAge: 55,
      endAge: 90,
      brokerageBalance: 0,
      balance401k: 1_500_000,
      monthlyRetirementSpending: 6_000,
    }
    const charged = simulate(p).rows.some((r) => r.earlyWithdrawalPenalty > 0)
    expect(charged).toBe(true)
    // So no answer may say it does not.
    expect(all).not.toMatch(/does not .{0,40}(penalty|10%)/i)
    expect(answer('401(k) and IRA withdrawals').a).toMatch(/10%/)
  })

  it('covers health cover before Medicare, and gets the cliff right', () => {
    const a = answer('health insurance').a
    expect(a).toContain(String(MEDICARE_AGE))
    // The two figures a reader is most likely to check.
    const single = Math.round(povertyLine(1) * CLIFF)
    const couple = Math.round(povertyLine(2) * CLIFF)
    expect(a).toContain(single.toLocaleString())
    expect(a).toContain(couple.toLocaleString())
  })

  it('covers the Medicare surcharge, its lag and its first threshold', () => {
    const a = answer('Medicare cost more').a
    expect(a).toMatch(/two years earlier/i)
    expect(LOOKBACK_YEARS).toBe(2)
    const firstTier = IRMAA_TIERS_2026.single[1].from
    expect(a).toContain(firstTier.toLocaleString())
    // Charged per person, which is the half of it couples miss.
    expect(a).toMatch(/per person|twice/i)
  })

  it('says conversions are ranked on more than tax, because they are', () => {
    const a = answer('Roth conversion').a
    expect(a).toMatch(/surcharge/i)
    expect(a).toMatch(/subsidy|health/i)
  })

  it('does not claim couples are fully handled while survivor is unpriced', () => {
    // `compareClaiming` sets `survivorUnpriced` for every married plan and the
    // card says so in as many words. The FAQ claimed the opposite — "couples
    // are handled properly" — which is the kind of contradiction a reader
    // finds by using the product.
    const married = compareClaiming({
      ...DEFAULT_INPUTS,
      filingStatus: 'married',
      socialSecurityMonthly: 3_000,
    })!
    expect(married.survivorUnpriced).toBe(true)
    const a = answer('claim Social Security').a
    expect(a).not.toMatch(/handled properly|fully|complete/i)
    expect(a).toMatch(/does not yet model|lives longer/i)
  })

  it('names the simulated run count the engine actually uses', () => {
    expect(answer('Monte Carlo').a).toContain(SIMULATION_RUNS.toLocaleString())
  })

  it('quotes the confidence bar the planner is held to', () => {
    expect(answer('Monte Carlo').a).toContain(`${Math.round(TARGET_CONFIDENCE * 100)}%`)
  })

  it('quotes the Social Security thresholds the engine measures against', () => {
    const a = answer('Social Security will be taxed').a
    for (const v of [
      SS_THRESHOLDS.single.base,
      SS_THRESHOLDS.single.adjusted,
      SS_THRESHOLDS.married.base,
      SS_THRESHOLDS.married.adjusted,
    ]) {
      expect(a, String(v)).toContain(v.toLocaleString())
    }
  })

  it('quotes the claim-age factors the engine pays', () => {
    const a = answer('claim Social Security').a
    expect(a).toContain(`${Math.round(benefitFactor(62) * 100)}%`)
    expect(a).toContain(`${Math.round(benefitFactor(70) * 100)}%`)
  })

  it('does not promise statutory indexation it does not perform', () => {
    // Past the last published table the brackets are carried forward at an
    // assumed rate, not by the chained-CPI the law uses.
    expect(all).not.toMatch(/indexed as they are in law/i)
  })

  it('says the year is charged for health cover and the surcharge', () => {
    // Both are funded by the withdrawal and neither is a tax, so a description
    // of the year that lists only tax is describing an older projection.
    expect(answer('How long will my money last').a).toMatch(/health cover/i)
  })

  it('quotes the penalty-free age the engine actually uses', () => {
    expect(PENALTY_FREE_AGE).toBe(59.5)
    expect(all).toContain('59½')
  })
})
