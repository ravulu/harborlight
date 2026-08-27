'use client'

import { useCallback, useState } from 'react'
import { LineChart, Landmark } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RetirementPlanner } from '@/components/planner/retirement-planner'
import { HoldingsScreen } from '@/components/holdings/holdings-screen'
import { HoldingsSummary } from '@/components/holdings/holdings-summary'
import { useBalanceSheet } from '@/lib/use-balance-sheet'
import { HouseholdTile } from '@/components/holdings/household-tile'
import type { HouseholdFacts, Register } from '@/lib/balance-sheet'
import type { PlanInputs } from '@/lib/retirement'
import type { StoredDraft } from '@/lib/planner-draft'
import { cn } from '@/lib/utils'
import { WORKSPACE_TABS, sectionPath } from '@/lib/planner-tabs'
import { record } from '@/lib/usage'

/**
 * The plan and the register, under one roof.
 *
 * They were two pages, and the split made the household look like two
 * unrelated things — a projection over here, a list of property over there,
 * with no figure anywhere for what the family is actually worth. The plan is
 * the parent because it is what people come for; the register is the other
 * half of the same balance sheet.
 *
 * The summary sits above both tabs rather than inside either, because it is
 * the one figure that belongs to neither on its own.
 */
export function PlannerWorkspace({
  isAuthed,
  initialInputs,
  initialName,
  initialPersonName,
  planId,
  initialDraft,
  saveOnArrival = false,
  initialHousehold,
  initialRegister,
  initialTab,
}: {
  isAuthed: boolean
  /** Read on the server for a signed-in visitor, so the first paint is right. */
  initialHousehold: HouseholdFacts | null
  /** What the plan being opened assumes, if a saved one is open. */
  initialRegister: Register | null
  /** Which tab to open on, from the URL. Set when returning from a sign-in. */
  initialTab?: string
  initialInputs?: PlanInputs
  initialName?: string
  initialPersonName?: string
  planId?: number
  initialDraft?: StoredDraft | null
  saveOnArrival?: boolean
}) {
  const { household, register, setHousehold, setRegister, saving, adopted } =
    useBalanceSheet(isAuthed, initialHousehold, initialRegister, planId)
  const [liquid, setLiquid] = useState(0)
  const [headerSlot, setHeaderSlot] = useState<HTMLDivElement | null>(null)
  /**
   * Where the save lands a second time, below both tabs.
   *
   * One press keeps the plan and the register together, so the control has to
   * be reachable from either side of them. Inside the plan tab it was not
   * there at all for somebody entering a house and a mortgage, who had further
   * to scroll for it than anyone and nothing to scroll to.
   */
  const [footerSlot, setFooterSlot] = useState<HTMLDivElement | null>(null)
  const [incomeByAge, setIncomeByAge] = useState<Map<number, number>>(new Map())
  /**
   * Which tab is showing, tracked rather than left to the component.
   *
   * Both panels stay mounted so neither loses what was typed, and a hidden
   * panel measures nothing — a chart inside one is asked to draw itself into
   * a box of no width, which it rightly complains about. The plan needs to
   * know when it is the one being looked at.
   */
  const [tab, setTab] = useState(() =>
    // Only a tab that exists. A hand-typed `?tab=` would otherwise leave the
    // page showing neither panel, and the URL is the one input here that
    // anybody can write.
    WORKSPACE_TABS.some((t) => t.value === initialTab) ? initialTab! : 'plan',
  )

  // Stable, or the effect reporting it would fire on every render of the plan.
  const onLiquidChange = useCallback((v: number) => setLiquid(v), [])
  const onIncomeByAge = useCallback((m: Map<number, number>) => setIncomeByAge(m), [])

  /**
   * Two tabs. The balance sheet is one thing, not two.
   *
   * It was briefly split into what the household owns and what it owes, which
   * read well as headings and fell apart in use: a mortgage and a car loan are
   * captured with the thing they are secured against, so a debts tab that
   * excluded them meant debt in two places and neither tab holding all of it.
   *
   * Comment the second entry to take the register out of the app: its
   * components and engines are self-contained, nothing else imports them, and
   * the summary above drops the columns it can no longer fill.
   */
  const icons: Record<string, typeof LineChart> = {
    plan: LineChart,
    assets: Landmark,
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Above the tabs because both use it. Age, filing status and state were
          asked in the plan and on the balance sheet, which let one household
          be single in California on one tab and married in Texas on the
          other. */}
      {/* The plan's name and Save land inside that tile by portal, above both
          tabs, so one press visibly keeps everything below it. They had a card
          of their own here, which was a second frame around a single row. */}
      <HouseholdTile
        facts={household}
        onChange={setHousehold}
        saving={saving}
        isAuthed={isAuthed}
        planSlot={setHeaderSlot}
      />

      <HoldingsSummary
        household={household}
        register={register}
        liquid={liquid}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (typeof value === 'string') setTab(value)
          // Only a deliberate switch, once per tab per visit — the same
          // contract the projection's own tabs use. The first tab is shown
          // without a click, so counting it would report interest nobody
          // expressed.
          if (typeof value === 'string') {
            record('tab_viewed', sectionPath(value), true)
          }
        }}
      >
        <TabsList className="h-auto w-full gap-2 bg-transparent p-0 sm:w-fit">
          {WORKSPACE_TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className={cn(
                'h-auto flex-1 gap-2 rounded-lg border sm:flex-none',
                'border-b-[3px] border-border border-b-transparent bg-card',
                'px-4 py-2.5 text-foreground/80 transition-colors',
                'hover:border-primary/40 hover:border-b-primary/50 hover:bg-accent/30 hover:text-foreground',
                'data-active:border-primary/50 data-active:border-b-primary data-active:bg-accent/50 data-active:text-foreground data-active:shadow-sm',
                'dark:data-active:border-primary/50 dark:data-active:border-b-primary dark:data-active:bg-accent/60',
              )}
            >
              {icons[t.value] && (
                (() => {
                  const Icon = icons[t.value]
                  return <Icon className="size-4 shrink-0" />
                })()
              )}
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Both panels stay mounted.
            base-ui unmounts a hidden panel by default, which quietly threw
            away everything typed into the plan the moment somebody looked at
            their balance sheet: the draft lives in component state, and the
            cookie that would have restored it is only written for signed-in
            users. Rendering both costs nothing that matters — the ten-thousand
            run simulation is memoised on the inputs, so a hidden panel
            recomputes nothing. */}
        <TabsContent value="plan" keepMounted className="pt-6">
          <RetirementPlanner
            isAuthed={isAuthed}
            initialInputs={initialInputs}
            initialName={initialName}
            initialPersonName={initialPersonName}
            planId={planId}
            initialDraft={initialDraft}
            saveOnArrival={saveOnArrival}
            onLiquidChange={onLiquidChange}
            onIncomeByAge={onIncomeByAge}
            household={household}
            register={register}
            initialRegister={initialRegister}
            headerSlot={headerSlot}
            footerSlot={footerSlot}
            active={tab === 'plan'}
            autoSaveReady={adopted}
            activeTab={tab}
          />
        </TabsContent>

        <TabsContent value="assets" keepMounted className="pt-6">
          <HoldingsScreen
            household={household}
            register={register}
            onChange={setRegister}
            incomeByAge={incomeByAge}
            isAuthed={isAuthed}
          />
        </TabsContent>
      </Tabs>

      {/* Sticks to the bottom of the window while either tab's fields are on
          screen, and stops at the end of the workspace like any other element.
          Sticky rather than fixed: nothing on this page clips, so it needs no
          portal out of the layout and cannot end up pinned to the wrong box. */}
      <div ref={setFooterSlot} className="sticky bottom-0 z-20 empty:hidden" />
    </div>
  )
}
