import { describe, expect, it } from 'vitest'
import {
  EXPENSE_CATEGORIES,
  splitExpenses,
  categoryTotal,
  emptyExpenses,
  leafKeys,
  totalExpenses,
} from '@/lib/expenses'

const allKeys = EXPENSE_CATEGORIES.flatMap(leafKeys)

describe('the expense categories', () => {
  it('has no duplicate key anywhere', () => {
    // Two lines sharing a key would silently add up as one box, and the total
    // would be short by whichever was typed first.
    expect(new Set(allKeys).size).toBe(allKeys.length)
  })

  it('gives every category either lines or a box of its own, never both', () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(leafKeys(c).length, c.key).toBeGreaterThan(0)
      if (c.items) expect(leafKeys(c)).toEqual(c.items.map((i) => i.key))
      else expect(leafKeys(c)).toEqual([c.key])
    }
  })

  it('starts every figure at nothing', () => {
    // A suggested figure is a number the user did not choose, and it would be
    // carried into the plan by anyone who skipped the line.
    const empty = emptyExpenses()
    expect(Object.keys(empty).sort()).toEqual([...allKeys].sort())
    expect(totalExpenses(empty)).toBe(0)
  })

  it('adds the lines up to the same total the categories do', () => {
    const values = Object.fromEntries(allKeys.map((k, i) => [k, i + 1]))
    const byCategory = EXPENSE_CATEGORIES.reduce(
      (sum, c) => sum + categoryTotal(c, values),
      0,
    )
    expect(totalExpenses(values)).toBe(byCategory)
  })

  it('keeps health out of the monthly spending figure', () => {
    // One figure cannot represent a cost that begins at 65. Someone retiring
    // at 55 who put Medigap and Part D into their spending was charged them
    // for ten years before Medicare began — and charged marketplace cover for
    // those same years on top of it.
    const values = { ...emptyExpenses(), groceries: 800, partB: 200, medigap: 150 }
    const split = splitExpenses(values)
    expect(split.spending).toBe(800)
    expect(split.fromSixtyFive).toBe(350)
    // Nothing is lost in the split: the two halves are still the whole.
    expect(split.spending + split.fromSixtyFive).toBe(totalExpenses(values))
  })

  it('leaves an unknown key out of the total rather than trusting it', () => {
    expect(totalExpenses({ ...emptyExpenses(), notARealLine: 5_000 })).toBe(0)
  })
})

/**
 * These are retirement costs, not today's. The categories always were — nobody
 * pays Medicare Part B at 53 — but the dialog did not say so, and a reader
 * filling it in from memory reaches for what they pay now.
 */
describe('what the notes have to cover', () => {
  const item = (key: string) =>
    EXPENSE_CATEGORIES.flatMap((c) => c.items ?? []).find((i) => i.key === key)

  it('does not ask for cover before 65, because the projection prices it', () => {
    // It briefly did ask. Nobody can price marketplace cover from memory, and
    // `simulate` already knows everything needed to work it out — income, age,
    // household size — so a box here would have been a guess standing in for a
    // calculation. See `healthCoverBefore65` in `lib/retirement.ts`.
    expect(item('marketplace')).toBeUndefined()
    const health = EXPENSE_CATEGORIES.find((c) => c.key === 'health')!
    expect(health.hint).toMatch(/from 65/i)
  })

  it('warns that the Part B surcharge is charged elsewhere', () => {
    // The projection adds `irmaaSurcharge` on top of spending. A reader who
    // enters their surcharged premium here pays it twice.
    expect(item('partB')!.note).toMatch(/surcharge/i)
  })

  it('says the lines that differ most from today differ', () => {
    expect(item('mortgage')!.note).toBeTruthy()
    expect(item('fuel')!.note).toBeTruthy()
  })

  it('keeps notes to the lines that need one', () => {
    // A note on every box is a wall, and a wall is not read. This is a smell
    // test rather than a rule: if it trips, check the notes are earning it.
    const noted = EXPENSE_CATEGORIES.flatMap((c) => c.items ?? []).filter((i) => i.note)
    expect(noted.length).toBeLessThanOrEqual(6)
  })
})
