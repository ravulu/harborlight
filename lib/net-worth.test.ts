import { describe, expect, it } from 'vitest'
import { familyNetWorth } from '@/lib/net-worth'
import type { Holding } from '@/lib/holdings'
import type { Liability } from '@/lib/liabilities'

const home: Holding = {
  id: 'h', kind: 'home', name: 'Home', value: 800_000, basis: 300_000,
  growthPercent: 3, saleAge: null, counted: false, mortgage: 250_000,
}
const car: Holding = {
  id: 'c', kind: 'personal', name: 'Car', value: 40_000, basis: 55_000,
  growthPercent: -10, saleAge: null, counted: false, mortgage: 18_000,
}
const card: Liability = {
  id: 'l', kind: 'card', name: 'Visa', balance: 10_000, ratePercent: 22,
  monthlyPayment: 300,
}

describe('what the family is worth', () => {
  it('is savings plus assets less every debt', () => {
    const w = familyNetWorth(500_000, [home, car], [card])
    expect(w.assets).toBe(840_000)
    expect(w.securedDebt).toBe(268_000)
    expect(w.unsecuredDebt).toBe(10_000)
    expect(w.total).toBe(500_000 + 840_000 - 268_000 - 10_000)
  })

  it('counts a secured debt once, not twice', () => {
    // `netWorth` already takes a mortgage off the equity of the thing it is
    // secured against. Subtracting it again here would double it, and the
    // failure would look like a plausible number rather than an error.
    const withMortgage = familyNetWorth(0, [home], [])
    expect(withMortgage.total).toBe(800_000 - 250_000)
  })

  it('adds up: the parts reported are the total reported', () => {
    // The bar shows the pieces beside the total. If they do not reconcile, a
    // reader checking the arithmetic finds the page wrong about itself.
    const w = familyNetWorth(123_456, [home, car], [card])
    expect(w.liquid + w.assets - w.debt).toBe(w.total)
    expect(w.securedDebt + w.unsecuredDebt).toBe(w.debt)
  })

  it('is just the savings when the register is empty', () => {
    const w = familyNetWorth(500_000, [], [])
    expect(w.total).toBe(500_000)
    expect(w.assets).toBe(0)
    expect(w.debt).toBe(0)
  })

  it('goes negative when the debt is larger than everything', () => {
    // A household owing more than it owns is a real state, and rounding it up
    // to zero would be flattering somebody about the one thing they most need
    // to see.
    const big: Liability = { ...card, balance: 2_000_000 }
    expect(familyNetWorth(100_000, [home], [big]).total).toBeLessThan(0)
  })

  it('does not touch the plan or the register to work it out', () => {
    const holdings = [home, car]
    const liabilities = [card]
    const before = JSON.stringify({ holdings, liabilities })
    familyNetWorth(500_000, holdings, liabilities)
    expect(JSON.stringify({ holdings, liabilities })).toBe(before)
  })
})
