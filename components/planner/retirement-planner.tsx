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
  writeDraftCookie,
  type StoredDraft,
} from '@/lib/planner-draft'
import { runMonteCarlo } from '@/lib/monte-carlo'
import type { MonteCarloResult } from '@/lib/monte-carlo'
import { compareClaimAges, suggestFixes, TARGET_CONFIDENCE } from '@/lib/suggestions'
import { savePlan, updatePlan } from '@/app/actions/plans'
import { PlanInputsPanel } from './plan-inputs'
import { PlanSummary } from './plan-summary'
import { ProjectionChart } from './projection-chart'
import { IncomeChart } from './income-chart'
import { TaxPhases } from './tax-phases'
import { ConfidenceBadge } from './confidence-badge'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildInsights } from '@/lib/insights'
import { compareConversions, type ConversionComparison } from '@/lib/conversions'
import { Save, Check, CopyPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The value once it has stopped changing for `ms`. Used to keep expensive work
 * off the typing path; the timeout means the state change is never synchronous
 * inside the effect.
 */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return settled
}

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
}

export function RetirementPlanner({
  isAuthed,
  initialInputs,
  initialName,
  initialPersonName,
  planId,
  initialDraft,
  saveOnArrival = false,
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
  const settledDraft = useSettled(draft, 250)
  const stale = settledDraft !== draft

  const inputs = useMemo(() => toPlanInputs(settledDraft), [settledDraft])
  const result = useMemo(() => (inputs ? simulate(inputs) : null), [inputs])
  const monteCarlo = useMemo(() => (inputs ? runMonteCarlo(inputs) : null), [inputs])
  // Worked out once and handed to both the tax tab and the insight card. It
  // costs a sweep of projections plus a market run per row shown, and — more
  // importantly — the two must quote the same figure. They used not to.
  const conversions = useMemo(
    () => (inputs ? compareConversions(inputs) : null),
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
  const missing = missingRequired(settledDraft)

  const persist = useCallback(
    (plan: PlanInputs) => {
      startTransition(async () => {
        if (planId) {
          await updatePlan(planId, name, personName, plan)
        } else {
          await savePlan(name, personName, plan)
        }
        // The plan is stored now, so the draft has served its purpose.
        clearDraftCookie()
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        router.refresh()
      })
    },
    [planId, name, personName, router],
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
      const row = await savePlan(fresh, personName, inputs)
      clearDraftCookie()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      // Land on the copy, so the next edit changes it rather than the original.
      router.push(`/planner?plan=${row.id}`)
      router.refresh()
    })
  }, [inputs, name, initialName, personName, router])

  const handleSave = () => {
    if (!isAuthed) {
      // Keep the work. The draft is written here rather than on every
      // keystroke: someone signed out has asked for nothing until they press
      // this, and pressing it is exactly the moment their figures are worth
      // carrying across a sign-in.
      writeDraftCookie({ draft, name, personName })
      router.push(`/sign-in?next=${encodeURIComponent('/planner?save=1')}`)
      return
    }
    if (!inputs) return
    persist(inputs)
  }

  // Coming back from that sign-in, with the draft restored by the server.
  // "Sign in to save" promised a save, so it saves rather than leaving them
  // looking at their own figures wondering whether it worked.
  const autoSaved = useRef(false)
  useEffect(() => {
    if (!saveOnArrival || !isAuthed || autoSaved.current || !inputs) return
    autoSaved.current = true
    persist(inputs)
    // Drop the flag so a reload does not save the plan a second time.
    router.replace('/planner')
  }, [saveOnArrival, isAuthed, inputs, persist, router])

  return (
    <div className="flex flex-col gap-6">
      {/* Assumptions first: the inputs are what the rest of the page answers. */}
      <Card className="p-6">
        <div className="mb-4 flex flex-col gap-1">
          <h2 className="font-serif text-xl font-medium text-foreground">
            Your assumptions
          </h2>
          <p className="text-sm text-muted-foreground">
            Open a section to adjust it. Everything below updates as you type.
          </p>
        </div>
        <PlanInputsPanel
          inputs={draft}
          onChange={setDraft}
          medianAtRetirement={monteCarlo?.balanceAtRetirement.median}
          name={name}
          onNameChange={setName}
          personName={personName}
          onPersonNameChange={setPersonName}
          saveButton={
            <div className="flex items-center gap-2">
              <Button
                size="lg"
                onClick={handleSave}
                disabled={pending || (isAuthed && !inputs)}
                className="gap-2 px-4 shadow-sm"
              >
                {saved ? (
                  <>
                    <Check className="size-4" /> Saved
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    {isAuthed ? (planId ? 'Update' : 'Save') : 'Sign in to save'}
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
          }
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
          />
        )}

      {/* Then the detail, for anyone who wants to see the working. */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-xl font-medium text-foreground">
              Your projection
            </h2>
            <p className="text-sm text-muted-foreground">
              Balance, where the money comes from, and what tax takes — all in
              today&apos;s money.
            </p>
          </div>
          {monteCarlo && inputs && (
            <ConfidenceBadge monteCarlo={monteCarlo} endAge={inputs.endAge} />
          )}
        </div>

        {inputs && result ? (
          <Tabs defaultValue="balance">
            <TabsList>
              <TabsTrigger value="balance">Balance</TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="tax">Tax</TabsTrigger>
              <TabsTrigger value="table">Yearly detail</TabsTrigger>
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
              <IncomeChart result={result} inputs={inputs} />
            </TabsContent>
            <TabsContent value="tax" className="pt-4">
              <TaxPhases
                inputs={inputs}
                rows={result.rows}
                conversions={conversions}
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
      </div>
    </div>
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
    <Card className="p-6 gap-4">
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
