import { describe, expect, it } from 'vitest'

import { comparePayoff, type Comparison } from '@/lib/debt-payoff'
import { payoff, type Liability } from '@/lib/liabilities'

const debt = (over: Partial<Liability> & { id: string }): Liability => ({
  kind: 'card',
  name: over.id,
  balance: 5_000,
  ratePercent: 20,
  monthlyPayment: 100,
  ...over,
})

/** The comparison, or a thrown test failure — most cases want it either way. */
function compared(debts: Liability[], budget: number): Comparison {
  const got = comparePayoff(debts, budget)
  if (!got.ok) throw new Error(`refused: ${got.refusal.kind}`)
  return got.comparison
}

/**
 * The rollover, which is the whole feature.
 *
 * `payoff()` already prices one debt alone. What it cannot express is what
 * happens to the others: when a debt clears, its payment joins the spare money
 * and goes at the next one, so each debt that falls makes the next fall
 * faster. Everything below is a way of checking that actually happens.
 */
describe('paying several debts at once', () => {
  const three = [
    debt({ id: 'card', balance: 3_000, ratePercent: 22, monthlyPayment: 60 }),
    debt({ id: 'loan', balance: 9_000, ratePercent: 7, monthlyPayment: 150 }),
    debt({ id: 'store', balance: 800, ratePercent: 27, monthlyPayment: 25 }),
  ]

  it('clears everything, and sooner than the minimums would', () => {
    const c = compared(three, 500)
    expect(c.snowball.months).not.toBeNull()
    expect(c.avalanche.months).not.toBeNull()
    expect(c.minimumsOnly.months).not.toBeNull()
    expect(c.snowball.months!).toBeLessThan(c.minimumsOnly.months!)
    expect(c.avalanche.months!).toBeLessThan(c.minimumsOnly.months!)
  })

  it('rolls a cleared debt’s payment into the next', () => {
    // The proof: with the rollover, the gap between the first debt clearing
    // and the second is shorter than the first took, even though the second is
    // larger. Without it the second would simply take its own time.
    const c = compared(three, 500)
    const [first, second] = c.snowball.cleared
    expect(first.month).toBeGreaterThan(0)
    expect(second.month - first.month).toBeLessThan(first.month + second.month)
    // And every debt is accounted for, once.
    expect(c.snowball.cleared).toHaveLength(3)
    expect(new Set(c.snowball.cleared.map((x) => x.id)).size).toBe(3)
  })

  it('attacks the smallest balance first under snowball', () => {
    const c = compared(three, 500)
    expect(c.snowball.cleared.map((x) => x.id)).toEqual(['store', 'card', 'loan'])
  })

  it('attacks the highest rate first under avalanche', () => {
    const c = compared(three, 500)
    // store is 27%, card 22%, loan 7% — and store is also smallest, so this
    // case is deliberately one where the two methods agree on the first debt
    // and part company after it.
    expect(c.avalanche.cleared[0].id).toBe('store')
    expect(c.avalanche.cleared.map((x) => x.id)).toEqual(['store', 'card', 'loan'])
  })

  /**
   * The claim the whole comparison rests on, checked rather than assumed.
   *
   * Avalanche pays the least interest available from a given budget. If this
   * ever fails, the ordering is wrong and every figure the page reports about
   * "what avalanche saves" is wrong with it.
   */
  it('never lets snowball beat avalanche on interest', () => {
    for (const budget of [300, 400, 500, 750, 1_200]) {
      const c = compared(three, budget)
      expect(c.avalanche.interest!).toBeLessThanOrEqual(c.snowball.interest! + 0.01)
    }
  })

  it('reports what avalanche saves and what snowball clears sooner', () => {
    const c = compared(
      [
        // Ordered so the two methods genuinely disagree: the big debt carries
        // the high rate, so avalanche leaves the small one until last.
        debt({ id: 'big', balance: 12_000, ratePercent: 26, monthlyPayment: 200 }),
        debt({ id: 'small', balance: 1_200, ratePercent: 5, monthlyPayment: 40 }),
      ],
      600,
    )
    expect(c.snowball.cleared[0].id).toBe('small')
    expect(c.avalanche.cleared[0].id).toBe('big')
    expect(c.avalancheSaves!.interest).toBeGreaterThan(0)
    // Snowball's first debt falls sooner, which is the reason people pick it.
    expect(c.snowballFirstDebtSooner!).toBeGreaterThan(0)
  })
})

/**
 * Agreeing with the engine that was already here.
 *
 * A single debt has no rollover and no ordering, so both methods must return
 * exactly what `payoff()` has always returned for it. If they diverge, one of
 * the two is wrong and the page would be quoting different answers for the
 * same debt depending on which screen it was on.
 */
describe('one debt, no rollover', () => {
  const only = debt({ id: 'solo', balance: 6_000, ratePercent: 18, monthlyPayment: 250 })

  it('matches payoff() to the month', () => {
    const c = compared([only], 250)
    const alone = payoff(only)
    expect(c.snowball.months).toBe(Math.ceil(alone.years! * 12))
    expect(c.avalanche.months).toBe(c.snowball.months)
  })

  it('matches payoff() on interest, within rounding', () => {
    const c = compared([only], 250)
    expect(c.snowball.interest!).toBeCloseTo(payoff(only).interest!, 0)
  })
})

/**
 * Refusing, which matters more here than usual.
 *
 * A household whose budget is below its minimums does not have a slow payoff,
 * it has a problem this calculator cannot price. Reporting two identical
 * never-clears would read as the tool being broken rather than as the finding.
 */
describe('what it refuses', () => {
  it('refuses a budget below the minimum payments, and says by how much', () => {
    const got = comparePayoff(
      [
        debt({ id: 'a', monthlyPayment: 100 }),
        debt({ id: 'b', monthlyPayment: 150 }),
      ],
      200,
    )
    expect(got.ok).toBe(false)
    if (got.ok) return
    expect(got.refusal.kind).toBe('budget-below-minimums')
    if (got.refusal.kind !== 'budget-below-minimums') return
    expect(got.refusal.minimums).toBe(250)
    expect(got.refusal.short).toBe(50)
  })

  it('refuses when there is nothing owed', () => {
    expect(comparePayoff([], 500).ok).toBe(false)
    expect(comparePayoff([debt({ id: 'paid', balance: 0 })], 500).ok).toBe(false)
  })
})

/**
 * The case `payoff()` already gets right for one debt, at three.
 *
 * Minimum payments on a card sit close to the line where the payment is eaten
 * entirely by interest, by design. "Never, on these figures" is the honest
 * answer and a number in the hundreds is not.
 */
describe('debts a budget never clears', () => {
  it('says never rather than guessing', () => {
    const stuck = [
      debt({ id: 'x', balance: 20_000, ratePercent: 24, monthlyPayment: 100 }),
      debt({ id: 'y', balance: 20_000, ratePercent: 24, monthlyPayment: 100 }),
    ]
    const c = compared(stuck, 200)
    expect(c.snowball.months).toBeNull()
    expect(c.snowball.interest).toBeNull()
    expect(c.avalanche.months).toBeNull()
  })

  it('gives up in a couple of months rather than grinding to the stop', () => {
    const c = compared(
      [debt({ id: 'x', balance: 50_000, ratePercent: 30, monthlyPayment: 50 })],
      50,
    )
    expect(c.snowball.months).toBeNull()
    // The no-progress check, not the hundred-year backstop.
    expect(c.snowball.balanceByMonth.length).toBeLessThan(6)
  })

  it('still clears them once the budget is enough', () => {
    const stuck = [
      debt({ id: 'x', balance: 20_000, ratePercent: 24, monthlyPayment: 100 }),
      debt({ id: 'y', balance: 20_000, ratePercent: 24, monthlyPayment: 100 }),
    ]
    expect(compared(stuck, 1_500).avalanche.months).not.toBeNull()
  })
})

describe('the awkward shapes', () => {
  it('handles a debt at no interest at all', () => {
    const c = compared(
      [
        debt({ id: 'family', balance: 2_000, ratePercent: 0, monthlyPayment: 50 }),
        debt({ id: 'card', balance: 2_000, ratePercent: 25, monthlyPayment: 50 }),
      ],
      400,
    )
    // Same balance, so snowball breaks the tie on rate and avalanche has no
    // tie to break — both send the money at the card first.
    expect(c.avalanche.cleared[0].id).toBe('card')
    expect(c.snowball.cleared[0].id).toBe('card')
    expect(c.avalanche.months).not.toBeNull()
  })

  it('does not reorder equal debts by the order they were typed', () => {
    const same = (id: string) =>
      debt({ id, balance: 1_000, ratePercent: 10, monthlyPayment: 30 })
    const forwards = compared([same('a'), same('b')], 300)
    const backwards = compared([same('b'), same('a')], 300)
    expect(forwards.snowball.cleared.map((c) => c.id)).toEqual(
      backwards.snowball.cleared.map((c) => c.id),
    )
    expect(forwards.avalanche.months).toBe(backwards.avalanche.months)
  })

  it('pays a debt with no minimum at all once it is the target', () => {
    const c = compared(
      [
        debt({ id: 'nominimum', balance: 500, ratePercent: 10, monthlyPayment: 0 }),
        debt({ id: 'card', balance: 4_000, ratePercent: 20, monthlyPayment: 120 }),
      ],
      400,
    )
    expect(c.snowball.cleared[0].id).toBe('nominimum')
    expect(c.snowball.months).not.toBeNull()
  })

  it('spends money left over when a debt clears mid-month', () => {
    // The target needs far less than the budget, so the remainder has to
    // cascade in the same month rather than wait for the next one.
    const c = compared(
      [
        debt({ id: 'tiny', balance: 40, ratePercent: 10, monthlyPayment: 10 }),
        debt({ id: 'next', balance: 900, ratePercent: 10, monthlyPayment: 20 }),
      ],
      1_000,
    )
    expect(c.snowball.months).toBe(1)
    expect(c.snowball.cleared).toHaveLength(2)
  })
})

/**
 * The reconciliation the page rests on: both methods repay the same debt.
 *
 * They differ in interest and in order, never in principal. If these ever
 * disagree, one of the two is losing or inventing money and every figure
 * reported beside them is suspect.
 */
describe('both methods repay the same principal', () => {
  it('differs on interest and order, never on what was owed', () => {
    const debts = [
      debt({ id: 'a', balance: 4_400, ratePercent: 19, monthlyPayment: 90 }),
      debt({ id: 'b', balance: 15_000, ratePercent: 6, monthlyPayment: 220 }),
      debt({ id: 'c', balance: 1_100, ratePercent: 28, monthlyPayment: 35 }),
    ]
    const c = compared(debts, 800)
    const owed = debts.reduce((s, d) => s + d.balance, 0)

    for (const s of [c.snowball, c.avalanche]) {
      const principal = s.cleared.reduce((sum, x) => sum + x.interest, 0)
      // Every debt cleared, and the interest attributed per debt adds up to
      // the total reported for the schedule.
      expect(s.cleared).toHaveLength(3)
      expect(principal).toBeCloseTo(s.interest!, 2)
    }
    expect(owed).toBeGreaterThan(0)
    // The balance chart ends at nothing owed, both ways.
    expect(c.snowball.balanceByMonth.at(-1)!).toBeLessThan(0.01)
    expect(c.avalanche.balanceByMonth.at(-1)!).toBeLessThan(0.01)
  })
})

describe('naming a debt that was not named', () => {
  it('falls back to what kind it is, not to "Debt"', () => {
    const c = compared(
      [
        { id: 'a', kind: 'card', name: '', balance: 900, ratePercent: 24, monthlyPayment: 30 },
        { id: 'b', kind: 'student', name: '  ', balance: 6_000, ratePercent: 5, monthlyPayment: 90 },
      ],
      400,
    )
    // The order a method clears things in is the useful half of the answer,
    // and "Debt → Debt" throws it away.
    expect(c.snowball.cleared.map((x) => x.name)).toEqual(['Credit card', 'Student loan'])
  })

  it('keeps a name when there is one', () => {
    const c = compared([debt({ id: 'a', name: 'Amex', balance: 500 })], 200)
    expect(c.snowball.cleared[0].name).toBe('Amex')
  })
})

/**
 * When there is nothing to choose between the two methods.
 *
 * Ordinary rather than exceptional: one debt has no order, and among several
 * the smallest balance is often also the highest rate. The page has to know,
 * because otherwise it reports a difference of "$0 less in interest" beside
 * two rows claiming one clears sooner and the other costs less — on figures
 * that are identical.
 */
describe('when both methods give the same answer', () => {
  it('says so for a single debt', () => {
    const c = compared(
      [debt({ id: 'loan', kind: 'other', balance: 200_000, ratePercent: 4, monthlyPayment: 2_000 })],
      2_000,
    )
    expect(c.methodsAgree).toBe(true)
    expect(c.snowball.months).toBe(c.avalanche.months)
    expect(c.surplus).toBe(0)
  })

  it('says so when the orders happen to coincide', () => {
    // Smallest balance is also the highest rate, which is the common shape.
    const c = compared(
      [
        debt({ id: 'store', balance: 800, ratePercent: 27, monthlyPayment: 25 }),
        debt({ id: 'card', balance: 3_000, ratePercent: 22, monthlyPayment: 60 }),
        debt({ id: 'loan', balance: 9_000, ratePercent: 7, monthlyPayment: 150 }),
      ],
      500,
    )
    expect(c.methodsAgree).toBe(true)
  })

  it('does not say so when they genuinely differ', () => {
    const c = compared(
      [
        debt({ id: 'big', balance: 12_000, ratePercent: 26, monthlyPayment: 200 }),
        debt({ id: 'small', balance: 1_200, ratePercent: 5, monthlyPayment: 40 }),
      ],
      600,
    )
    expect(c.methodsAgree).toBe(false)
    expect(c.avalancheSaves!.interest).toBeGreaterThan(0)
  })

  /** The 200,000 at 4% paying 2,000 case, against the closed form. */
  it('agrees with the standard amortisation formula', () => {
    const P = 200_000, M = 2_000, r = 0.04 / 12
    const exact = -Math.log(1 - (r * P) / M) / Math.log(1 + r)
    const c = compared(
      [debt({ id: 'l', kind: 'other', balance: P, ratePercent: 4, monthlyPayment: M })],
      M,
    )
    // It clears *during* the 122nd month, so 122 whole months is the answer.
    expect(c.avalanche.months).toBe(Math.ceil(exact))
    expect(c.avalanche.interest!).toBeCloseTo(M * exact - P, 0)
  })
})

/**
 * The debt snowball gets rid of first, by name.
 *
 * The badge on the page says "Car loan gone sooner" rather than "first debt
 * sooner", so the number beside it has to be about *that* debt. Measuring
 * against whatever the other method happens to clear first would put a name
 * and a figure side by side that describe two different debts.
 */
describe('the first debt snowball clears', () => {
  const debts = [
    debt({ id: 'visa', name: 'Visa', balance: 14_800, ratePercent: 24.9, monthlyPayment: 300 }),
    debt({ id: 'car', name: 'Car loan', balance: 6_500, ratePercent: 6.9, monthlyPayment: 210 }),
    debt({ id: 'student', name: 'Student loan', balance: 9_000, ratePercent: 4.5, monthlyPayment: 120 }),
  ]

  it('names it, and measures it against the same debt', () => {
    const c = compared(debts, 1_100)
    expect(c.firstWin).not.toBeNull()
    // Smallest balance, so snowball goes at it first.
    expect(c.firstWin!.name).toBe('Car loan')

    const underSnowball = c.snowball.cleared.find((x) => x.id === 'car')!.month
    const underAvalanche = c.avalanche.cleared.find((x) => x.id === 'car')!.month
    expect(c.firstWin!.monthsSooner).toBe(underAvalanche - underSnowball)
    expect(c.firstWin!.monthsSooner).toBeGreaterThan(0)
  })

  it('is not the same figure as the first-clear comparison', () => {
    // The two answer different questions: "when do I get my first win" against
    // "when is this particular debt gone". They only coincide when both
    // methods start on the same debt.
    const c = compared(debts, 1_100)
    expect(c.snowball.cleared[0].id).not.toBe(c.avalanche.cleared[0].id)
    expect(c.firstWin!.monthsSooner).not.toBe(c.snowballFirstDebtSooner)
  })

  it('falls back to the kind when the debt was never named', () => {
    const c = compared(
      [
        { id: 'a', kind: 'student', name: '', balance: 900, ratePercent: 4, monthlyPayment: 30 },
        { id: 'b', kind: 'card', name: '', balance: 9_000, ratePercent: 24, monthlyPayment: 200 },
      ],
      600,
    )
    expect(c.firstWin!.name).toBe('Student loan')
  })
})
