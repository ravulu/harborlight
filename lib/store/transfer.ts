import { isBlankHousehold, type HouseholdFacts } from '@/lib/balance-sheet'
import {
  normaliseHousehold,
  normalisePlanInputs,
  normaliseRegister,
} from '@/lib/store/normalise'
import type { PlanStore, StoredPlan } from '@/lib/store/types'

/**
 * Taking plans off a machine, and putting them back on one.
 *
 * In local mode this is not a convenience. It is the only answer to a new
 * laptop, to cleared site data, to a browser that was reinstalled, to "can you
 * help me with my plan" when nobody at this end can look it up, and to a
 * future migration into cloud mode. Everything else in local mode assumes the
 * browser keeps its promises; this is what happens when it does not.
 *
 * Written against `PlanStore` rather than against `localStorage`, so it works
 * in either mode and can be tested without a browser. Exporting from a cloud
 * deployment is a reasonable thing to want and costs nothing to allow.
 */

/**
 * The file's own version, which is not the storage layout's version.
 *
 * The keys carry `fairwater.v1` because a reader migrates them in place. A
 * file is a different problem: it arrives from anywhere, possibly from a build
 * newer than the one reading it, and it has to say what it is.
 */
export const EXPORT_VERSION = 1

export interface ExportEnvelope {
  v: number
  savedAt: string
  household: HouseholdFacts
  plans: Omit<StoredPlan, 'id'>[] & { id?: number }[]
}

export interface ImportReport {
  added: number
  /** Entries that were not plans, or were too broken to be one. */
  skipped: number
  /** Whether the file's household was taken up or the existing one kept. */
  household: 'adopted' | 'kept'
}

export class UnreadableFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableFileError'
  }
}

/** One document, assembled by reading every plan the store holds. */
export async function exportPlans(
  store: PlanStore,
  now: () => string = () => new Date().toISOString(),
): Promise<ExportEnvelope> {
  const summaries = await store.list()
  const plans = await Promise.all(summaries.map((s) => store.get(s.id)))
  return {
    v: EXPORT_VERSION,
    savedAt: now(),
    household: await store.getHousehold(),
    plans: plans.filter((p): p is StoredPlan => p !== null),
  }
}

/** One plan on its own, in the same envelope a whole export uses. */
export async function exportOnePlan(
  store: PlanStore,
  id: number,
  now: () => string = () => new Date().toISOString(),
): Promise<ExportEnvelope | null> {
  const plan = await store.get(id)
  if (!plan) return null
  return {
    v: EXPORT_VERSION,
    savedAt: now(),
    household: await store.getHousehold(),
    plans: [plan],
  }
}

/**
 * A name that will not collide with the last one.
 *
 * Dated *and timed*, because a date alone collides the second time somebody
 * downloads on the same day and the browser answers with `(1)`, `(2)` — which
 * tells them nothing about which file is which, and is exactly the moment a
 * backup stops being trustworthy. Seconds are included because two downloads a
 * minute apart while comparing scenarios is a normal thing to do.
 */
const stampFor = (savedAt: string) =>
  savedAt.slice(0, 19).replace('T', '-').replace(/:/g, '')

/**
 * A plan's own name, made safe for a filename.
 *
 * Kept recognisable rather than sanitised into nothing: this is the name the
 * reader typed, and it is the only thing that will tell them which of five
 * files is the one they want. Anything a filesystem objects to becomes a
 * hyphen, runs collapse, and the whole is capped so a long name cannot produce
 * a path nothing will open.
 */
export function slugForFilename(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'plan'
}

/** `fairwater-plans-2026-08-28-140211.json` — every plan, timestamped. */
export const exportFilename = (savedAt: string) =>
  `fairwater-plans-${stampFor(savedAt)}.json`

/** `retire-at-58-2026-08-28-140211.json` — one plan, by the name it was given. */
export const planFilename = (name: string, savedAt: string) =>
  `${slugForFilename(name)}-${stampFor(savedAt)}.json`

/**
 * Read a file back in, adding rather than replacing.
 *
 * **Never replaces.** Imported plans are given fresh ids by the store and
 * appended. Replacing is one wrong click from destroying the plans already on
 * the machine, and in local mode there is no undo and no backup on a device we
 * do not control. Somebody who wanted a clean slate can forget everything
 * first, deliberately, with a control that says so.
 *
 * The household is taken up only into a blank one, by the same rule
 * `saveHousehold` already follows: an empty household is never worth writing
 * over a filled one, because it says nothing and can only take away.
 */
export async function importPlans(
  store: PlanStore,
  raw: unknown,
): Promise<ImportReport> {
  const from = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null
  if (!from || !Array.isArray(from.plans)) {
    throw new UnreadableFileError(
      'That file is not a Fairwater export — it has no plans in it.',
    )
  }

  /**
   * A newer file is refused rather than read forgivingly.
   *
   * Everywhere else the rule is take-what-you-recognise, because the
   * alternative is failing on a payload that is mostly fine. Here the
   * alternative is worse: a file written by a later build may carry fields
   * this one drops, and importing it would silently produce a *different*
   * plan while reporting success. Refusing says something true; a quiet
   * downgrade does not.
   */
  const version = typeof from.v === 'number' ? from.v : 1
  if (version > EXPORT_VERSION) {
    throw new UnreadableFileError(
      `That file was written by a newer version of Fairwater (format ${version}, this build reads ${EXPORT_VERSION}). Opening it here would quietly drop whatever this version does not understand.`,
    )
  }

  let added = 0
  let skipped = 0
  for (const entry of from.plans) {
    const plan = typeof entry === 'object' && entry !== null
      ? (entry as Record<string, unknown>)
      : null
    if (!plan) {
      skipped++
      continue
    }
    try {
      await store.save({
        name: typeof plan.name === 'string' && plan.name.trim() ? plan.name : 'Imported plan',
        personName: typeof plan.personName === 'string' ? plan.personName : '',
        inputs: normalisePlanInputs(plan.inputs),
        register: normaliseRegister(plan.register),
      })
      added++
    } catch {
      // One unreadable plan is not a reason to abandon the others. The count
      // is reported, so a partial import is visible rather than assumed.
      skipped++
    }
  }

  let household: ImportReport['household'] = 'kept'
  if (from.household) {
    const incoming = normaliseHousehold(from.household)
    const current = await store.getHousehold()
    if (isBlankHousehold(current) && !isBlankHousehold(incoming)) {
      await store.saveHousehold(incoming)
      household = 'adopted'
    }
  }

  return { added, skipped, household }
}
