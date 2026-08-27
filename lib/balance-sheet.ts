import type { Holding } from '@/lib/holdings'
import type { Liability } from '@/lib/liabilities'
import type { FilingStatus } from '@/lib/state-tax'

/**
 * The shapes the household and its balance sheet travel in.
 *
 * Kept out of the server-action file on purpose. A `'use server'` module may
 * only export async functions — a constant beside them fails the whole page at
 * build time, with an error that names the file rather than the export. The
 * event vocabulary hit the same wall and lives apart for the same reason.
 */

export interface HouseholdFacts {
  /** Who this is. Never required — everything works unnamed. */
  name: string
  currentAge: number
  filingStatus: FilingStatus
  taxState: string
}

/**
 * What one plan assumes the household owns and owes.
 *
 * Belongs to the plan, not the person: keeping the rental and selling it are
 * two scenarios, and a household wants to hold both and compare them. Saving
 * the plan saves this with it.
 *
 * Not "the balance sheet" — that is this plus the pots the plan draws down,
 * less every debt, and it is a figure rather than a record.
 */
export interface Register {
  holdings: Holding[]
  liabilities: Liability[]
}

/** The household and one plan's register, which is what a screen needs. */
export interface BalanceSheet {
  household: HouseholdFacts
  holdings: Holding[]
  liabilities: Liability[]
}

export const EMPTY_REGISTER: Register = { holdings: [], liabilities: [] }

/** A household before anybody has said anything about it. */
export const EMPTY_HOUSEHOLD: HouseholdFacts = {
  name: '',
  currentAge: 0,
  filingStatus: 'single',
  taxState: '',
}

export const EMPTY_SHEET: BalanceSheet = {
  household: EMPTY_HOUSEHOLD,
  holdings: [],
  liabilities: [],
}

/**
 * A household with nothing in it.
 *
 * Worth a name because it is the one value that must never be written over a
 * household that has something in it. It says nothing, so storing it cannot
 * add anything — it can only take away what was there.
 *
 * Filing status is left out on purpose: it has a default rather than a blank,
 * so a household is not "filled in" for having one.
 */
export const isBlankHousehold = (h: HouseholdFacts) =>
  !h.name.trim() && h.currentAge === 0 && !h.taxState.trim()
