import type { HouseholdFacts, Register } from '@/lib/balance-sheet'
import type { PlanInputs } from '@/lib/retirement'

/**
 * The shape a plan is stored in, whichever end stores it.
 *
 * One interface, two transports: Postgres against an account, or the reader's
 * own browser. Everything above this line — the projection, the compare table,
 * the saved-plans list — reads a `PlanInputs` and has never known which.
 *
 * `docs/persistence-modes.md` carries the design and the reasoning. The four
 * properties that must not slip are repeated here because this is the file
 * somebody edits when they break one.
 */

/** What a plan is, without the parts the store assigns. */
export interface PlanDraft {
  name: string
  personName: string
  inputs: PlanInputs
  /** What this plan assumes the household owns and owes. */
  register: Register
}

/**
 * A plan in a list: enough to name it, open it and compare it.
 *
 * The register is deliberately absent. In the cloud it is two more tables and
 * a query per plan, and the planner already reads it only for the plan being
 * opened — so a `list` that carried registers would be an N+1 against the
 * database to fill a column nobody looks at.
 */
export interface PlanSummary extends Omit<PlanDraft, 'register'> {
  id: number
  /** ISO 8601. The value a later write is checked against — see `update`. */
  updatedAt: string
}

/** One whole plan, including what it assumes is owned. */
export interface StoredPlan extends PlanSummary {
  register: Register
}

/**
 * Thrown when a save would write over a copy that changed underneath it.
 *
 * Only the local store raises it today: two tabs on one browser are its own
 * concurrency problem, and it has no server holding the last word. The cloud
 * store accepts the same argument and ignores it, which is a real gap and is
 * written down rather than hidden — an account open in two browsers has the
 * same race and Postgres is not currently checking for it either.
 */
export class StaleWriteError extends Error {
  constructor(
    readonly id: number,
    /** What the caller believed it was updating. */
    readonly expected: string,
    /** What the store actually holds. */
    readonly found: string,
  ) {
    super(
      `Plan ${id} changed since it was opened (expected ${expected}, found ${found}).`,
    )
    this.name = 'StaleWriteError'
  }
}

export interface PlanStore {
  /** Every plan, newest first. Without registers — see `PlanSummary`. */
  list(): Promise<PlanSummary[]>
  /** One whole plan, or null where there is no such plan to read. */
  get(id: number): Promise<StoredPlan | null>
  /** Keeps a new plan and answers with the id it was given. */
  save(draft: PlanDraft): Promise<number>
  /**
   * Replaces a plan that exists.
   *
   * `expectedUpdatedAt` is what the caller believed it was editing. Passing it
   * turns a silent overwrite into a `StaleWriteError`, which is worth doing
   * wherever the figures came from a screen somebody has had open for a while.
   * Omitting it is last-write-wins, which is the right behaviour for a save
   * the reader has just been shown a conflict for and chosen to force.
   */
  update(id: number, draft: PlanDraft, expectedUpdatedAt?: string): Promise<void>
  remove(id: number): Promise<void>
  getHousehold(): Promise<HouseholdFacts>
  saveHousehold(facts: HouseholdFacts): Promise<void>
}
