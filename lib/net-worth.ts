import { netWorth as holdingsWorth, type Holding } from '@/lib/holdings'
import { totalOwed, type Liability } from '@/lib/liabilities'

/**
 * What the household is worth, across both halves of the balance sheet.
 *
 * The first join between the plan and the register, and it is a plain sum
 * because of the ownership rule: liquid balances belong to `PlanInputs`,
 * illiquid ones to `Holding`, and nothing appears in both. There is no
 * reconciliation step, and no way for a retirement account to be counted
 * twice.
 *
 * Debt is counted once. A mortgage or a car loan has already come off the
 * equity of the thing it is secured against; only the unsecured rest is
 * subtracted here.
 *
 * A statement of today, not a projection. Nothing here reaches the retirement
 * plan, and whether it should is still an open question.
 */
export interface FamilyNetWorth {
  /** Savings and investments, from the plan. */
  liquid: number
  /** What the register holds, before anything borrowed against it. */
  assets: number
  /** Borrowed against something on the register. */
  securedDebt: number
  /** Borrowed against nothing. */
  unsecuredDebt: number
  /** Every debt, however it is secured. */
  debt: number
  /** liquid + assets − debt. */
  total: number
}

export function familyNetWorth(
  liquid: number,
  holdings: Holding[],
  liabilities: Liability[],
): FamilyNetWorth {
  const worth = holdingsWorth(holdings)
  const unsecuredDebt = totalOwed(liabilities)
  // `worth.total` is already net of the debt secured against it, so adding the
  // gross back and subtracting every debt once keeps the parts legible without
  // changing the answer.
  const assets = worth.total + worth.debt

  return {
    liquid,
    assets,
    securedDebt: worth.debt,
    unsecuredDebt,
    debt: worth.debt + unsecuredDebt,
    total: liquid + assets - worth.debt - unsecuredDebt,
  }
}
