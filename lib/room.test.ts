import { describe, expect, it } from 'vitest'
import { CLIFF, povertyLine } from '@/lib/aca'
import { LOOKBACK_YEARS, MEDICARE_AGE } from '@/lib/irmaa'
import { DEFAULT_INPUTS, type PlanInputs, simulate } from '@/lib/retirement'
import { roomByYear, segmentsFor } from '@/lib/room'
import { FEDERAL } from '@/lib/tax'

const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({
  ...DEFAULT_INPUTS,
  taxState: 'CA',
  currentAge: 54,
  retirementAge: 55,
  endAge: 90,
  balance401k: 1_500_000,
  brokerageBalance: 200_000,
  monthlyRetirementSpending: 4_000,
  socialSecurityAge: 70,
  ...over,
})

describe('the window itself', () => {
  it('opens when work stops and closes before distributions begin', () => {
    const w = roomByYear(plan())!
    expect(w.fromAge).toBe(55)
    expect(w.closesAt).toBe(75)
    expect(w.toAge).toBe(74)
    expect(w.years[0].age).toBe(55)
    expect(w.years.at(-1)!.age).toBe(74)
  })

  it('opens today for somebody already retired', () => {
    // Not at the retirement age they typed, which is in the past. The room
    // exists now, and a window that started five years ago is not one anybody
    // can spend.
    const w = roomByYear(plan({ currentAge: 60, retirementAge: 55 }))!
    expect(w.fromAge).toBe(60)
  })

  it('has no window at all past the required age', () => {
    expect(roomByYear(plan({ currentAge: 76, retirementAge: 77 }))).toBeNull()
  })
})

describe('which limits apply, and when', () => {
  it('leaves the subsidy out once Medicare has started', () => {
    const w = roomByYear(plan())!
    for (const y of w.years) {
      const hasAca = y.ceilings.some((c) => c.kind === 'aca')
      expect(hasAca, `age ${y.age}`).toBe(y.age < MEDICARE_AGE)
    }
  })

  it('leaves it out entirely for a household covered another way', () => {
    const w = roomByYear(plan({ healthCoverBefore65: 'none' }))!
    expect(w.years.some((y) => y.ceilings.some((c) => c.kind === 'aca'))).toBe(
      false,
    )
  })

  it('brings the Medicare tier in two years before Medicare, not at it', () => {
    // A surcharge is set by the income of two years earlier, so the first year
    // a choice can cause one is 63. Showing a tier at 55 would invent a
    // constraint that does not exist yet.
    const w = roomByYear(plan())!
    for (const y of w.years) {
      const hasIrmaa = y.ceilings.some((c) => c.kind === 'irmaa')
      expect(hasIrmaa, `age ${y.age}`).toBe(
        y.age >= MEDICARE_AGE - LOOKBACK_YEARS,
      )
    }
  })

  it('puts the cliffs and the slopes on the right side', () => {
    const w = roomByYear(plan())!
    for (const y of w.years) {
      for (const c of y.ceilings) {
        const shouldBeCliff = c.kind === 'aca' || c.kind === 'irmaa'
        expect(c.edge, `${y.age} ${c.kind}`).toBe(
          shouldBeCliff ? 'cliff' : 'slope',
        )
        // The types keep these apart, so this checks the shape rather than a
        // flag: a slope carries the two rates it sits between, a cliff carries
        // what forfeiting costs.
        if (c.edge === 'slope') {
          expect(c.to, `${y.age} ${c.kind}`).toBeGreaterThan(c.from)
        } else {
          expect(c.cost, `${y.age} ${c.kind}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('puts the subsidy cliff at four times the poverty line', () => {
    const w = roomByYear(plan())!
    const aca = w.years[0].ceilings.find((c) => c.kind === 'aca')!
    expect(aca.at).toBeCloseTo(povertyLine(1) * CLIFF, 0)
  })
})

describe('a limit nobody would stop for is not reported', () => {
  it('never offers the two-point step from 10% to 12%', () => {
    // The first version of this reported the nearest boundary of any size, and
    // this one bound nearly every year of every plan while a subsidy cliff
    // forty thousand dollars behind it went unmentioned.
    const brackets = FEDERAL.single.brackets
    const tenToTwelve = brackets[1].from
    const w = roomByYear(plan())!
    for (const y of w.years) {
      const band = y.ceilings.find((c) => c.kind === 'bracket')
      if (band) expect(band.at, `age ${y.age}`).not.toBe(tenToTwelve)
    }
  })

  it('reports only steps that move a rate by five points or more', () => {
    const w = roomByYear(plan())!
    for (const y of w.years) {
      for (const c of y.ceilings) {
        if (c.edge === 'slope')
          expect(c.to - c.from, `${y.age}`).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('measures the step against the band beneath the boundary', () => {
    // Not against wherever the income happens to sit. What crossing costs is
    // the difference between the rate on the next dollar and the rate it
    // would otherwise have paid.
    const w = roomByYear(plan())!
    const band = w.years[0].ceilings.find((c) => c.kind === 'bracket')!
    const brackets = FEDERAL.single.brackets
    const i = brackets.findIndex((b) => b.from === band.at)
    expect(band.edge).toBe('slope')
    if (band.edge !== 'slope') return
    expect(band.from).toBe(brackets[i - 1].rate)
    expect(band.to).toBe(brackets[i].rate)
  })
})

describe('each limit is measured in its own terms', () => {
  const converting = plan({
    conversionAnnual: 35_000,
    conversionFromAge: 55,
    conversionToAge: 74,
  })

  it('does not share one floor across limits that do not share a measure', () => {
    // Brackets are read against taxable income, the subsidy against household
    // income for the credit. Flattening them into one figure would be the kind
    // of tidiness that produces wrong answers.
    const w = roomByYear(plan())!
    const y = w.years[0]
    const aca = y.ceilings.find((c) => c.kind === 'aca')!
    const band = y.ceilings.find((c) => c.kind === 'bracket')!
    expect(aca.floor).not.toBeCloseTo(band.floor, 0)
    // The bracket floor is the lower of the two by the standard deduction,
    // which the subsidy measure does not take.
    expect(band.floor).toBeLessThan(aca.floor)
  })

  it('takes the conversion out of every floor and reports it as a claim', () => {
    const w = roomByYear(converting)!
    const rows = simulate(converting).rows
    for (const y of w.years) {
      const row = rows.find((r) => r.age === y.age)!
      expect(y.claimed, `age ${y.age}`).toBeCloseTo(row.conversion, 0)
      const irmaa = y.ceilings.find((c) => c.kind === 'irmaa')
      // The Medicare measure is the row's own MAGI, so the floor is that less
      // the conversion — a choice rather than a fact of the year.
      if (irmaa) {
        expect(irmaa.floor, `age ${y.age}`).toBeCloseTo(
          row.magi - row.conversion,
          0,
        )
      }
    }
  })

  it('reports no room rather than negative room once a year is over', () => {
    const w = roomByYear(converting)!
    const over = w.years.filter((y) => y.room === 0)
    // This plan converts hard enough to clear the subsidy cliff outright in
    // the years before Medicare, which is the finding rather than a fault.
    expect(over.length).toBeGreaterThan(0)
    for (const y of w.years) {
      expect(y.room, `age ${y.age}`).toBeGreaterThanOrEqual(0)
      for (const c of y.ceilings) expect(c.room).toBeGreaterThanOrEqual(0)
    }
  })

  it('can claim more than the window holds, and says so', () => {
    const w = roomByYear(converting)!
    expect(w.totalClaimed).toBeGreaterThan(w.totalRoom)
  })
})

describe('the binding limit', () => {
  it('is the nearest of the ones that apply', () => {
    const w = roomByYear(plan())!
    for (const y of w.years) {
      expect(y.binding).toBe(y.ceilings[0])
      expect(y.room).toBe(y.binding!.room)
      for (const c of y.ceilings) {
        expect(c.room, `age ${y.age}`).toBeGreaterThanOrEqual(y.room)
      }
    }
  })

  it('is the subsidy cliff for a plan retiring long before Medicare', () => {
    // The whole shape of the early-retirement window: the credit is means
    // tested far below where the tax bands start to bite, so it is the
    // subsidy rather than the tax that decides how much room a year has.
    const w = roomByYear(plan())!
    const early = w.years.filter((y) => y.age < MEDICARE_AGE)
    expect(early.every((y) => y.binding?.kind === 'aca')).toBe(true)
  })

  it('and the nil capital-gains band for one retiring straight onto it', () => {
    const w = roomByYear(
      plan({ currentAge: 65, retirementAge: 66, balance401k: 900_000 }),
    )!
    expect(w.years.every((y) => y.binding?.kind === 'gains')).toBe(true)
  })

  it('sums the window on the binding limit of each year', () => {
    const w = roomByYear(plan())!
    expect(w.totalRoom).toBeCloseTo(
      w.years.reduce((a, y) => a + y.room, 0),
      0,
    )
    expect(w.totalRoom).toBeGreaterThan(0)
  })
})

describe('what claims the room', () => {
  const converting = plan({
    conversionAnnual: 35_000,
    conversionFromAge: 55,
    conversionToAge: 74,
  })

  it('is a list, so a second claimant does not need the shape rebuilt', () => {
    const w = roomByYear(converting)!
    for (const y of w.years) {
      expect(y.claims.length).toBe(1)
      expect(y.claims[0].kind).toBe('conversion')
      expect(y.claimed).toBeCloseTo(y.claims[0].amount, 0)
    }
  })

  it('leaves a year that claims nothing with no claims, not a zero', () => {
    // An empty list reads as untouched. A list holding zero reads as a
    // decision that happened to come to nothing, which is a different thing.
    const w = roomByYear(plan())!
    for (const y of w.years) {
      expect(y.claims, `age ${y.age}`).toEqual([])
      expect(y.claimed).toBe(0)
    }
    expect(w.claimedBy).toEqual([])
  })

  it('totals each kind across the window', () => {
    const w = roomByYear(converting)!
    expect(w.claimedBy.length).toBe(1)
    const [conversions] = w.claimedBy
    expect(conversions.kind).toBe('conversion')
    expect(conversions.total).toBeCloseTo(w.totalClaimed, 0)
    expect(conversions.total).toBeCloseTo(
      w.years.reduce((a, y) => a + y.claimed, 0),
      0,
    )
  })
})

describe('a year drawn as a bar', () => {
  const shapes = [
    plan(),
    plan({ conversionAnnual: 35_000, conversionFromAge: 55, conversionToAge: 74 }),
    plan({ conversionAnnual: 200_000, conversionFromAge: 55, conversionToAge: 74 }),
    plan({ currentAge: 65, retirementAge: 66, balance401k: 900_000 }),
    plan({ healthCoverBefore65: 'none' }),
  ]

  it('always fills its own width exactly, never more', () => {
    // The first version summed past the full width whenever a year's floor was
    // already over its limit, so the bar ran off its own track in exactly the
    // years most worth looking at.
    for (const p of shapes) {
      const w = roomByYear(p)
      if (!w) continue
      for (const y of w.years) {
        const s = segmentsFor(y)
        expect(s.floor + s.fits + s.spare + s.over, `age ${y.age}`).toBeCloseTo(
          s.scale,
          6,
        )
        for (const part of [s.floor, s.fits, s.spare, s.over]) {
          expect(part, `age ${y.age}`).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('splits a claim at the limit rather than drawing it whole', () => {
    const w = roomByYear(shapes[2])!
    const spilling = w.years.filter((y) => segmentsFor(y).over > 0)
    // This plan converts far more than any year can take, so most of the
    // window is over — which is the finding rather than a fault.
    expect(spilling.length).toBeGreaterThan(0)
    for (const y of w.years) {
      const s = segmentsFor(y)
      expect(s.fits + s.over, `age ${y.age}`).toBeCloseTo(y.claimed, 6)
      // Nothing is both spare and claimed: room the claims took is not room.
      if (s.over > 0) expect(s.spare).toBe(0)
    }
  })

  it('leaves the whole bar spare when nothing claims the year', () => {
    const w = roomByYear(plan())!
    for (const y of w.years) {
      const s = segmentsFor(y)
      expect(s.fits).toBe(0)
      expect(s.over).toBe(0)
      expect(s.floor + s.spare).toBeCloseTo(s.scale, 6)
    }
  })
})

describe('what crossing a limit costs', () => {
  it('states the Medicare threshold in the same money as the income', () => {
    // The thresholds are indexed, so a future year's are larger in name
    // without being larger in substance. Tested against a real income they
    // made the room grow every year for no reason but the passage of time —
    // 41% too much by 69 on a plan retiring at 55.
    const w = roomByYear(plan())!
    const tiers = w.years
      .map((y) => y.ceilings.find((c) => c.kind === 'irmaa'))
      .filter((c) => c !== undefined)
    expect(tiers.length).toBeGreaterThan(5)
    // In today's dollars the same tier holds roughly still. Nominal ones climb
    // by the indexation rate every year and would fail this outright.
    const first = tiers[0]!.at
    const last = tiers.at(-1)!.at
    expect(Math.abs(last - first) / first).toBeLessThan(0.05)
  })

  it('agrees with the surcharge the projection actually charges', () => {
    // Both convert real income into the table's money before testing it. When
    // only one of them did, this table and the tax tab beside it disagreed
    // about the same threshold.
    const p = plan({ currentAge: 54, retirementAge: 55, inflationRate: 4 })
    const w = roomByYear(p)!
    const rows = simulate(p).rows
    for (const y of w.years) {
      const tier = y.ceilings.find((c) => c.kind === 'irmaa')
      if (!tier) continue
      const row = rows.find((r) => r.age === y.age)!
      // Below the next tier, so nothing is charged two years later.
      if (row.magi < tier.at) {
        const later = rows.find((r) => r.age === y.age + LOOKBACK_YEARS)
        if (later) expect(later.irmaaSurcharge, `age ${y.age}`).toBe(0)
      }
    }
  })

  it('prices the subsidy cliff at the credit that year is receiving', () => {
    const w = roomByYear(plan())!
    const rows = simulate(plan()).rows
    for (const y of w.years) {
      const aca = y.ceilings.find((c) => c.kind === 'aca')
      if (!aca || aca.edge !== 'cliff') continue
      const row = rows.find((r) => r.age === y.age)!
      // A household getting little help loses little by crossing, which is
      // more use than quoting the price of a policy they mostly paid for.
      expect(aca.cost, `age ${y.age}`).toBeCloseTo(row.healthSubsidy, 6)
    }
  })

  it('prices a Medicare step as a real yearly amount for the household', () => {
    const w = roomByYear(plan())!
    const steps = w.years
      .map((y) => y.ceilings.find((c) => c.kind === 'irmaa'))
      .filter((c) => c?.edge === 'cliff')
    expect(steps.length).toBeGreaterThan(0)
    for (const c of steps) {
      // A tier step is hundreds to low thousands a year per person. Anything
      // outside that is a conversion gone wrong rather than a real premium.
      expect(c!.cost).toBeGreaterThan(100)
      expect(c!.cost).toBeLessThan(20_000)
    }
  })
})
