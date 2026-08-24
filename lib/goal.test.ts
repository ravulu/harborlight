import { describe, expect, it } from 'vitest'
import { goalInputs, reachGoal } from '@/lib/goal'
import { DEFAULT_INPUTS, simulate } from '@/lib/retirement'

const midCareer = goalInputs({
  currentAge: 40,
  retirementAge: 65,
  brokerageBalance: 120_000,
  monthlyContribution: 600,
})

const young = goalInputs({
  currentAge: 25,
  retirementAge: 65,
  brokerageBalance: 0,
  monthlyContribution: 400,
})

const nearlyThere = goalInputs({
  currentAge: 55,
  retirementAge: 67,
  brokerageBalance: 700_000,
  monthlyContribution: 2_000,
})

const lever = (g: NonNullable<ReturnType<typeof reachGoal>>, kind: string) =>
  g.levers.find((l) => l.kind === kind)!

describe('reachGoal', () => {
  it('refuses a target that cannot be asked about', () => {
    expect(reachGoal(midCareer, 0)).toBeNull()
    expect(reachGoal(midCareer, -5)).toBeNull()
    expect(reachGoal(goalInputs({ currentAge: 65, retirementAge: 65 }), 1_000)).toBeNull()
  })

  it('offers all four levers, every time', () => {
    const g = reachGoal(midCareer, 1_000_000)!
    expect(g.levers.map((l) => l.kind)).toEqual(['save', 'wait', 'lump', 'risk'])
  })

  it('reports where the plan already stands, as one figure', () => {
    const g = reachGoal(midCareer, 1_000_000)!
    // The same number the derivation adds up to, so the box and its working
    // cannot disagree.
    expect(g.reached).toBeCloseTo(g.steady, 6)
    expect(g.reached).toBeCloseTo(g.fromPrincipal + g.fromContributions, 6)
  })

  it('solves a lever to something that genuinely reaches the target', () => {
    const g = reachGoal(midCareer, 1_000_000)!
    const save = lever(g, 'save')
    expect(save.needed).not.toBeNull()
    const reached = simulate({
      ...midCareer,
      monthlyContribution: save.needed!,
    }).balanceAtRetirement
    expect(reached).toBeGreaterThanOrEqual(1_000_000)
  })

  it('says what a lever reaches when it cannot reach the target', () => {
    const g = reachGoal(midCareer, 1_000_000)!
    for (const l of g.levers) {
      if (l.needed !== null) {
        expect(l.atMax, `${l.kind}`).toBeUndefined()
        continue
      }
      // A lever that runs out is still a finding, and the finding is a number.
      expect(l.atMax, `${l.kind}`).toBeGreaterThan(0)
      expect(l.maxValue, `${l.kind}`).toBeGreaterThan(0)
      expect(l.atMax!, `${l.kind}`).toBeLessThan(1_000_000)
    }
  })

  it('splits the balance into what you put in and what growth added', () => {
    const g = reachGoal(young, 1_000_000)!
    // The two halves reconcile to the run they came from, so a reader can
    // check the split rather than take it on trust.
    expect(g.contributed + g.growth).toBeCloseTo(g.reachedOnPaper, 4)
    // Forty years of compounding: growth does more of the work than the saver.
    expect(g.growth).toBeGreaterThan(g.contributed)
  })

  it('shows less growth for a shorter run, which is the whole lesson', () => {
    const early = reachGoal(young, 1_000_000)!
    const late = reachGoal(nearlyThere, 1_000_000)!
    const share = (g: typeof early) => g.growth / (g.contributed + g.growth)
    expect(share(early)).toBeGreaterThan(share(late))
  })

  it('does not adjust for inflation at all', () => {
    // A savings target is a simpler question than a retirement, and answering
    // it with two different meanings of a dollar makes it harder rather than
    // more accurate. The rate typed in is the rate the money grows at.
    expect(midCareer.inflationRate).toBe(0)
    const g = reachGoal(midCareer, 1_000_000)!
    expect(g.rate).toBe(midCareer.preRetirementReturn)
  })

  it('knows when the plan is already there', () => {
    const g = reachGoal(nearlyThere, 500_000)!
    expect(g.alreadyThere).toBe(true)
    expect(g.reached).toBeGreaterThanOrEqual(500_000)
  })

  it('leaves the plan it was given untouched', () => {
    const before = JSON.stringify(midCareer)
    reachGoal(midCareer, 1_000_000)
    expect(JSON.stringify(midCareer)).toBe(before)
  })
})

describe('goalInputs', () => {
  it('starts from the planner defaults, so the two agree downstream', () => {
    const g = goalInputs({ currentAge: 30 })
    expect(g.currentAge).toBe(30)
    // Balances start empty — this page asks for them rather than assuming.
    expect(g.balance401k).toBe(0)
    expect(g.brokerageBalance).toBe(0)
    // The return assumption is the planner's own, so a figure worked out here
    // and one worked out there start from the same place.
    expect(g.preRetirementReturn).toBe(DEFAULT_INPUTS.preRetirementReturn)
    // Inflation is the deliberate exception: this page does not adjust.
    expect(g.inflationRate).toBe(0)
    // And it produces a plan the projection accepts.
    expect(simulate(g).rows.length).toBeGreaterThan(0)
  })
})

/**
 * The derivation shown under "where you stand".
 *
 * The page claims two figures add to a third and that both grow at a stated
 * rate. A reader who checks that on paper has to find it true, or the claim to
 * show its working is worse than not making it.
 */
describe('the arithmetic the page shows', () => {
  const g = reachGoal(midCareer, 1_000_000)!

  it('splits into a principal part and a contributions part', () => {
    expect(g.fromPrincipal).toBeGreaterThan(0)
    expect(g.fromContributions).toBeGreaterThan(0)
  })

  it('adds those two to the steady total, exactly', () => {
    expect(g.fromPrincipal + g.fromContributions).toBeCloseTo(g.steady, 6)
  })

  it('grows the principal at exactly the rate it says it does', () => {
    // The page tells the reader both lines grow at the rate they set. This is
    // that sentence, checked against the closed form anyone would use.
    expect(g.fromPrincipal).toBeCloseTo(
      midCareer.brokerageBalance * Math.pow(1 + g.rate / 100, g.years),
      0,
    )
  })

  it('models no market variation, so the figure is arithmetic', () => {
    expect(midCareer.preRetirementVolatility).toBe(0)
    // Which is what lets the box and its working be the same number.
    expect(g.reached).toBeCloseTo(g.steady, 6)
  })
})
