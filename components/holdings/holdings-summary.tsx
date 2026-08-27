'use client'

import { useMemo } from 'react'

import { annualCosts, annualIncome } from '@/lib/holdings'
import { familyNetWorth } from '@/lib/net-worth'
import type { HouseholdFacts, Register } from '@/lib/balance-sheet'
import { formatCurrency } from '@/lib/retirement'

const money = (v: number) => formatCurrency(v)

/**
 * What the household is worth, across both halves of the balance sheet.
 *
 * The two halves are kept apart everywhere else — liquid balances belong to
 * the plan, illiquid ones to the register — and that separation is exactly
 * what lets this be a plain sum. Nothing appears in both, so there is nothing
 * to net off and no chance of counting a retirement account twice.
 *
 * It reports what is there today. Nothing here is a projection, and nothing
 * here feeds one: whether a holding should reach the retirement plan is still
 * an open question, and a total is not an answer to it.
 */
export function HoldingsSummary({
  household,
  register,
  liquid,
}: {
  household: HouseholdFacts
  register: Register
  /** Savings and investments, from the plan. */
  liquid: number
}) {
  const worth = useMemo(
    () => familyNetWorth(liquid, register.holdings, register.liabilities),
    [liquid, register.holdings, register.liabilities],
  )
  const income = useMemo(() => {
    let cash = 0
    let taxable = 0
    let costs = 0
    for (const h of register.holdings) {
      const i = annualIncome(h, household.currentAge)
      cash += i.cash
      taxable += i.taxable
      costs += annualCosts(h)
    }
    return { cash, taxable, costs }
  }, [register, household])


  const nothingYet = worth.total === 0 && income.cash === 0 && worth.debt === 0

  if (nothingYet) return null

  /**
   * The total, and then its parts.
   *
   * Each part is a label over a figure and nothing else. They used to carry a
   * line of explanation apiece — "a year, $364 of it taxable", "equity, after
   * $468,000 secured" — which at a sixth of the row wrapped onto two and three
   * lines and left six figures sitting at five different heights. The
   * qualification moved into the label, where it costs no lines at all, and
   * what will not fit a label is on the cell rather than under it.
   */
  const parts: { label: string; value: string; hint: string }[] = [
    {
      label: 'Savings',
      value: money(worth.liquid),
      hint: 'Investments and balances the plan draws on',
    },
    {
      label: 'Other assets',
      value: money(worth.assets - worth.securedDebt),
      hint:
        worth.securedDebt > 0
          ? `Property and belongings, after ${money(worth.securedDebt)} of secured debt`
          : 'Property and belongings, with nothing borrowed against them',
    },
    {
      label: 'Owed',
      value: money(worth.unsecuredDebt),
      hint: 'Loans and cards, over and above anything secured on an asset',
    },
    {
      label: 'Income / yr',
      value: money(income.cash),
      hint: `${money(income.taxable)} of it taxable`,
    },
    {
      label: 'Upkeep / yr',
      value: money(income.costs),
      hint: 'Tax, insurance, maintenance and mortgage interest on what you own',
    },
  ]

  const cells = [
    {
      label: 'Net worth',
      value: money(worth.total),
      hint:
        worth.debt > 0
          ? `Everything you hold, after ${money(worth.debt)} of debt`
          : 'Everything you hold, with nothing owed against it',
    },
    ...parts,
  ]

  return (
    // Six equal columns across the whole row. A flex row with the total on the
    // left and the parts beside it left the right-hand third empty on a wide
    // screen, because flex items take the width they need and stop. Fractions
    // divide the row instead, so the last figure ends where the card does.
    // Pinned under the site header rather than scrolling away.
    //
    // These figures move as you type — a balance in the Saving tile changes
    // net worth on the keystroke — and the tile was above the fold while the
    // fields that change it were below it, so the one thing worth watching was
    // the one thing off screen.
    //
    // Sticky rather than something that appears while typing and leaves after:
    // a panel that comes and goes is a second thing to track, and the moment it
    // appears is the moment it covers what you were looking at. This does not
    // move at all — it stops at the top and stays where it already was.
    //
    // `top-16` clears the header, which is h-16 and sticky itself. Not pinned
    // below `sm`: two rows of figures plus the header would take a third of a
    // phone screen, and there the fields are one column anyway, so less of the
    // page is scrolled past to reach them.
    <div className="z-30 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-card/95 px-5 py-3.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur sm:sticky sm:top-16 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map((c, i) => (
        <div key={c.label} className="flex min-w-0 flex-col" title={c.hint}>
          <span className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
            {c.label}
          </span>
          {/* The total is set in the display face and the five parts are not,
              which marks it out without making its cell a different height —
              a larger size would, and the row would stop being a row. */}
          <span
            className={
              i === 0
                ? 'truncate font-serif text-xl leading-tight tabular-nums text-foreground'
                : 'truncate text-xl leading-tight tabular-nums text-foreground'
            }
          >
            {c.value}
          </span>
        </div>
      ))}
    </div>
  )
}
