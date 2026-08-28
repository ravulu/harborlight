'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  EMPTY_DRAFT,
  MONEY_FIELDS,
  missingRequired,
  simulate,
  toDraft,
  toPlanInputs,
  type MoneyField,
  type PlanDraft,
  type PlanInputs,
} from '@/lib/retirement'
import {
  clearDraftCookie,
  withDerivedRates,
  writeDraftCookie,
  type StoredDraft,
} from '@/lib/planner-draft'
import { runMonteCarlo } from '@/lib/monte-carlo'
import type { MonteCarloResult } from '@/lib/monte-carlo'
import { compareClaimAges, suggestFixes, TARGET_CONFIDENCE } from '@/lib/suggestions'
import { isLocal } from '@/lib/persistence'
import { hasBeenTold, recordTold, requireStore } from '@/lib/store'
import { stashPending } from '@/lib/holdings-store'
import { PlanInputsPanel, ClearingInput } from './plan-inputs'
import { Label } from '@/components/ui/label'
import { createPortal } from 'react-dom'
import { planDiffers, registerDiffers } from '@/lib/plan'
import { EMPTY_REGISTER } from '@/lib/balance-sheet'
import { PlanSummary } from './plan-summary'
import { ProjectionChart } from './projection-chart'
import { IncomeChart } from './income-chart'
import { FundingMix } from './funding-mix'
import { TaxPhases } from './tax-phases'
import { ConfidenceBadge } from './confidence-badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildInsights } from '@/lib/insights'
import { INSIGHTS_ID } from '@/components/planner/insights-link'
import { MEDICARE_AGE, NATIONAL_AVERAGE_NOTE } from '@/lib/aca'
import { PLANNER_TABS, tabPath, type PlannerTab } from '@/lib/planner-tabs'

/**
 * Kept here rather than on the tab list itself: that module is read by a
 * server action, and dragging an icon library into it for the sake of four
 * glyphs would put lucide in the server bundle.
 */
const TAB_ICONS: Record<PlannerTab, typeof TrendingUp> = {
  balance: TrendingUp,
  income: Wallet,
  tax: Receipt,
  table: Table2,
}
import { WhatsStillOpen } from '@/components/planner/whats-still-open'
import { SpendingLever } from '@/components/planner/spending-lever'
import { spendingLeverage } from '@/lib/spending-lever'
import { compareConversions, type ConversionComparison } from '@/lib/conversions'
import { roomByYear } from '@/lib/room'
import { record } from '@/lib/usage'
import { earliestRetirement } from '@/lib/earliest'
import {
  Save,
  Check,
  CopyPlus,
  TrendingUp,
  Wallet,
  Receipt,
  Table2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettled } from '@/lib/use-settled'
import type { HouseholdFacts, Register } from '@/lib/balance-sheet'

// Only the two the projection cannot start without are named here; the rest
// count as none when blank, so they are never asked for.
const MONEY_LABELS: Partial<Record<MoneyField, string>> = {
  monthlyRetirementSpending: 'monthly spending in retirement',
  balance401k: 'brokerage, 401(k), IRA or Roth balance',
}

interface RetirementPlannerProps {
  isAuthed: boolean
  initialInputs?: PlanInputs
  initialName?: string
  /** Who the plan is for: the saved plan's, else the account holder's. */
  initialPersonName?: string
  planId?: number
  /** A signed-in user's unsaved draft, read from the cookie on the server. */
  initialDraft?: StoredDraft | null
  /** Set by ?save=1, the flag "Sign in to save" leaves behind. */
  saveOnArrival?: boolean
  /**
   * What the plan's balances add up to, reported as they change.
   *
   * So the net-worth bar above both tabs can move while somebody types,
   * without the balances leaving the plan that owns them. Reported from the
   * settled draft rather than the raw one, so it follows the same beat as
   * everything else expensive here.
   */
  /** Told once a plan has been stored, so a list elsewhere can re-read. */
  onStored?: () => void
  onLiquidChange?: (total: number) => void
  /** Ordinary income by age, so a sale can be priced against the right year. */
  onIncomeByAge?: (byAge: Map<number, number>) => void
  /**
   * Who the household is, from above the tabs.
   *
   * Age, filing status and state used to be asked here and on the balance
   * sheet, so the two could disagree. They are asked once now, and a saved
   * plan takes them from the household rather than from whenever it was
   * saved — which also stops a plan projecting from an age its owner has
   * long since passed.
   */
  household?: HouseholdFacts
  /**
   * What this plan assumes the household owns and owes.
   *
   * Passed in so saving the plan saves both tabs at once. A register without a
   * plan is not a scenario, so it has no save of its own.
   */
  register?: Register
  /** What that register held when the plan was opened, to compare against. */
  initialRegister?: Register | null
  /**
   * Where to put the plan's name and Save button.
   *
   * Above the tabs, which is outside this component's tree — one press keeps
   * this plan and the register beside it, so the control cannot live inside
   * one of the two things it saves. Only the DOM moves; the name and the save
   * handler stay where they already were.
   */
  headerSlot?: HTMLElement | null
  /** Where the save row lands, below both tabs so either can reach it. */
  footerSlot?: HTMLElement | null
  /**
   * Whether this tab is the one on screen.
   *
   * Both tabs stay mounted, so the draft survives switching between them. A
   * hidden panel has no width, though, and a chart asked to draw into nothing
   * warns about it — so the charts are the one thing that waits until it is
   * being looked at. Everything else, including every figure they are drawn
   * from, stays exactly where it was.
   */
  active?: boolean
  /** Set once the register carried across a sign-in has been taken up. */
  autoSaveReady?: boolean
  /**
   * Which tab is showing, so the sign-in comes back to it.
   *
   * Somebody who pressed Save from their balance sheet did not ask to be
   * returned to the projection. It travels in the URL rather than in storage
   * so the right tab is server-rendered and there is no flash of the wrong
   * one on arrival.
   */
  activeTab?: string
}

export function RetirementPlanner({
  isAuthed,
  initialInputs,
  initialName,
  initialPersonName,
  planId,
  initialDraft,
  saveOnArrival = false,
  onStored,
  onLiquidChange,
  onIncomeByAge,
  household,
  register,
  initialRegister,
  headerSlot,
  footerSlot,
  active = true,
  autoSaveReady = true,
  activeTab,
}: RetirementPlannerProps) {
  const router = useRouter()
  const editingSaved = planId !== undefined

  // Both the saved plan and the cookie draft arrive from the server, so the
  // first render already has the right values — no effect, no empty flash.
  const [draft, setDraft] = useState<PlanDraft>(() => {
    if (initialInputs) return toDraft(initialInputs)
    if (initialDraft) return initialDraft.draft
    return EMPTY_DRAFT
  })
  const [name, setName] = useState(
    initialName ?? initialDraft?.name ?? 'My retirement plan',
  )
  // A saved plan's own value wins; otherwise pick up an unsaved draft, and
  // fall back to the name on the account, which is who this is for by default.
  const [personName, setPersonName] = useState(
    initialPersonName ?? initialDraft?.personName ?? '',
  )
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  /** Shown beside the button. A save that fails quietly is worse than one that fails. */
  const [error, setError] = useState<string | null>(null)

  /**
   * Follow the URL when a different saved plan is opened.
   *
   * The three states above are seeded once, when the component mounts.
   * Navigating from one saved plan to another does not mount it again —
   * it is the same component in the same place, so React keeps its state and
   * the new props arrive with nowhere to go. The form went on showing the plan
   * that was open before, and only a full browser reload put that right.
   *
   * Resetting during render rather than in an effect is React's own answer to
   * this, and it is the one that avoids a frame of the wrong plan's figures.
   * Keyed on `planId` rather than on the inputs themselves so that saving,
   * refreshing or editing the plan already open leaves the form alone — the
   * only thing that should discard what is on screen is being sent to a
   * different plan.
   */
  const [shownPlan, setShownPlan] = useState(planId)
  if (planId !== shownPlan) {
    setShownPlan(planId)
    setDraft(initialInputs ? toDraft(initialInputs) : (initialDraft?.draft ?? EMPTY_DRAFT))
    setName(initialName ?? initialDraft?.name ?? 'My retirement plan')
    setPersonName(initialPersonName ?? initialDraft?.personName ?? '')
    setSaved(false)
  }

  // Keep the cookie in step with what they have typed. Signed-out users get
  // no persistence at all, and an open saved plan is not a draft.
  useEffect(() => {
    if (!isAuthed || editingSaved) return
    writeDraftCookie({ draft, name, personName })
  }, [isAuthed, editingSaved, draft, name, personName])

  // Ten thousand runs is roughly 75ms of uninterruptible work, which is felt
  // if it happens on every keystroke — useDeferredValue only reorders it, it
  // cannot break into it. Settling briefly first keeps typing smooth and costs
  // one recompute per pause instead of one per character. The whole draft is
  // held back rather than the simulation alone, so the results section stays
  // consistent with itself instead of tiles moving while the chart lags.
  /**
   * Where a visit got to, for the funnel — a milestone reached, never a figure
   * entered. `once` because both of these fire from render-driven effects that
   * would otherwise repeat on every keystroke.
   */
  useEffect(() => {
    // At least one of the figures the form asks for has been filled in.
    if (missingRequired(draft).length < MONEY_FIELDS.length) {
      record('plan_started', undefined, true)
    }
  }, [draft])

  const settledDraft = useSettled(draft, 250)
  const stale = settledDraft !== draft

  const inputs = useMemo(() => toPlanInputs(settledDraft), [settledDraft])
  const result = useMemo(() => (inputs ? simulate(inputs) : null), [inputs])
  const monteCarlo = useMemo(() => (inputs ? runMonteCarlo(inputs) : null), [inputs])
  // Worked out once and handed to both the tax tab and the insight card. It
  // costs a sweep of projections plus a market run per row shown, and — more
  // importantly — the two must quote the same figure. They used not to.
  /**
   * Four bisections over a simulated market, so it rides on the settled draft
   * like everything else expensive here rather than running per keystroke.
   */
  const leverage = useMemo(
    () => (inputs ? spendingLeverage(inputs) : null),
    [inputs],
  )

  /**
   * The low-income window, worked out here rather than in the tab that shows
   * it. It runs the projection to get there, and a component that re-renders
   * on every keystroke is the wrong place to do that.
   */
  const room = useMemo(() => (inputs ? roomByYear(inputs) : null), [inputs])

  const conversions = useMemo(
    () => (inputs ? compareConversions(inputs) : null),
    [inputs],
  )
  // The question the homepage asks. Bisected rather than swept, so it costs a
  // handful of market runs rather than thirty.
  const earliest = useMemo(
    () => (inputs ? earliestRetirement(inputs) : null),
    [inputs],
  )
  // Only worth solving when the plan is short; a healthy one pays nothing.
  const suggestions = useMemo(
    () =>
      inputs && monteCarlo && monteCarlo.successRate < TARGET_CONFIDENCE
        ? suggestFixes(inputs)
        : [],
    [inputs, monteCarlo],
  )
  // Worth showing whether the plan is short or not: a healthy plan can still
  // be leaving a permanently larger benefit on the table.
  const claiming = useMemo(() => (inputs ? compareClaimAges(inputs) : null), [inputs])
  // The household is the truth for these three. Applied on the way in rather
  // than merged at the end, so everything downstream — the projection, the
  // save, the compare — sees one answer.
  useEffect(() => {
    if (!household) return
    // An unset household says nothing, so it should not say zero. Arriving
    // from a sign-in the account's household is blank for a moment, and
    // applying it would wipe the age the draft cookie had just carried
    // across — the one figure the projection cannot start without.
    const unset =
      household.currentAge === 0 && !household.taxState && !household.name
    if (unset) return
    setDraft((d) =>
      d.currentAge === household.currentAge &&
      d.filingStatus === household.filingStatus &&
      d.taxState === household.taxState
        ? d
        : withDerivedRates({
            ...d,
            currentAge: household.currentAge,
            filingStatus: household.filingStatus,
            taxState: household.taxState,
          }),
    )
  }, [household])

  const missing = missingRequired(settledDraft)

  /**
   * Whether pressing Save would write anything different.
   *
   * Compared against what the plan loaded with rather than flagged on the
   * first keystroke: the household's age and state are copied into the draft
   * by an effect on the way in, so a plan nobody had touched would otherwise
   * announce itself unsaved before the reader had done anything. Comparing
   * also lets it go quiet again when a change is undone.
   *
   * An unsaved plan is always worth keeping, so it counts as changed from the
   * moment it has enough in it to store.
   */
  const changed = useMemo(() => {
    if (!inputs) return false
    if (!editingSaved) return true
    return (
      planDiffers(inputs, initialInputs ?? null) ||
      name !== (initialName ?? '') ||
      personName !== (initialPersonName ?? '') ||
      registerDiffers(register ?? EMPTY_REGISTER, initialRegister ?? EMPTY_REGISTER)
    )
  }, [
    inputs,
    editingSaved,
    initialInputs,
    name,
    initialName,
    personName,
    initialPersonName,
    register,
    initialRegister,
  ])



  /**
   * The balances, as one figure, whenever they move.
   *
   * Only the five pots the plan draws on — anything illiquid lives in the
   * register instead, which is what keeps the total above from counting a
   * retirement account twice.
   */
  const liquid =
    (settledDraft.brokerageBalance ?? 0) +
    (settledDraft.balance401k ?? 0) +
    (settledDraft.traditionalIraBalance ?? 0) +
    (settledDraft.rothIraBalance ?? 0) +
    (settledDraft.hsaBalance ?? 0)

  /**
   * What the plan earns in ordinary income, year by year.
   *
   * The register needs it to price a sale: a gain has no rate of its own and
   * is charged at whatever band it reaches on top of everything else that
   * year. It used to be a box on the household — one figure for every sale,
   * which is wrong as soon as there are two at different ages, and a guess
   * even when there is one. The projection already knows.
   *
   * Ordinary income only. Capital gains from the plan's own drawdown stack
   * beside the sale rather than under it, so counting them here would charge
   * the same dollars twice.
   */
  const ordinaryByAge = useMemo(() => {
    const map = new Map<number, number>()
    for (const r of result?.rows ?? []) {
      map.set(
        r.age,
        r.fromDeferred + r.conversion + r.otherIncome + r.taxableSocialSecurity,
      )
    }
    return map
  }, [result])

  useEffect(() => {
    onLiquidChange?.(liquid)
  }, [liquid, onLiquidChange])

  useEffect(() => {
    onIncomeByAge?.(ordinaryByAge)
  }, [ordinaryByAge, onIncomeByAge])

  useEffect(() => {
    if (result) record('plan_completed', undefined, true)
  }, [result])

  const persist = useCallback(
    (plan: PlanInputs) => {
      startTransition(async () => {
        // One save, both tabs. What a plan assumes it owns and owes is part of
        // the scenario rather than a separate record — keeping the rental and
        // selling it are two plans, and neither should overwrite the other.
        //
        // Wrapped, because it was not: a throw inside a transition goes
        // nowhere, so a half-completed save looked exactly like a working one.
        // The plan would store and the register would not, and the only sign
        // was that the button never said "Saved".
        try {
          // One call, both halves. The store writes the register with the
          // plan — in Postgres that is a second table, in the browser it is a
          // nested object — so there is no longer a window where the plan is
          // stored and what it assumes is not.
          const store = requireStore()
          const draftPlan = {
            name,
            personName,
            inputs: plan,
            register: register ?? { holdings: [], liabilities: [] },
          }
          let id = planId
          if (id) await store.update(id, draftPlan)
          else id = await store.save(draftPlan)
          if (!id) throw new Error('The plan was not stored, so there was nothing to attach to.')

          // The plan is stored now, so the draft has served its purpose.
          clearDraftCookie()
          record('plan_saved')
          setError(null)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
          onStored?.()
          // Carry the id in the URL so the next press updates this plan rather
          // than making another, and so a reload comes back to it.
          if (!planId && id) {
            // Keeps the tab: replacing the URL without it would move somebody
            // off the balance sheet at the moment they saved it.
            const keep = activeTab && activeTab !== 'plan' ? `&tab=${activeTab}` : ''
            router.replace(`/planner?plan=${id}${keep}`)
          }
          router.refresh()
        } catch (e) {
          setError(
            e instanceof Error && e.message
              ? e.message
              : 'Could not save. Your figures are still here — try again.',
          )
        }
      })
    },
    [planId, name, personName, register, router, onStored],
  )

  const [copied, setCopied] = useState(false)
  const saveAsNew = useCallback(() => {
    if (!inputs) return
    const typed = name.trim()
    // Renaming before pressing is the natural way to say what the copy is;
    // when they have not, a plan called the same thing twice is worse than a
    // suffix nobody chose.
    const fresh =
      typed && typed !== (initialName ?? '').trim() ? typed : `${typed || 'Plan'} copy`
    startTransition(async () => {
      // A copy of a plan is a copy of what it assumed, or it is not a copy.
      const id = await requireStore().save({
        name: fresh,
        personName,
        inputs,
        register: register ?? { holdings: [], liabilities: [] },
      })
      clearDraftCookie()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      onStored?.()
      // Land on the copy, so the next edit changes it rather than the original.
      router.push(`/planner?plan=${id}`)
      router.refresh()
    })
  }, [inputs, name, initialName, personName, register, router, onStored])

  /**
   * What the button says, decided in one place.
   *
   * "Sign in to save" is a cloud-mode sentence: it is true only where an
   * account is what keeps a plan. In local mode the plan is kept on this
   * machine, and the button says so — the words are the disclosure, and they
   * arrive at the moment the decision is made rather than in a paragraph
   * somebody may not read. Updating an existing plan needs no such warning:
   * it was given the first time.
   */
  /**
   * The first save on a browser says what it is about to do, and waits.
   *
   * "Save on this device" was the first wording and it was wrong in a way
   * that only showed up in use: it reads as *write a file to my computer*,
   * and the first person to press it went looking in their Downloads folder.
   * "In this browser" is both what actually happens and what nothing else on
   * the page could mean — and the disclosure now says outright that no file is
   * made, because the button that does make one is sitting next to it.
   *
   * Once per browser, not once per save: a warning repeated every time is a
   * warning nobody reads by the third one. The second press is the answer, so
   * there is no dialog to dismiss and nothing to tab through — the button
   * changes what it says, and saying yes is pressing the same thing again.
   */
  const [asking, setAsking] = useState(false)

  const saveLabel = asking
    ? 'Yes — keep it in this browser'
    : !isAuthed && !isLocal
    ? 'Sign in to save'
    : planId
      ? 'Update plan'
      : isLocal
        ? 'Save in this browser'
        : 'Save plan'

  const handleSave = () => {
    // Local mode has no sign-in to send anybody to, and nothing to carry
    // across one. The figures are already on this machine; pressing save
    // writes them where they are.
    if (!isAuthed && !isLocal) {
      // Keep the work. Written here rather than on every keystroke: someone
      // signed out has asked for nothing until they press this, and pressing
      // it is exactly the moment their figures are worth carrying across a
      // sign-in.
      //
      // Both halves travel, or only half of them arrives. The plan goes in its
      // cookie and the register beside it — a redirect is a new page, and
      // state that lived only in a component does not survive one.
      writeDraftCookie({ draft, name, personName })
      stashPending({
        household,
        register: register ?? { holdings: [], liabilities: [] },
      })
      const back = activeTab && activeTab !== 'plan'
        ? `/planner?save=1&tab=${activeTab}`
        : '/planner?save=1'
      router.push(`/sign-in?next=${encodeURIComponent(back)}`)
      return
    }

    if (!inputs) return

    if (isLocal && !asking && !hasBeenTold(window.localStorage)) {
      setAsking(true)
      return
    }
    if (isLocal) recordTold(window.localStorage)
    setAsking(false)
    persist(inputs)
  }

  /**
   * The shortcut people press without being told about it.
   *
   * Bound to the same handler as both buttons, so there is one save and three
   * ways to ask for it. The browser's own Save-page dialog is suppressed —
   * nobody pressing this on a form means to file the HTML.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 's' || !(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      if (changed && !pending) handleSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Coming back from that sign-in, with the draft restored by the server.
  // "Sign in to save" promised a save, so it saves rather than leaving them
  // looking at their own figures wondering whether it worked.
  const autoSaved = useRef(false)
  useEffect(() => {
    // Waits for the register to be adopted from the stash. Child effects run
    // before their parent's, so without this the arrival save would fire first
    // and store an empty register — then mark itself done, and the figures
    // that had just been carried across would never be written.
    if (!saveOnArrival || !isAuthed || !autoSaveReady || autoSaved.current || !inputs)
      return
    autoSaved.current = true
    persist(inputs)
    // Drop the flag so a reload does not save the plan a second time.
    router.replace('/planner')
  }, [saveOnArrival, isAuthed, autoSaveReady, inputs, persist, router])

  /**
   * The plan's name and the button that keeps it.
   *
   * Rendered here, where the name and the save handler already live, and put
   * above the tabs by a portal. One press stores this plan and the register
   * beside it, so the control cannot sit inside one of the two things it
   * saves — the DOM has to move even though the state does not.
   */
  const planHeader = (
    <div
      className={cn(
        // gap-1 like the household's own fields, so the two labels sit the
        // same distance above their boxes and the boxes land on one line.
        'flex flex-col gap-1',
        // Slotted it is a column of the household tile, with its heading level
        // with that tile's own. Standing on its own — which it does for the one
        // render before the slot's ref attaches — it still needs a frame.
        !headerSlot && 'rounded-xl bg-card p-5 ring-1 ring-foreground/10',
      )}
    >
      {/* Set as a field label, not a heading. It names a box exactly as "Name"
          does on the other side of the tile, and the two read as one row of
          fields only if they are lettered the same.

          "Plan name", not "This plan": beside a box holding the household's
          name, a label saying "this plan" named the thing the box belonged to
          rather than what went in it. Both labels now say what to type. */}
      <Label htmlFor="planName" className="text-xs text-muted-foreground">
        Plan name
      </Label>
      {/* The box and the buttons on one line. The box had a column of its own
          beside them, which put it a row above the button that saves what is
          in it. */}
      <div className="flex flex-wrap items-center gap-2">
        <ClearingInput
          id="planName"
          value={name}
          onValueChange={setName}
          placeholder="Name this plan"
          maxLength={120}
          className="h-9 w-full min-w-0 flex-1 sm:w-44 sm:flex-none"
        />
        <Button
          size="lg"
          onClick={handleSave}
          // `isAuthed || isLocal` — anywhere a press would actually store
          // something. In cloud mode signed out the press goes to sign-in and
          // is useful with an incomplete plan; everywhere else `handleSave`
          // returns silently on a plan too incomplete to simulate, and a
          // button that does nothing and says nothing is the failure this
          // project keeps writing down.
          disabled={pending || ((isAuthed || isLocal) && !inputs)}
          className="gap-2 px-4 shadow-sm"
        >
          {saved ? (
            <>
              <Check className="size-4" /> Saved
            </>
          ) : (
            <>
              <Save className="size-4" />
              {/* Named, because it is not the only thing being saved.
                  The balance sheet writes itself as it is typed; this
                  button keeps a version of the plan. "Save" alone read
                  as though nothing else was being kept. */}
              {saveLabel}
            </>
          )}
        </Button>
        {/* Only once there is something to copy. On an unsaved plan the
            Save button already makes the new one. */}
        {editingSaved && (
          <Button
            size="lg"
            variant="outline"
            onClick={saveAsNew}
            disabled={pending || !inputs}
            className="gap-2 px-3"
            title="Keep this plan and store the current figures as a second one"
          >
            {copied ? (
              <>
                <Check className="size-4" /> Copied
              </>
            ) : (
              <>
                <CopyPlus className="size-4" />
                <span className="hidden sm:inline">Save as new</span>
              </>
            )}
          </Button>
        )}
      </div>
        {/* Signed out, the honest thing to say first is that nothing is being
            withheld: the whole projection is already on the page. What an
            account buys is that it is still there tomorrow — which is a better
            reason to make one than a wall would be, and it is true. */}
        {error && (
          <span className="max-w-xs text-xs font-medium text-destructive text-pretty">
            {error}
          </span>
        )}
        {/* Only for somebody signed out. Told that Save keeps their plan, a
            signed-in reader learns nothing they did not read on the button. A
            signed-out one is being told the thing the button does not say:
            that the projection is already theirs, and that leaving without an
            account is what loses it. */}
        {/* What pressing it will actually do, which differs by where plans
            are kept. Signed out in cloud mode the point is that the account is
            what keeps this; in local mode the point is that the machine is,
            and that the machine is shared with whoever else uses it. */}
        {!isAuthed && !isLocal && (
          <span className="max-w-xs text-xs text-muted-foreground text-pretty">
            Your projection is right here without an account. Sign in to save it
            for next time, along with your assets and liabilities.
          </span>
        )}
        {isLocal && !planId && (
          <span className="max-w-xs text-xs text-muted-foreground text-pretty">
            {asking
              ? 'Press again to keep it here. It stays inside this browser — no file is made — is not sent anywhere, and anyone else using this browser can open it.'
              : 'Saved plans stay inside this browser. No file is made — “Download a copy” above does that. They are not sent anywhere, they will not follow you to another computer or another browser, and anyone else using this one can open them.'}
          </span>
        )}
    </div>
  )


  /**
   * The same save, pinned below both tabs.
   *
   * The button that names the plan belongs at the top with the name, but the
   * fields run several screens below it, and asking somebody to scroll back to
   * keep what they have just typed is asking them to lose it. At the foot of
   * the inputs card it was no better — five open sections meant scrolling down
   * past everything instead of up past everything — and it left the assets tab
   * with no save at all, though one press keeps that too.
   *
   * The same handler as the button at the top, not a second save: one of them
   * saying "Saved" while the other did not would be two answers to one
   * question.
   */
  const saveRow = (
    <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-border bg-card/95 px-5 py-3 shadow-lg backdrop-blur">
      <span className="mr-auto max-w-md text-xs text-muted-foreground text-pretty">
        {asking
          ? 'This keeps the plan inside this browser. It does not make a file — “Download a copy” does that. It is not sent anywhere, it will not follow you to another computer or another browser, and anyone else using this one can open it.'
          : saved
            ? 'Kept.'
            : changed
              ? isLocal
                ? 'Not saved yet — ⌘S works too. Saving keeps it inside this browser, not as a file.'
                : 'Not saved yet — ⌘S works too.'
              : 'Everything here is saved.'}
      </span>
      <Button
        size="lg"
        onClick={handleSave}
        disabled={pending || ((isAuthed || isLocal) && !inputs) || (!changed && !saved)}
        className="gap-2 px-4 shadow-sm"
      >
        {saved ? (
          <>
            <Check className="size-4" /> Saved
          </>
        ) : (
          <>
            <Save className="size-4" />
            {saveLabel}
          </>
        )}
      </Button>
    </div>
  )
  return (
    <>
      {headerSlot ? createPortal(planHeader, headerSlot) : planHeader}
      {footerSlot && createPortal(saveRow, footerSlot)}
      <div className="flex flex-col gap-6">
      {/* Assumptions first: the inputs are what the rest of the page answers. */}
      <Card className="p-6">
        {/* The heading moved inside the panel, so the two ages could stand
            level with it instead of taking a bordered row underneath. */}
        <PlanInputsPanel
          inputs={draft}
          onChange={setDraft}
          medianAtRetirement={monteCarlo?.balanceAtRetirement.median}
          personName={personName}
          onPersonNameChange={setPersonName}
        />

      </Card>

      {/* Then the verdict and its headline numbers. */}
      <div
        className={cn(
          'flex flex-col gap-6 transition-opacity',
          stale && 'opacity-60',
        )}
      >
        {inputs && result && monteCarlo && (
          <PlanSummary
            inputs={inputs}
            result={result}
            monteCarlo={monteCarlo}
            suggestions={suggestions}
            claiming={claiming}
            earliest={earliest}
          />
        )}

      {/* Then the detail, for anyone who wants to see the working. */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-xl font-medium text-foreground">
              Your projection
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Four views of the same plan, all in today&apos;s money. The chart
              is one of them — the other three show where the money comes from,
              what tax takes, and every year in full.
            </p>
          </div>
          {monteCarlo && inputs && (
            <ConfidenceBadge monteCarlo={monteCarlo} endAge={inputs.endAge} />
          )}
        </div>

        {/* Nothing at all while another tab is showing. Falling through to
            the empty state would tell a complete plan to go and fill itself
            in — invisible today, because the panel is hidden anyway, and
            wrong the moment that changes. */}
        {!active ? null : inputs && result ? (
          <Tabs
            defaultValue="balance"
            onValueChange={(value) => {
              /**
               * Only a deliberate switch is recorded.
               *
               * The first tab is shown without anybody clicking it, so
               * counting that would report an interest nobody expressed and
               * would swamp the other three. Once per tab per visit, because
               * flipping back and forth is one act of reading rather than
               * several.
               */
              if (typeof value === 'string') {
                record('tab_viewed', tabPath(value), true)
              }
            }}
          >
            {/* Rendered from the shared list rather than written out, so the
                labels here and the ones the admin reports cannot drift.

                Full width and taller than the default: at `w-fit` and `h-8`
                these sat in the corner looking like a chip, and people read
                past them. Four equal targets spanning the card read as
                navigation, which is what they are. */}
            <TabsList className="h-auto w-full gap-2 bg-transparent p-0">
              {PLANNER_TABS.map((t) => {
                const Icon = TAB_ICONS[t.value]
                return (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className={cn(
                      // A button you can see the edge of, with a rule under it
                      // that fills in as you arrive. The default variant swaps
                      // a background on the active tab and leaves the other
                      // three as bare text, which is what made a row of four
                      // read as a caption rather than as somewhere to go.
                      'h-auto flex-col items-center gap-0.5 rounded-lg border',
                      'border-b-[3px] border-border border-b-transparent bg-card',
                      'px-2 py-2.5 text-foreground/80 transition-colors',
                      // The invitation: hovering colours the rule in before
                      // anything is clicked, so the affordance is discovered
                      // by moving the mouse rather than by reading.
                      'hover:border-primary/40 hover:border-b-primary/50 hover:bg-accent/30 hover:text-foreground',
                      'data-active:border-primary/50 data-active:border-b-primary data-active:bg-accent/50 data-active:text-foreground data-active:shadow-sm',
                      // Stated for dark too. The base sets `dark:data-active:*`
                      // separately, which tailwind-merge cannot fold into the
                      // light rules above — left alone, the active tab would
                      // lose its accent and its border in dark mode only.
                      'dark:data-active:border-primary/50 dark:data-active:border-b-primary dark:data-active:bg-accent/60',
                      'sm:flex-row sm:gap-2 sm:px-3',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex flex-col items-center sm:items-start">
                      <span className="text-xs sm:text-sm">{t.label}</span>
                      {/* The question it settles, which the noun alone does
                          not convey. Hidden on the narrowest screens, where
                          four columns have no room for a second line. */}
                      <span className="hidden text-[11px] font-normal text-muted-foreground lg:block">
                        {t.hint}
                      </span>
                    </span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            <TabsContent value="balance" className="pt-4">
              {monteCarlo && (
                <ProjectionChart
                  monteCarlo={monteCarlo}
                  retirementAge={Math.max(inputs.retirementAge, inputs.currentAge)}
                  returns={{
                    saving: inputs.preRetirementReturn,
                    savingVolatility: inputs.preRetirementVolatility,
                    retired: inputs.postRetirementReturn,
                    retiredVolatility: inputs.postRetirementVolatility,
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="income" className="pt-4">
              <div className="flex flex-col gap-6">
                <IncomeChart result={result} inputs={inputs} />
                <FundingMix result={result} />
              </div>
            </TabsContent>
            <TabsContent value="tax" className="pt-4">
              <TaxPhases
                inputs={inputs}
                rows={result.rows}
                conversions={conversions}
                room={room}
              />
            </TabsContent>
            <TabsContent value="table" className="pt-4">
              <YearTable result={result} />
            </TabsContent>
          </Tabs>
        ) : (
          <EmptyProjection missing={missing} />
        )}
        </Card>

        {inputs && result && monteCarlo && (
          <Insights
            inputs={inputs}
            result={result}
            monteCarlo={monteCarlo}
            conversions={conversions}
          />
        )}

        {/* Below the insights, because a deadline is only interesting once you
            know why the thing it applies to matters. */}
        {inputs && result && <WhatsStillOpen inputs={inputs} result={result} />}

        {/* Last, because it asks for something rather than rearranging what is
            already there — and nobody wants to be told to spend less before
            they have been told what they already have. */}
        {inputs && leverage && (
          <SpendingLever leverage={leverage} inputs={inputs} />
        )}
      </div>
    </div>
    </>
  )
}

/**
 * What this plan makes possible, or makes urgent.
 *
 * Below the projection because it reads off it: each of these is triggered by
 * the figures above rather than offered to everyone, which is the difference
 * between an insight and a pamphlet.
 */
function Insights({
  inputs,
  result,
  monteCarlo,
  conversions,
}: {
  conversions: ConversionComparison | null
  inputs: PlanInputs
  result: ReturnType<typeof simulate>
  monteCarlo: MonteCarloResult
}) {
  const insights = useMemo(
    () => buildInsights(inputs, result, monteCarlo, conversions),
    [inputs, result, monteCarlo, conversions],
  )
  if (insights.length === 0) return null

  return (
    /* Named so the tax tab can link straight here. `scroll-mt` clears the
       sticky header, which is h-16 — without it the browser scrolls the
       heading to y=0 and the header sits on top of it. */
    <Card id={INSIGHTS_ID} className="p-6 gap-4 scroll-mt-20">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-medium text-foreground">
          Worth looking at
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Drawn from the figures above, so these change as the plan does. General
          considerations rather than advice — the amounts are yours, the rules
          are everyone&apos;s.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {insights.map((insight) => (
          <li key={insight.key} className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground text-pretty">
                {insight.title}
              </p>
              <p className="text-sm text-muted-foreground text-pretty leading-relaxed">
                {insight.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function GhostCurve() {
  // Smooth (S) joins so the apex rounds over instead of forming a peak:
  // a slow compounding rise, a gentle top around retirement, then drawdown.
  // Apex sits low enough to clear the message above it.
  const curve =
    'M0,292 C170,288 280,272 350,220 S432,158 462,166 S548,238 600,274'
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 600 300"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ghostFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {[60, 116, 172, 228, 284].map((y) => (
        <line
          key={y}
          x1="0"
          x2="600"
          y1={y}
          y2={y}
          stroke="var(--border)"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <path d={`${curve} L600,300 L0,300 Z`} fill="url(#ghostFill)" />
      <path
        d={curve}
        fill="none"
        stroke="var(--chart-1)"
        strokeOpacity={0.28}
        strokeWidth={2}
        strokeDasharray="5 4"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function EmptyProjection({ missing }: { missing: readonly MoneyField[] }) {
  const list = missing.map((f) => MONEY_LABELS[f] ?? f)
  const sentence =
    list.length === 1
      ? list[0]
      : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-lg">
      <GhostCurve />
      <div className="absolute inset-x-0 top-0 flex justify-center px-6 pt-10">
        <div className="max-w-sm text-center">
          <p className="font-medium text-foreground">Your projection appears here</p>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Enter your {sentence} on the left and the chart updates as you type.
          </p>
        </div>
      </div>
    </div>
  )
}

function YearTable({ result }: { result: ReturnType<typeof simulate> }) {
  // A column of dashes for everyone without a pension is worse than no column.
  const hasOther = result.rows.some((r) => r.otherIncome > 0)
  // Neither of these applies to most plans, and both are the whole story on
  // the plans they do apply to.
  const hasRmd = result.rows.some((r) => r.requiredDistribution > 0)
  const hasSurplus = result.rows.some((r) => r.surplus > 0)
  const hasShortfall = result.rows.some((r) => r.unfunded > 0)
  const hasIrmaa = result.rows.some((r) => r.irmaaSurcharge > 0)
  const hasHealth = result.rows.some((r) => r.healthPremium > 0)
  const hasMatch = result.rows.some((r) => r.employerMatch > 0)
  const hasHsa = result.rows.some((r) => r.hsaBalance > 0)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground text-pretty">
        Every figure is in today&apos;s dollars, like the rest of the page, and
        holds its buying power. The one exception is named: spending{' '}
        <span className="font-medium text-foreground">that year</span> is the
        same spending after inflation, which is what will actually leave the
        account — and what the withdrawal beside it is really sized to cover.
      </p>

      {hasRmd && (
        <p className="text-xs text-muted-foreground text-pretty">
          <span className="font-medium text-foreground">RMD</span> is the
          required minimum distribution: the least the law makes you take out
          of the 401(k) and IRA that year. Where it is larger than the
          withdrawal the plan would otherwise have made, it is the withdrawal.
          {hasSurplus && (
            <>
              {' '}
              <span className="font-medium text-foreground">Surplus</span> is
              the part of it your spending did not call for — already taxed, so
              it moves to the brokerage account rather than staying where it
              was, and its growth is taxable from then on.
            </>
          )}
        </p>
      )}

      {hasIrmaa && (
        <p className="text-xs text-muted-foreground text-pretty">
          <span className="font-medium text-foreground">Medicare</span> is the
          extra Medicare charges the year, above the ordinary premium, for
          having had a higher income two years earlier. It is a premium rather
          than a tax, so it is not in the Tax column — it is spending the
          withdrawal beside it had to cover.
        </p>
      )}

      {hasHealth && (
        <p className="text-xs text-muted-foreground text-pretty">
          <span className="font-medium text-foreground">Health</span> is what
          cover costs you that year. Before {MEDICARE_AGE} it is worked out from
          that year&apos;s own income — the subsidy is already taken off — and
          from {MEDICARE_AGE} it is what you entered as the cost on top of
          Medicare. Like the column beside it, a premium rather than a tax, and
          funded by the withdrawal on the same row. The pre-{MEDICARE_AGE} part
          is {NATIONAL_AVERAGE_NOTE} — read the shape of the column, and treat
          any single figure in it as indicative.
        </p>
      )}

      {hasShortfall && (
        <p className="text-xs text-muted-foreground text-pretty">
          <span className="font-medium text-destructive">Short</span> is the
          spending the accounts could not cover once they ran dry. The
          withdrawal beside it stops at what was actually there, so these years
          are ones the plan does not pay for rather than ones it funds from
          nothing.
        </p>
      )}

      <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Age</th>
              {/* Which year these are the dollars of. Without it a figure
                  inflated nine years ahead just looks bigger than the same
                  benefit quoted in today's money elsewhere on the page. */}
              <th className="px-3 py-2 font-medium">Year</th>
              <th className="px-3 py-2 font-medium text-right">Contributions</th>
              {hasMatch && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="What your employer added alongside your own contribution"
                >
                  Match
                </th>
              )}
              {hasHsa && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="The HSA: paid in while working, drawn untaxed in retirement"
                >
                  HSA
                </th>
              )}
              <th className="px-3 py-2 font-medium text-right">
                Spending
                <span className="block text-[10px] font-normal normal-case">
                  today&apos;s $
                </span>
              </th>
              {/* The same spending after inflation. Asked for repeatedly, and
                  fairly: a level real figure is the adjustment divided back
                  out, which looks like no adjustment at all. */}
              <th className="px-3 py-2 font-medium text-right">
                Spending
                <span className="block text-[10px] font-normal normal-case">
                  that year
                </span>
              </th>
              <th className="px-3 py-2 font-medium text-right">Soc. Sec.</th>
              {hasOther && (
                <th className="px-3 py-2 font-medium text-right">Other income</th>
              )}
              {hasRmd && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Required minimum distribution: what the law forces out of the 401(k) and IRA this year, whether or not the spending needs it"
                >
                  RMD
                </th>
              )}
              <th
                className="px-3 py-2 font-medium text-right"
                title="The withdrawal, and what share of the balance it came out of — the figure the 4% rule measures"
              >
                Withdrawal (rate)
              </th>
              {hasSurplus && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="The part of the withdrawal the spending did not need — taxed, then moved to the brokerage account"
                >
                  Surplus
                </th>
              )}
              {hasShortfall && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="Spending the accounts could not cover, after tax on what they could"
                >
                  Short
                </th>
              )}
              <th className="px-3 py-2 font-medium text-right">Tax</th>
              {hasIrmaa && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="The Medicare surcharge for having had a higher income two years earlier — a premium, not a tax"
                >
                  Medicare
                </th>
              )}
              {hasHealth && (
                <th
                  className="px-3 py-2 font-medium text-right"
                  title="What health cover costs you that year: marketplace before 65, net of any subsidy; what you entered on top of Medicare from 65"
                >
                  Health
                </th>
              )}
              <th className="px-3 py-2 font-medium text-right">Growth</th>
              <th className="px-3 py-2 font-medium text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr
                key={r.age}
                className="border-t border-border tabular-nums hover:bg-muted/50"
              >
                <td className="px-3 py-1.5">
                  {r.age}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {r.phase === 'retirement' ? 'ret.' : ''}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.year}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {r.contributions ? fmt(r.contributions) : '—'}
                </td>
                {hasMatch && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.employerMatch ? fmt(r.employerMatch) : '—'}
                  </td>
                )}
                {hasHsa && (
                  // Paid in while working, drawn down after — one column, so
                  // the account can be followed across the whole plan rather
                  // than appearing twice under different headings.
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.hsaContribution
                      ? fmt(r.hsaContribution)
                      : r.fromHsa
                        ? `−${fmt(r.fromHsa)}`
                        : '—'}
                    {r.hsaBalance >= 1 && (
                      <span className="block text-[11px] text-muted-foreground/70">
                        {fmt(r.hsaBalance)} left
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right text-foreground">
                  {r.spending ? fmt(r.spending) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-foreground">
                  {r.spendingThatYear ? fmt(r.spendingThatYear) : '—'}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {r.socialSecurity ? fmt(r.socialSecurity) : '—'}
                </td>
                {hasOther && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.otherIncome ? fmt(r.otherIncome) : '—'}
                  </td>
                )}
                {hasRmd && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.requiredDistribution ? fmt(r.requiredDistribution) : '—'}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {r.withdrawals ? (
                    <>
                      {fmt(r.withdrawals)}
                      {/* The share of the balance it came out of, which is what
                          the 4% rule measures — beside the figure it describes
                          rather than a column away from it. A real space, so
                          the cell reads properly when copied or read aloud. */}
                      {r.startBalance > 0 && (
                        <span className="text-xs text-muted-foreground/70">
                          {' '}
                          ({((r.withdrawals / r.startBalance) * 100).toFixed(1)}%)
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                {hasSurplus && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.surplus ? fmt(r.surplus) : '—'}
                  </td>
                )}
                {hasShortfall && (
                  <td className="px-3 py-1.5 text-right text-destructive">
                    {r.unfunded ? fmt(r.unfunded) : '—'}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {r.taxes ? fmt(r.taxes) : '—'}
                </td>
                {hasIrmaa && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.irmaaSurcharge >= 1 ? fmt(r.irmaaSurcharge) : '—'}
                  </td>
                )}
                {hasHealth && (
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {r.healthPremium >= 1 ? fmt(r.healthPremium) : '—'}
                  </td>
                )}
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {fmt(r.growth)}
                </td>
                <td className="px-3 py-1.5 text-right font-medium text-foreground">
                  {fmt(r.endBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)
}
