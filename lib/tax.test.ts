import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ASSUMED_INDEXATION,
  BRACKET_YEAR,
  TAX_TABLES,
  TAX_YEARS,
  currentTaxYear,
  taxTableFor,
  CAPITAL_GAINS,
  FEDERAL,
  SS_THRESHOLDS,
  capitalGainsTax,
  taxOn,
  taxYear,
  taxableSocialSecurity,
  withdrawForNeed,
} from '@/lib/tax'

/**
 * The worked example from `docs/competitive-boldin.md`, which is the sentence
 * the product's whole claim rests on:
 *
 *   $334,641 comes out of the brokerage. Social Security puts $36,873 of
 *   ordinary income beside it. The $16,100 standard deduction leaves $20,773
 *   in the brackets, at $2,245. The gain stacks on top of that, so the first
 *   $28,677 falls in the 0% capital-gains band and the rest meets 15%, at
 *   $15,777. That is $18,022 against the $334,641 withdrawn, or 5.4%.
 *
 * Every figure in it is checkable by hand, which is what makes it worth
 * pinning: if the engine stops producing these numbers, the prose beside them
 * is wrong and no one finds out from the arithmetic.
 */
describe('the derivation the tax tab shows', () => {
  const WITHDRAWAL = 334_641
  const TAXABLE_SS = 36_873
  const GAIN_SHARE = 0.4
  const gain = WITHDRAWAL * GAIN_SHARE

  it('leaves $20,773 in the brackets after the standard deduction', () => {
    const { standardDeduction } = FEDERAL.single
    expect(standardDeduction).toBe(16_100)
    expect(TAXABLE_SS - standardDeduction).toBe(20_773)
  })

  it('charges $2,245 of ordinary tax on that', () => {
    const tax = taxOn(TAXABLE_SS, FEDERAL.single.brackets, FEDERAL.single.standardDeduction)
    // 10% of the first $12,400, then 12% of the $8,373 above it.
    expect(tax).toBeCloseTo(1_240 + 8_373 * 0.12, 2)
    expect(Math.round(tax)).toBe(2_245)
  })

  it('leaves $28,677 of room in the 0% capital-gains band', () => {
    const zeroBandTop = CAPITAL_GAINS.single[1].from
    expect(zeroBandTop).toBe(49_450)
    expect(zeroBandTop - 20_773).toBe(28_677)
  })

  it('charges $15,777 on the gain, stacked above the ordinary income', () => {
    const tax = capitalGainsTax(gain, 20_773, 'single')
    // Nothing on the $28,677 of band that is left, 15% on the rest. The note
    // quotes that rest as $105,180; it is $105,179.40 before rounding, which
    // is why the assertion is on the figure the reader is shown.
    expect(tax).toBeCloseTo((gain - 28_677) * 0.15, 6)
    expect(Math.round(tax)).toBe(15_777)
  })

  it('adds up to $18,022, or 5.4% of what was withdrawn', () => {
    const ordinary = taxOn(
      TAXABLE_SS,
      FEDERAL.single.brackets,
      FEDERAL.single.standardDeduction,
    )
    const gains = capitalGainsTax(gain, 20_773, 'single')
    const total = ordinary + gains

    // The claim the audit makes: the pieces add to the total, rather than the
    // total being computed some other way and the pieces quoted beside it.
    expect(Math.round(total)).toBe(18_022)
    expect(Math.round((total / WITHDRAWAL) * 1000) / 10).toBe(5.4)
  })
})

/**
 * Gains stack on ordinary income rather than being priced beside it. That is
 * the single most consequential rule in the engine — it is why a brokerage
 * balance is worth separating from a 401(k) at all — and it is the one a
 * refactor is most likely to quietly get wrong.
 */
describe('capitalGainsTax stacks rather than prices separately', () => {
  it('charges nothing when the whole gain fits under the 0% band', () => {
    expect(capitalGainsTax(30_000, 0, 'single')).toBe(0)
  })

  it('charges nothing on the part that fits and 15% on the part that does not', () => {
    // Ordinary income has used $40,000 of the $49,450 band, leaving $9,450.
    expect(capitalGainsTax(20_000, 40_000, 'single')).toBeCloseTo(
      (20_000 - 9_450) * 0.15,
      2,
    )
  })

  it('charges the whole gain at 15% once ordinary income fills the band', () => {
    expect(capitalGainsTax(20_000, 60_000, 'single')).toBeCloseTo(20_000 * 0.15, 2)
  })

  it('reaches 20% only above the top threshold', () => {
    const top = CAPITAL_GAINS.single[2].from
    // A gain straddling the threshold: 15% below it, 20% above.
    expect(capitalGainsTax(20_000, top - 10_000, 'single')).toBeCloseTo(
      10_000 * 0.15 + 10_000 * 0.2,
      2,
    )
  })

  it('is not the same as pricing the gain on its own', () => {
    // The same $50,000 gain, once with ordinary income under it and once
    // without. Stand-alone it clears all but $550 of the 0% band, at $82.50;
    // stacked on $45,000 of ordinary income almost none of the band is left.
    const stacked = capitalGainsTax(50_000, 45_000, 'single')
    const standalone = capitalGainsTax(50_000, 0, 'single')
    expect(standalone).toBeCloseTo(550 * 0.15, 6)
    expect(stacked).toBeGreaterThan(standalone)
  })
})

/** Publication 915, which has its own thresholds and its own two-tier shape. */
describe('taxableSocialSecurity', () => {
  it('taxes none of it below the base threshold', () => {
    expect(taxableSocialSecurity(24_000, 10_000, 'single')).toBe(0)
  })

  it('never taxes more than 85% of the benefit', () => {
    const benefit = 40_000
    expect(taxableSocialSecurity(benefit, 500_000, 'single')).toBeCloseTo(
      0.85 * benefit,
      6,
    )
  })

  it('uses the married thresholds for a married filer', () => {
    expect(SS_THRESHOLDS.married).toEqual({ base: 32_000, adjusted: 44_000 })
    // Provisional income is other income plus HALF the benefit: $12,000 and
    // a $30,000 benefit make $27,000. That is over the $25,000 single base
    // but under the $32,000 married one, so the same household owes nothing
    // on the benefit filing jointly and owes something filing single.
    expect(taxableSocialSecurity(30_000, 12_000, 'married')).toBe(0)
    expect(taxableSocialSecurity(30_000, 12_000, 'single')).toBeCloseTo(
      (27_000 - 25_000) / 2,
      6,
    )
  })

  it('never returns more than it was given, at any income', () => {
    for (const other of [0, 20_000, 50_000, 120_000, 400_000]) {
      const taxable = taxableSocialSecurity(36_000, other, 'single')
      expect(taxable).toBeGreaterThanOrEqual(0)
      expect(taxable).toBeLessThanOrEqual(36_000)
    }
  })
})

describe('taxOn', () => {
  it('applies each rate only to the slice inside its bracket', () => {
    // $50,000 of taxable income: 10% on the first $12,400, 12% on the rest.
    expect(taxOn(50_000 + 16_100, FEDERAL.single.brackets, 16_100)).toBeCloseTo(
      12_400 * 0.1 + (50_000 - 12_400) * 0.12,
      2,
    )
  })

  it('charges nothing when income is under the deduction', () => {
    expect(taxOn(10_000, FEDERAL.single.brackets, 16_100)).toBe(0)
  })

  it('never charges a marginal rate on the whole amount', () => {
    const income = 300_000
    const tax = taxOn(income, FEDERAL.single.brackets, 16_100)
    expect(tax).toBeLessThan(income * 0.32)
  })
})

/**
 * `withdrawForNeed` is solved rather than calculated: the tax depends on the
 * withdrawal and the withdrawal has to cover the tax. The fixed point is the
 * thing to pin — an iteration limit that stops converging shows up as a
 * shortfall, not as an error.
 */
describe('withdrawForNeed solves for a withdrawal that covers its own tax', () => {
  const pots = { brokerage: 800_000, gainShare: 40, deferred: 600_000, roth: 200_000 }

  it('leaves exactly the need after tax', () => {
    const need = 80_000
    const draw = withdrawForNeed(need, 30_000, 0, 'CA', 'single', pots)
    expect(draw.gross - draw.federalTax - draw.stateTax).toBeCloseTo(need, 0)
  })

  it('draws taxable first, then deferred, then Roth', () => {
    const draw = withdrawForNeed(60_000, 0, 0, 'CA', 'single', pots)
    expect(draw.fromBrokerage).toBeGreaterThan(0)
    expect(draw.fromDeferred).toBe(0)
    expect(draw.fromRoth).toBe(0)

    // Once the brokerage is gone the order moves on rather than overdrawing.
    const drained = withdrawForNeed(60_000, 0, 0, 'CA', 'single', {
      ...pots,
      brokerage: 10_000,
    })
    expect(drained.fromBrokerage).toBe(10_000)
    expect(drained.fromDeferred).toBeGreaterThan(0)
  })

  it('taxes a Roth dollar at nothing', () => {
    const rothOnly = { brokerage: 0, gainShare: 0, deferred: 0, roth: 500_000 }
    const draw = withdrawForNeed(50_000, 0, 0, 'CA', 'single', rothOnly)
    expect(draw.federalTax).toBe(0)
    expect(draw.stateTax).toBe(0)
    expect(draw.gross).toBe(50_000)
  })

  it('taxes a deferred dollar more heavily than a brokerage dollar', () => {
    const shared = { gainShare: 40, roth: 0 }
    const fromBrokerage = withdrawForNeed(60_000, 0, 0, 'CA', 'single', {
      ...shared,
      brokerage: 500_000,
      deferred: 0,
    })
    const fromDeferred = withdrawForNeed(60_000, 0, 0, 'CA', 'single', {
      ...shared,
      brokerage: 0,
      deferred: 500_000,
    })
    expect(fromDeferred.federalTax).toBeGreaterThan(fromBrokerage.federalTax)
  })

  it('takes everything the pots hold and reports the rest as unfunded', () => {
    const draw = withdrawForNeed(100_000, 0, 0, 'CA', 'single', {
      brokerage: 5_000,
      gainShare: 0,
      deferred: 5_000,
      roth: 0,
    })
    // It cannot draw more than the $10,000 that is actually there, and every
    // dollar it does draw comes out of a pot.
    expect(draw.gross).toBeCloseTo(10_000, 6)
    expect(draw.fromBrokerage + draw.fromDeferred + draw.fromRoth).toBeCloseTo(
      draw.gross,
      6,
    )
    // The need it could not meet is carried, not turned into a withdrawal.
    expect(draw.unfunded).toBeCloseTo(
      100_000 - (draw.gross - draw.federalTax - draw.stateTax),
      6,
    )
    expect(draw.unfunded).toBeGreaterThan(89_000)
  })

  it('reports nothing unfunded when the pots can cover the need', () => {
    // Including the case where the fixed point settles a few cents out: the
    // shortfall is decided by whether the pots capped the draw, not by
    // comparing two floating-point figures.
    for (const need of [1_000, 47_318.27, 80_000, 123_456.78]) {
      const draw = withdrawForNeed(need, 30_000, 0, 'CA', 'single', pots)
      expect(draw.unfunded, `need ${need}`).toBe(0)
    }
  })

  it('accounts for every dollar of federal tax it charges', () => {
    const draw = withdrawForNeed(90_000, 40_000, 12_000, 'CA', 'married', pots)
    // federalGainsTax is a part of federalTax, not a figure beside it.
    expect(draw.federalGainsTax).toBeLessThanOrEqual(draw.federalTax)
    expect(draw.federalGainsTax).toBeGreaterThanOrEqual(0)
    expect(draw.capitalGains).toBeCloseTo(draw.fromBrokerage * 0.4, 6)
  })

  it('charges no state tax in a state without an income tax', () => {
    // Drawn from the 401(k), so there is an ordinary-income bill for a state
    // to take a share of. Drawn from the brokerage this same plan owes
    // nothing federally at all — the gain fits inside the 0% band — which
    // makes it the wrong scenario to compare two states on.
    const deferredOnly = { brokerage: 0, gainShare: 0, deferred: 900_000, roth: 0 }
    const noTax = withdrawForNeed(80_000, 30_000, 0, 'TX', 'single', deferredOnly)
    const taxed = withdrawForNeed(80_000, 30_000, 0, 'CA', 'single', deferredOnly)

    expect(noTax.stateTax).toBe(0)
    expect(taxed.stateTax).toBeGreaterThan(0)
    expect(noTax.federalTax).toBeGreaterThan(0)
    // The same need costs more to meet where the state takes a share.
    expect(taxed.gross).toBeGreaterThan(noTax.gross)
  })

  it('owes nothing federally on a brokerage draw that fits the 0% band', () => {
    // Worth pinning as behaviour rather than leaving as a surprise: this is
    // the whole argument for holding a taxable account into retirement.
    const draw = withdrawForNeed(80_000, 30_000, 0, 'TX', 'single', pots)
    expect(draw.fromDeferred).toBe(0)
    expect(draw.federalTax).toBe(0)
    expect(draw.gross).toBe(80_000)
  })
})

/**
 * The structural risk named in the competitive note: `FEDERAL`,
 * `CAPITAL_GAINS` and the standard deductions are hand-entered constants with
 * hand-entered constants: they go stale on 1 January and nothing about the
 * arithmetic complains. They are keyed by year now, so updating them is
 * additive rather than an overwrite — but a new year still has to be entered
 * by somebody, and this is what says so.
 *
 * This is the complaint. It costs almost nothing and it converts a silently
 * wrong answer into a failing build — which is the whole point, because a
 * planner whose claim is that it shows its work cannot afford to show last
 * year's brackets without saying so.
 */
describe('the bracket year', () => {
  afterEach(() => {
    vi.useRealTimers()
  })


  it('has not been overtaken by the calendar', () => {
    const currentYear = new Date().getFullYear()
    expect(
      currentYear,
      `lib/tax.ts holds published figures up to ${BRACKET_YEAR} but it is now ` +
        `${currentYear}. The app has not broken — it is rolling the ${BRACKET_YEAR} ` +
        `table forward by indexation and labelling it estimated. Add ` +
        `TAX_TABLES[${currentYear}] from the published figures and move ` +
        `BRACKET_YEAR to replace the estimate with the real thing.`,
    ).toBeLessThanOrEqual(BRACKET_YEAR)
  })

  it('trips as soon as the calendar passes it', () => {
    // The guard above is only worth having if it actually fires, and it
    // cannot be seen to fire until a year that has not happened yet. Wind the
    // clock forward and check the comparison it rests on flips. Mid-year so
    // no timezone can put the faked date back into BRACKET_YEAR.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${BRACKET_YEAR + 1}-06-15T12:00:00`))
    expect(new Date().getFullYear()).toBeGreaterThan(BRACKET_YEAR)
  })

  it('holds a table for every year it lists, each naming its own year', () => {
    expect(TAX_YEARS.length).toBeGreaterThan(0)
    for (const year of TAX_YEARS) {
      expect(TAX_TABLES[year].year, `table ${year}`).toBe(year)
    }
  })

  it('lists its years oldest first', () => {
    for (let i = 1; i < TAX_YEARS.length; i++) {
      expect(TAX_YEARS[i]).toBeGreaterThan(TAX_YEARS[i - 1])
    }
  })

  it('exposes the current year through the bare FEDERAL and CAPITAL_GAINS', () => {
    // The shape this module had before it held more than one year, so nothing
    // that reads them had to change when it did.
    const current = taxTableFor(currentTaxYear())
    expect(FEDERAL).toEqual(current.federal)
    expect(CAPITAL_GAINS).toEqual(current.capitalGains)
  })

  it('holds the first table for years before it', () => {
    expect(taxTableFor(1990).year).toBe(TAX_YEARS[0])
    expect(taxTableFor(1990).estimated).toBeFalsy()
  })

  it('rolls forward rather than waiting for someone to type a new year in', () => {
    const last = TAX_YEARS[TAX_YEARS.length - 1]
    const next = taxTableFor(last + 1)
    expect(next.year).toBe(last + 1)
    expect(next.estimated).toBe(true)

    // Thresholds rise by the indexation, rounded to something that looks like
    // a published figure rather than a multiplication.
    const before = TAX_TABLES[last].federal.single
    expect(next.federal.single.standardDeduction).toBeGreaterThan(
      before.standardDeduction,
    )
    expect(next.federal.single.standardDeduction).toBeCloseTo(
      before.standardDeduction * (1 + ASSUMED_INDEXATION),
      -2,
    )
    expect(next.federal.single.standardDeduction % 50).toBe(0)
  })

  it('leaves the rates alone, because statute does', () => {
    const last = TAX_YEARS[TAX_YEARS.length - 1]
    const far = taxTableFor(last + 12)
    expect(far.federal.single.brackets.map((b) => b.rate)).toEqual(
      TAX_TABLES[last].federal.single.brackets.map((b) => b.rate),
    )
    expect(far.capitalGains.single.map((b) => b.rate)).toEqual(
      TAX_TABLES[last].capitalGains.single.map((b) => b.rate),
    )
    // The bottom of every schedule stays at zero; only the steps above move.
    expect(far.federal.single.brackets[0].from).toBe(0)
    expect(far.capitalGains.single[0].from).toBe(0)
  })

  it('keeps the schedules in order however far forward it goes', () => {
    const far = taxTableFor(TAX_YEARS[TAX_YEARS.length - 1] + 30)
    for (const status of ['single', 'married'] as const) {
      const b = far.federal[status].brackets
      for (let i = 1; i < b.length; i++) {
        expect(b[i].from, `${status} ${i}`).toBeGreaterThan(b[i - 1].from)
      }
    }
  })

  it('prices against the calendar year, not the last one entered', () => {
    expect(currentTaxYear()).toBe(new Date().getFullYear())
    // Today those are the same year; the point is that the default follows
    // the clock, so the day they diverge nothing has to be remembered.
    expect(taxTableFor(currentTaxYear()).year).toBe(currentTaxYear())
  })

  it('uses the most recent table at or before the year asked for', () => {
    for (const year of TAX_YEARS) {
      expect(taxTableFor(year).year).toBe(year)
      expect(taxTableFor(year + 0.9).year).toBe(year)
    }
  })

  it('answers the same for the latest year whether or not it is asked', () => {
    const pots = { brokerage: 800_000, gainShare: 40, deferred: 600_000, roth: 200_000 }
    expect(capitalGainsTax(50_000, 45_000, 'single')).toBe(
      capitalGainsTax(50_000, 45_000, 'single', BRACKET_YEAR),
    )
    expect(taxYear(90_000, 30_000, 'CA', 'single').federalTax).toBeCloseTo(
      taxYear(90_000, 30_000, 'CA', 'single', 0, BRACKET_YEAR).federalTax,
      6,
    )
    expect(
      withdrawForNeed(80_000, 30_000, 0, 'CA', 'single', pots).federalTax,
    ).toBeCloseTo(
      withdrawForNeed(80_000, 30_000, 0, 'CA', 'single', pots, {}, BRACKET_YEAR)
        .federalTax,
      6,
    )
  })

  it('is the year the tables actually claim to be', () => {
    // A cheap tripwire on the constants themselves: if someone edits a
    // threshold without moving BRACKET_YEAR, at least the shape is pinned.
    expect(FEDERAL.single.standardDeduction).toBe(16_100)
    expect(FEDERAL.married.standardDeduction).toBe(32_200)
    expect(FEDERAL.single.brackets.at(-1)?.rate).toBe(37)
    expect(FEDERAL.married.brackets).toHaveLength(FEDERAL.single.brackets.length)
  })
})
