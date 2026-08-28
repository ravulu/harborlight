'use client'

import { useCallback, useEffect, useState } from 'react'

import { PlannerWorkspace } from '@/components/planner/planner-workspace'
import { LocalData } from '@/components/planner/local-data'
import { SavedPlans } from '@/components/planner/saved-plans'
import type { HouseholdFacts } from '@/lib/balance-sheet'
import { isLocal } from '@/lib/persistence'
import type { StoredDraft } from '@/lib/planner-draft'
import { saveJsonFile } from '@/lib/download'
import {
  exportOnePlan,
  planFilename,
  requireStore,
  type PlanSummary,
  type StoredPlan,
} from '@/lib/store'

/**
 * The planner's data, from whichever end holds it.
 *
 * In cloud mode the page has already read everything on the server, so the
 * first paint is complete and this component is a pass-through. In local mode
 * there is nothing to read on the server — the plans are in the browser — so
 * it reads them itself and holds a restoring state until they arrive.
 *
 * That asymmetry is the one cost §8 of `docs/persistence-modes.md` accepts.
 * The page's own comment explains what is being given up: the server read
 * exists "so the first paint already has them — no empty-then-filled flash on
 * the figures people check". A flash is worse than a wait, so a plan being
 * reopened waits rather than rendering defaults and correcting itself.
 */
export function PlannerBody({
  isAuthed,
  initialPlans,
  initialHousehold,
  initialOpened,
  planParam,
  defaultPersonName,
  initialDraft,
  initialTab,
  saveOnArrival,
}: {
  isAuthed: boolean
  /** Read on the server in cloud mode; empty in local mode. */
  initialPlans: PlanSummary[]
  initialHousehold: HouseholdFacts | null
  /** The plan named by `?plan=`, if there is one and it is theirs. */
  initialOpened: StoredPlan | null
  planParam?: string
  /** Whose plan it is by default, from the account. Cloud mode only. */
  defaultPersonName?: string
  initialDraft: StoredDraft | null
  initialTab?: string
  saveOnArrival: boolean
}) {
  const [plans, setPlans] = useState(initialPlans)
  const [household, setHousehold] = useState(initialHousehold)
  const [opened, setOpened] = useState(initialOpened)
  // Cloud mode arrives loaded. Local mode has to go and look.
  const [restoring, setRestoring] = useState(isLocal)

  const reload = useCallback(async () => {
    if (!isLocal) return
    const store = requireStore()
    const [list, facts] = await Promise.all([store.list(), store.getHousehold()])
    const id = planParam ? Number(planParam) : NaN
    const open = Number.isInteger(id) ? await store.get(id) : null
    setPlans(list)
    setHousehold(facts)
    setOpened(open)
    setRestoring(false)
  }, [planParam])

  useEffect(() => {
    if (!isLocal) return
    let live = true
    void (async () => {
      try {
        await reload()
      } catch {
        // A browser that refuses storage has no plans to show rather than a
        // page that fails. Saving is where that has to be said out loud,
        // because that is where somebody is told their figures were kept.
        if (live) setRestoring(false)
      }
    })()
    return () => {
      live = false
    }
  }, [reload])

  const onDelete = useCallback(
    async (id: number) => {
      await requireStore().remove(id)
      // Cloud mode revalidates on the server and the row refreshes the router;
      // local mode has nothing to revalidate, so the list is re-read here.
      await reload()
    },
    [reload],
  )

  /**
   * One plan, as a file named after itself.
   *
   * Local mode only: in the cloud the database is already the copy, and a
   * download there would be a different feature with a different argument
   * behind it.
   */
  const onDownload = isLocal
    ? async (plan: PlanSummary) => {
        const file = await exportOnePlan(requireStore(), plan.id)
        if (!file) return
        await saveJsonFile(
          planFilename(plan.name, file.savedAt),
          JSON.stringify(file, null, 2),
        )
      }
    : undefined

  if (restoring) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Looking for plans saved in this browser…
      </p>
    )
  }

  return (
    <>
      {/* Above the list rather than inside it: importing is exactly what
          somebody with no plans yet — a new laptop, a cleared browser — needs
          to find, and a control that only appears once you have something is
          no use to them. Renders nothing in cloud mode. */}
      <div className="mb-6">
        <LocalData plans={plans} onChanged={reload} />
      </div>

      {plans.length > 0 && (
        <div className="mb-8 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-lg font-medium text-foreground">
              Your saved plans
            </h2>
            <p className="text-sm text-muted-foreground">
              {plans.length} saved. Opening one loads it below.
            </p>
          </div>
          <SavedPlans plans={plans} onDelete={onDelete} onDownload={onDownload} />
        </div>
      )}
      <PlannerWorkspace
        isAuthed={isAuthed}
        initialHousehold={household}
        initialRegister={opened?.register ?? null}
        initialTab={initialTab}
        initialInputs={opened?.inputs}
        initialName={opened?.name}
        // Defaults to the account holder in cloud mode, which the page has
        // already resolved into the opened plan's own value where it has one.
        initialPersonName={opened?.personName || defaultPersonName}
        planId={opened?.id}
        initialDraft={initialDraft}
        saveOnArrival={saveOnArrival}
        onStored={reload}
      />
    </>
  )
}
