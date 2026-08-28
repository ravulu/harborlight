import { isLocal } from '@/lib/persistence'
import { cloudStore } from '@/lib/store/cloud'
import { localStore } from '@/lib/store/local'
import type { PlanStore } from '@/lib/store/types'

export type {
  PlanDraft,
  PlanStore,
  PlanSummary,
  StoredPlan,
} from '@/lib/store/types'
export { StaleWriteError } from '@/lib/store/types'
export {
  StorageUnavailableError,
  forgetLocal,
  hasBeenTold,
  recordTold,
  storageWorks,
} from '@/lib/store/local'
export {
  UnreadableFileError,
  exportFilename,
  exportOnePlan,
  exportPlans,
  importPlans,
  planFilename,
  slugForFilename,
  type ExportEnvelope,
  type ImportReport,
} from '@/lib/store/transfer'

/**
 * The store this deployment uses.
 *
 * One branch, in one place. Everything above reads `store` and never asks
 * which mode it is in — that is the whole point of the interface, and a second
 * `isLocal` check in a component is a sign something has been threaded the
 * wrong way.
 *
 * Null on the server in local mode, where there is no browser to read from.
 * The pages handle that by passing `null` initial data and hydrating on the
 * client; see §8 of `docs/persistence-modes.md`, which is the one cost this
 * design accepts rather than avoids.
 */
export const store: PlanStore | null = isLocal ? localStore : cloudStore

/**
 * The store, or a thrown error rather than a silent no-op.
 *
 * For the client paths, where `store` is only null if something has gone
 * genuinely wrong — local mode has a browser by then, and cloud mode never
 * returns null at all. A save that quietly does nothing is the failure this
 * whole design is most concerned with.
 */
export function requireStore(): PlanStore {
  if (!store) throw new Error('No plan store: reading storage before hydration.')
  return store
}
