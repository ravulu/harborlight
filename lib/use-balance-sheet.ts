'use client'

import { useCallback, useEffect, useState } from 'react'

import { saveHousehold } from '@/app/actions/balance-sheet'
import { forgetBrowserCopies, takeStashedPending } from '@/lib/holdings-store'
import {
  EMPTY_HOUSEHOLD,
  EMPTY_REGISTER,
  isBlankHousehold,
  type HouseholdFacts,
  type Register,
} from '@/lib/balance-sheet'

/**
 * The household, and what the plan on screen assumes it owns and owes.
 *
 * They keep different company. The household is the person — one name, one
 * age, one filing status — and saves itself for a signed-in visitor, because
 * there is nothing to decide about who you are. The register belongs to the
 * plan, and is kept by saving the plan: keeping the rental and selling it are
 * two scenarios, and neither should overwrite the other by being typed second.
 *
 * Signed out, neither is written anywhere. A refresh clears the page, and the
 * only thing that carries figures across a sign-in is pressing Save.
 */
const SETTLE_MS = 800

export function useBalanceSheet(
  isAuthed: boolean,
  initialHousehold: HouseholdFacts | null,
  initialRegister: Register | null,
  /** Which plan's register is on screen. Undefined for one not yet saved. */
  planId?: number,
) {
  const [household, setHousehold] = useState<HouseholdFacts>(
    initialHousehold ?? EMPTY_HOUSEHOLD,
  )
  const [register, setRegister] = useState<Register>(
    initialRegister ?? EMPTY_REGISTER,
  )
  const [saving, setSaving] = useState(false)

  /**
   * Take the new plan's register when the plan on screen changes.
   *
   * This is the guard the plan itself has had all along and this did not, and
   * the asymmetry destroyed data. The saved-plans list sits on the same route
   * as the workspace, so opening one from it is a navigation and not a mount:
   * the state here survives it. The plan's own figures were reloaded by an
   * equivalent check in `RetirementPlanner`, so the projection looked right
   * while the register beside it still held whatever the last plan had — or,
   * arriving from an unsaved page, nothing at all.
   *
   * Pressing Save then wrote that nothing over the plan being viewed, and
   * `savePlanRegister` empties the plan's rows before inserting. Every holding
   * and liability on the plan went, and the projection above it was correct
   * throughout, so there was nothing on screen to suggest what had happened.
   *
   * Set during render rather than in an effect, which is what React documents
   * for state derived from props: an effect would let one render go out with
   * the old plan's figures, and a save in that window is the whole bug again.
   */
  const [shownPlan, setShownPlan] = useState(planId)
  if (planId !== shownPlan) {
    setShownPlan(planId)
    setRegister(initialRegister ?? EMPTY_REGISTER)
  }

  /**
   * Clear what earlier versions left on the machine.
   *
   * This wrote to the browser for a while — localStorage first, then session —
   * so somebody's house, their debts and their income sat where the next
   * person to open it could read them. Signing in does not remove that, and
   * neither does writing somewhere else, so both keys go on every mount.
   */
  useEffect(() => {
    forgetBrowserCopies()
  }, [])

  /**
   * Take up whatever was carried across a sign-in.
   *
   * Read once and removed, and only into an empty register: somebody opening a
   * saved plan should see that plan's figures rather than have them replaced
   * by whatever was on screen the last time they pressed Save.
   *
   * `adopted` is what lets the plan's arrival save wait. Child effects run
   * before their parent's, so without a signal the save would fire first,
   * store nothing, and mark itself done.
   */
  const [adopted, setAdopted] = useState(false)
  useEffect(() => {
    const stashed = takeStashedPending() as {
      household?: HouseholdFacts
      register?: Register
    } | null

    if (stashed?.register?.holdings?.length || stashed?.register?.liabilities?.length) {
      // Only into an empty one: somebody opening a saved plan should see that
      // plan's figures rather than have them replaced by whatever was on
      // screen the last time they pressed Save.
      setRegister((current) =>
        current.holdings.length === 0 && current.liabilities.length === 0
          ? {
              holdings: stashed.register?.holdings ?? [],
              liabilities: stashed.register?.liabilities ?? [],
            }
          : current,
      )
    }

    // Who they said they were, into an account that has not been told yet.
    const carried = stashed?.household
    if (carried && (carried.name || carried.currentAge > 0 || carried.taxState)) {
      setHousehold((current) =>
        current.name || current.currentAge > 0 || current.taxState
          ? current
          : carried,
      )
    }

    setAdopted(true)
    // Once, on mount. A later run would find the stash already taken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Who you are saves itself. What a plan assumes does not: that is the plan's
  // to keep, and it is kept when the plan is.
  useEffect(() => {
    if (!isAuthed) return
    // Nothing worth writing, and everything to lose by writing it. The server
    // refuses a blank over a filled row as well; this saves the round trip and
    // stops the page announcing "Saving…" for a write that will not happen.
    if (isBlankHousehold(household)) return
    const id = setTimeout(() => {
      setSaving(true)
      void Promise.resolve(saveHousehold(household))
        .catch(() => {
          // A failed write should not take the page with it. The figures are
          // still on screen, and the next edit tries again.
        })
        .finally(() => setSaving(false))
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [household, isAuthed])

  const updateHousehold = useCallback(
    (next: HouseholdFacts) => setHousehold(next),
    [],
  )
  const updateRegister = useCallback((next: Register) => setRegister(next), [])

  return {
    household,
    register,
    setHousehold: updateHousehold,
    setRegister: updateRegister,
    saving,
    adopted,
  }
}
