import {
  getHousehold,
  getPlanRegister,
  savePlanRegister,
  saveHousehold,
} from '@/app/actions/balance-sheet'
import { deletePlan, getPlans, savePlan, updatePlan } from '@/app/actions/plans'
import { planToInputs } from '@/lib/plan'
import type {
  PlanDraft,
  PlanStore,
  PlanSummary,
  StoredPlan,
} from '@/lib/store/types'

/**
 * Plans in Postgres, against an account.
 *
 * A wrapper and nothing more. Every one of these calls already existed and is
 * already scoped by the session's own user id — nothing here takes an id from
 * the caller, because a caller can say anything — and this file exists only so
 * that the screens above it can stop knowing which end they are talking to.
 *
 * Landing this on its own, in cloud mode, with no behaviour change, is what
 * keeps the local-storage work from being a rewrite. If this file is doing
 * anything cleverer than translating shapes, it has gone wrong.
 */

/** Postgres hands back a `Date`; the interface speaks ISO 8601. */
const stamp = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : ''

export const cloudStore: PlanStore = {
  async list(): Promise<PlanSummary[]> {
    const rows = await getPlans()
    // Already ordered newest first by `getPlans`.
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      personName: row.personName ?? '',
      updatedAt: stamp(row.updatedAt),
      inputs: planToInputs(row),
    }))
  },

  async get(id: number): Promise<StoredPlan | null> {
    // Read through the same list the pages read, so a plan that is not on the
    // account is simply absent rather than an error to interpret.
    const rows = await getPlans()
    const row = rows.find((r) => r.id === id)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      personName: row.personName ?? '',
      updatedAt: stamp(row.updatedAt),
      inputs: planToInputs(row),
      register: await getPlanRegister(id),
    }
  },

  async save(draft: PlanDraft): Promise<number> {
    const row = await savePlan(draft.name, draft.personName, draft.inputs)
    // The register belongs to the plan, so it is written with it and never on
    // its own — a register without a plan is not a scenario.
    await savePlanRegister(row.id, draft.register)
    return row.id
  },

  /**
   * `expectedUpdatedAt` is accepted and ignored, and that is a real gap rather
   * than an oversight.
   *
   * The local store can check it because it holds the only copy. Postgres
   * could check it too — the column is there — and does not: an account open
   * in two browsers has exactly the same race, and today the second save wins
   * silently. Written down here so that whoever adds the check knows the
   * interface was already shaped for it.
   */
  async update(id: number, draft: PlanDraft): Promise<void> {
    await updatePlan(id, draft.name, draft.personName, draft.inputs)
    await savePlanRegister(id, draft.register)
  },

  async remove(id: number): Promise<void> {
    await deletePlan(id)
  },

  getHousehold,
  saveHousehold,
}
