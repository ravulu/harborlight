import { describe, expect, it } from 'vitest'
import { FAQ } from '@/lib/faq'
import { isLocal } from '@/lib/persistence'
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

  it('says the premium assumption fades, because the engine fades it', () => {
    // The engine stopped compounding the excess over the thresholds
    // (`PREMIUM_EXCESS_FADES_BY`). An answer describing it as grown faster
    // than prices for the whole plan would be describing the older engine, and
    // overstating a cost it no longer charges.
    expect(answer('Does it account for inflation').a).toMatch(/fade/i)
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

/**
 * What the FAQ may say about where figures live.
 *
 * The answers vary by deployment because the truth does: in local mode there
 * are no accounts and nothing of yours reaches a server, and an FAQ still
 * offering to store your plans against an account would be describing a
 * different build of the same app. Copy claims are tested here for the same
 * reason the windows prose is — the promise is the feature.
 */
describe.runIf(isLocal)('the FAQ in local mode', () => {
  const all = FAQ.map((x) => `${x.q} ${x.a}`).join('\n')

  it('never offers an account, because there is not one to offer', () => {
    // The claims, not the words. An answer saying there is *no* sign-up
    // necessarily contains "sign up", and banning the phrase would forbid the
    // one sentence most worth keeping.
    expect(all).not.toMatch(/an account exists only so you can save/i)
    expect(all).not.toMatch(/stored against your account/i)
    expect(all).not.toMatch(/sign in to save/i)
    expect(all).not.toMatch(/create an account to/i)
    // And the positive half: it says outright that there is none.
    expect(answer('Is Fairwater a free retirement calculator').a).toMatch(
      /no account|there is no sign-up/i,
    )
  })

  it('does not send the reader to a page that answers 404 here', () => {
    // `/dashboard` is gone in local mode; the saved-plans list lives on the
    // planner. An answer naming "My plans" would be an instruction to visit
    // a page that no longer exists — worse than no instruction.
    expect(all).not.toMatch(/My plans/)
  })

  it('says plainly that nothing reaches us, and that we could not look', () => {
    const privacy = answer('Is my financial information private')
    expect(privacy.a).toMatch(/never reaches us|nothing you enter ever reaches us/i)
    expect(privacy.a).toMatch(/could not tell you|cannot read|nowhere anybody here can read/i)
    // The one claim that must survive any rewrite: no figure is recorded.
    expect(privacy.a).toMatch(/never a figure you typed/i)
  })

  /**
   * The three things a reader has to know before trusting browser storage,
   * and the two controls that answer them. `lib/holdings-store.ts` removed
   * browser storage the first time precisely because a machine is shared;
   * storing deliberately is only defensible if the page says so.
   */
  it('warns what browser storage costs, and names the way out', () => {
    const kept = answer('Where are my saved plans kept')
    expect(kept.a).toMatch(/clearing your browsing data/i)
    expect(kept.a).toMatch(/anyone else who uses this browser/i)
    expect(kept.a).toMatch(/will not follow you/i)
    expect(kept.a).toMatch(/Download a copy/)
    expect(kept.a).toMatch(/Forget/)
  })

  it('does not claim saving makes a file, because it does not', () => {
    expect(answer('Where are my saved plans kept').a).toMatch(
      /does not make a file/i,
    )
  })
})

/**
 * The debt payoff answers.
 *
 * "Snowball or avalanche" is among the most-asked questions in this subject
 * and the reason somebody would find `/debt-payoff` at all, so the FAQ has to
 * answer it — and answer it the way the calculator does, which is by pricing
 * both and naming neither.
 */
describe('the debt payoff questions', () => {
  const snowball = answer('Should I use the debt snowball')
  const projection = answer('Does paying off debt change my retirement projection')

  it('explains the rollover, which is the mechanism both share', () => {
    expect(snowball.a).toMatch(/whole payment joins|joins the spare money/i)
    expect(snowball.a).toMatch(/minimum on every debt/i)
  })

  it('gives each method its own honest claim', () => {
    // Avalanche always wins on interest; snowball wins on getting one gone.
    expect(snowball.a).toMatch(/highest interest rate[\s\S]*costs less interest/i)
    expect(snowball.a).toMatch(/smallest balance[\s\S]*gone sooner/i)
  })

  it('names no winner, like every other comparison here', () => {
    const directive = /\b(you should|we recommend|the best|is best|we suggest|you ought)\b/i
    expect(directive.test(snowball.a)).toBe(false)
    expect(directive.test(projection.a)).toBe(false)
  })

  /**
   * The two things that make a reader think the calculator is broken. Both
   * are in the answer because both are cheaper to read than to discover.
   */
  it('warns that the two often tie, and why', () => {
    expect(snowball.a).toMatch(/identical|come out the same/i)
    expect(snowball.a).toMatch(/smallest balance frequently carries the highest rate/i)
    expect(snowball.a).toMatch(/not entered an interest rate|nothing for the avalanche to sort by/i)
  })

  it('says plainly that debt does not reach the projection', () => {
    // The same disclosure the register carries. An FAQ that left this out
    // would have somebody clearing a card and hunting for the change.
    expect(projection.a).toMatch(/does not model debt payments/i)
    expect(projection.a).toMatch(/net worth/i)
  })
})
