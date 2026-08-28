import type { HouseholdFacts, Register } from '@/lib/balance-sheet'
import { EMPTY_HOUSEHOLD } from '@/lib/balance-sheet'
import {
  normaliseHousehold,
  normalisePlanInputs,
  normaliseRegister,
} from '@/lib/store/normalise'
import {
  StaleWriteError,
  type PlanDraft,
  type PlanStore,
  type PlanSummary,
  type StoredPlan,
} from '@/lib/store/types'

/**
 * Plans kept in the reader's own browser, one key each.
 *
 * The layout is the design decision, and it is worth restating where somebody
 * will be editing it. Every plan gets its own key and the list is derived by
 * scanning for the prefix — **so saving a plan cannot touch a plan it is not
 * saving.**
 *
 * The alternative, one key holding every plan, was written first and thrown
 * away. With it, a tab open for an hour writes its own idea of the whole list:
 * a tab saving plan 2 deletes the plan 3 another tab created ten minutes ago,
 * having never touched it, with nothing on screen to suggest what happened.
 * That is this project's recurring failure — the register wipe, the household
 * blanking — and here there is no database to restore from. One key per plan
 * makes it unavailable rather than merely avoided.
 *
 * Within a single plan the last write wins, which is ordinary. `update` will
 * refuse a write over a copy that changed underneath it if the caller says
 * what it believed it was editing.
 *
 * `docs/persistence-modes.md` carries the full design.
 */

/**
 * The version lives in the key prefix, not inside the payload.
 *
 * A version 2 reader looks for `fairwater.v1.*`, migrates one plan, writes the
 * v2 key and drops the old — per plan, so a migration interrupted halfway
 * leaves readable data on both sides rather than one corrupt blob.
 */
export const PREFIX = 'fairwater.v1'
export const HOUSEHOLD_KEY = `${PREFIX}.household`
export const PLAN_PREFIX = `${PREFIX}.plan.`

/**
 * That the reader has been told their figures stay on this machine.
 *
 * Kept rather than asked every time: a warning repeated on every save is a
 * warning nobody reads by the third one. Cleared by `forgetLocal`, so somebody
 * who takes everything off the machine is asked again the next time they put
 * something on it — the question is about this browser, and they have just
 * said no to this browser.
 */
export const CONSENT_KEY = `${PREFIX}.told`

/**
 * The part of `Storage` this needs, so a test can hand it a plain object.
 *
 * Injected rather than reached for: `lib/**` is tested in the node
 * environment, which has no `window`, and a store that can only be exercised
 * in a browser is a store whose isolation guarantee is never actually
 * asserted.
 */
export interface StorageLike {
  readonly length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface StoredShape {
  id: number
  name: string
  personName: string
  updatedAt: string
  inputs: unknown
  register: unknown
}

const planKey = (id: number) => `${PLAN_PREFIX}${id}`

/**
 * A write that did not happen, said out loud.
 *
 * A private window, or a browser set to block site data, refuses `setItem`.
 * Somewhere above this a reader has just pressed a button labelled "Save on
 * this device" and been told it worked. The one outcome that must never
 * happen is for that to be false and quiet — this project has shipped silent
 * data loss twice already, and both times the screen looked correct
 * throughout.
 */
export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      'This browser will not let the page store anything — often a private window, or site data turned off. Your figures are still on screen, but nothing was saved.',
    )
    this.name = 'StorageUnavailableError'
    this.cause = cause
  }
}

/**
 * Every key this store owns, gone.
 *
 * The other half of keeping figures on somebody's machine: they have to be
 * able to take them off it again, in one step, without hunting through
 * browser settings. `forgetBrowserCopies` already clears what earlier
 * versions left behind; this clears what this one writes on purpose.
 *
 * Collected before deleting, because removing a key while walking the live
 * list moves everything after it down by one.
 */
export function forgetLocal(storage: StorageLike): number {
  const mine: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (
      key &&
      (key === HOUSEHOLD_KEY || key === CONSENT_KEY || key.startsWith(PLAN_PREFIX))
    ) {
      mine.push(key)
    }
  }
  for (const key of mine) storage.removeItem(key)
  return mine.length
}

/**
 * Whether this browser will actually keep anything.
 *
 * Asked by writing and removing, because the only reliable answer is the one
 * the browser gives when tried: Safari in a private window exposes
 * `localStorage` and throws on write, so the presence of the object proves
 * nothing at all.
 */
/** Whether this browser has already been told what saving here means. */
export function hasBeenTold(storage: StorageLike): boolean {
  try {
    return storage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function recordTold(storage: StorageLike): void {
  try {
    storage.setItem(CONSENT_KEY, '1')
  } catch {
    // A browser that will not keep this will not keep the plan either, and
    // the save itself reports that. Asking twice is not the failure worth
    // guarding against here.
  }
}

export function storageWorks(storage: StorageLike): boolean {
  const probe = `${PREFIX}.probe`
  try {
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function createLocalStore(
  storage: StorageLike,
  /** Injected so a test can pin the clock the staleness check reads. */
  now: () => string = () => new Date().toISOString(),
): PlanStore {
  /**
   * Every key this store owns, in whatever order the browser gives them.
   *
   * Collected before anything is read, because `key(i)` walks a live list and
   * this origin holds keys we do not own: `fairwater_holdings` and
   * `fairwater_register_pending` were both written by earlier versions, and
   * `forgetBrowserCopies` still clears them on sight.
   */
  function planKeys(): string[] {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith(PLAN_PREFIX)) keys.push(key)
    }
    return keys
  }

  /**
   * One key, parsed, or null.
   *
   * A payload that will not parse is skipped and the key is left exactly where
   * it is. Deleting it would be this release destroying a plan on behalf of
   * the next one, which may well be able to read it.
   */
  function readPlan(key: string): StoredPlan | null {
    let raw: string | null
    try {
      raw = storage.getItem(key)
    } catch {
      return null
    }
    if (!raw) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }

    const from = (typeof parsed === 'object' && parsed !== null
      ? parsed
      : {}) as Partial<StoredShape>
    // The id is the key's, never the payload's. A hand-edited file that
    // disagrees with itself should not be able to make one plan masquerade as
    // another and be overwritten by it.
    const id = Number(key.slice(PLAN_PREFIX.length))
    if (!Number.isInteger(id)) return null

    return {
      id,
      name: typeof from.name === 'string' ? from.name : 'Untitled plan',
      personName: typeof from.personName === 'string' ? from.personName : '',
      updatedAt: typeof from.updatedAt === 'string' ? from.updatedAt : '',
      inputs: normalisePlanInputs(from.inputs),
      register: normaliseRegister(from.register),
    }
  }

  /**
   * Writes throw, and callers must not swallow it.
   *
   * A private window, or a browser set to block site data, refuses the write.
   * Somewhere above this a reader has just been told their plan was saved, and
   * the one thing that must not happen is for that to be false and quiet.
   */
  function writePlan(id: number, draft: PlanDraft, updatedAt: string): void {
    const payload: StoredShape = {
      id,
      name: draft.name.trim() || 'Untitled plan',
      personName: draft.personName.trim().slice(0, 120),
      updatedAt,
      inputs: draft.inputs,
      register: draft.register,
    }
    try {
      storage.setItem(planKey(id), JSON.stringify(payload))
    } catch (e) {
      throw new StorageUnavailableError(e)
    }
  }

  return {
    async list(): Promise<PlanSummary[]> {
      return planKeys()
        .map(readPlan)
        .filter((p): p is StoredPlan => p !== null)
        // A summary is a plan without its register — dropped by naming the
        // fields kept, since a rest-destructure leaves an unread binding
        // behind and the linter is right to say so.
        .map(
          ({ id, name, personName, updatedAt, inputs }): PlanSummary => ({
            id,
            name,
            personName,
            updatedAt,
            inputs,
          }),
        )
        // Newest first, matching what `getPlans` orders by in cloud mode.
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    async get(id: number): Promise<StoredPlan | null> {
      return readPlan(planKey(id))
    },

    async save(draft: PlanDraft): Promise<number> {
      /**
       * The next id, read from storage rather than from anything held in
       * memory. A tab that has been open an hour has a stale idea of the
       * highest id, and taking it from there is how two plans end up sharing
       * a key.
       *
       * Two tabs can still land on the same id inside the same microsecond.
       * The consequence is bounded to those two new plans instead of the whole
       * set, which is the difference the layout is bought for.
       */
      const highest = planKeys().reduce((max, key) => {
        const id = Number(key.slice(PLAN_PREFIX.length))
        return Number.isInteger(id) && id > max ? id : max
      }, 0)
      const id = highest + 1
      writePlan(id, draft, now())
      return id
    },

    async update(
      id: number,
      draft: PlanDraft,
      expectedUpdatedAt?: string,
    ): Promise<void> {
      if (expectedUpdatedAt !== undefined) {
        const held = readPlan(planKey(id))
        // Only a *different* stamp is a conflict. A plan that has gone
        // entirely is not one this can resolve, and refusing the write would
        // strand figures the reader still has on screen.
        if (held && held.updatedAt && held.updatedAt !== expectedUpdatedAt) {
          throw new StaleWriteError(id, expectedUpdatedAt, held.updatedAt)
        }
      }
      writePlan(id, draft, now())
    },

    async remove(id: number): Promise<void> {
      storage.removeItem(planKey(id))
    },

    async getHousehold(): Promise<HouseholdFacts> {
      let raw: string | null
      try {
        raw = storage.getItem(HOUSEHOLD_KEY)
      } catch {
        return EMPTY_HOUSEHOLD
      }
      if (!raw) return EMPTY_HOUSEHOLD
      try {
        return normaliseHousehold(JSON.parse(raw))
      } catch {
        return EMPTY_HOUSEHOLD
      }
    },

    async saveHousehold(facts: HouseholdFacts): Promise<void> {
      try {
        storage.setItem(HOUSEHOLD_KEY, JSON.stringify(normaliseHousehold(facts)))
      } catch (e) {
        throw new StorageUnavailableError(e)
      }
    },
  }
}

/**
 * The store the app uses, bound to the browser's own storage.
 *
 * Null on the server, where there is no browser to read: the pages that use
 * this in local mode hand down `null` initial data and hydrate on the client,
 * which is the rendering cost §8 of the design accepts.
 */
export const localStore: PlanStore | null =
  typeof window === 'undefined' ? null : createLocalStore(window.localStorage)

export type { Register }
