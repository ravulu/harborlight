import { describe, expect, it } from 'vitest'
import {
  LIABILITY_KINDS,
  annualInterest,
  payoff,
  totalMonthlyPayments,
  totalOwed,
  type Liability,
} from '@/lib/liabilities'

const debt = (over: Partial<Liability> = {}): Liability => ({
  id: 'l',
  kind: 'card',
  name: 'Card',
  balance: 10_000,
  ratePercent: 22,
  monthlyPayment: 300,
  ...over,
})

describe('the liability list', () => {
  it('names each kind once', () => {
    const kinds = LIABILITY_KINDS.map((k) => k.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('adds up what is owed, ignoring anything negative', () => {
    expect(totalOwed([debt(), debt({ id: '2', balance: 5_000 })])).toBe(15_000)
    // A balance below zero is a data error, not a credit.
    expect(totalOwed([debt({ balance: -400 })])).toBe(0)
  })

  it('adds up what is paid at them each month', () => {
    expect(totalMonthlyPayments([debt(), debt({ id: '2', monthlyPayment: 150 })])).toBe(450)
  })

  it('charges interest on the balance at the stated rate', () => {
    expect(annualInterest(debt())).toBeCloseTo(2_200, 6)
  })
})

/**
 * The answer that matters is how long it takes, and the one worth catching is
 * "never" — a payment at or below the monthly interest clears nothing, because
 * the balance is back where it started before the next one falls due. Minimum
 * payments on a card sit close to that line by design.
 */
describe('how long it takes to clear', () => {
  it('reports never when the payment cannot cover the interest', () => {
    // $10,000 at 22% costs about $183 a month to stand still.
    expect(payoff(debt({ monthlyPayment: 150 })).years).toBeNull()
    expect(payoff(debt({ monthlyPayment: 183 })).years).toBeNull()
  })

  it('clears once the payment gets past it, and slowly at first', () => {
    const barely = payoff(debt({ monthlyPayment: 200 }))
    const double = payoff(debt({ monthlyPayment: 400 }))
    expect(barely.years).not.toBeNull()
    expect(double.years).not.toBeNull()
    // Twice the payment is far more than twice as fast, which is the lesson.
    expect(barely.years!).toBeGreaterThan(double.years! * 2)
  })

  it('reports what carrying it costs on the way', () => {
    const p = payoff(debt({ monthlyPayment: 400 }))
    expect(p.interest).not.toBeNull()
    expect(p.interest!).toBeGreaterThan(0)
    // Paid faster, less interest — the same debt, a different bill.
    expect(payoff(debt({ monthlyPayment: 800 })).interest!).toBeLessThan(p.interest!)
  })

  it('handles a debt charging nothing', () => {
    const p = payoff(debt({ ratePercent: 0, balance: 12_000, monthlyPayment: 1_000 }))
    expect(p.years).toBeCloseTo(1, 6)
    expect(p.interest).toBe(0)
  })

  it('says never when nothing is being paid at it', () => {
    expect(payoff(debt({ monthlyPayment: 0 })).years).toBeNull()
  })

  it('is already clear at nothing owed', () => {
    expect(payoff(debt({ balance: 0 }))).toEqual({ years: 0, interest: 0 })
  })
})
