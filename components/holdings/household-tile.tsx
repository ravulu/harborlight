'use client'

import { useState } from 'react'

import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { FILING_STATUSES, STATE_TAXES } from '@/lib/state-tax'
import { InfoTip } from '@/components/planner/info-tip'
import { AGE_MAX, AGE_MIN } from '@/components/planner/plan-inputs'
import { useWindowReturn } from '@/lib/use-window-return'
import type { HouseholdFacts } from '@/lib/balance-sheet'

/**
 * Who the household is, asked once and above both tabs.
 *
 * These three were on the plan and on the register too, which meant a
 * household could be single in California on one tab and married in Texas on
 * the other while a net-worth figure quietly added the two together. They are
 * not scenario settings — nobody is two ages — so they sit above the tabs that
 * use them rather than inside either.
 *
 * A plan drawn up for somebody else is a plan named after them, not a second
 * household.
 */
export function HouseholdTile({
  facts,
  onChange,
  saving,
  isAuthed,
  planSlot,
}: {
  facts: HouseholdFacts
  onChange: (next: HouseholdFacts) => void
  saving?: boolean
  isAuthed?: boolean
  /**
   * Where the plan's own name and its Save button land, by portal.
   *
   * They sat in a card of their own directly above this one, which was two
   * cards of chrome for one row of controls. They belong here: this tile is
   * already the thing above the tabs that describes who the figures are about,
   * and Save keeps everything below it.
   *
   * A portal rather than a move, because the state behind those controls lives
   * in the planner and has to keep living there — the button cannot sit inside
   * one of the two tabs it saves.
   */
  planSlot?: (el: HTMLDivElement | null) => void
}) {
  const set = <K extends keyof HouseholdFacts>(key: K, value: HouseholdFacts[K]) =>
    onChange({ ...facts, [key]: value })

  /** What is being typed, while it is being typed. Null means show the stored value. */
  const [age, setAge] = useState<string | null>(null)
  // Skips the emptying when the browser is handing the window back rather than
  // somebody choosing the field, so a part-typed age survives a tab away.
  const returning = useWindowReturn()

  return (
    <Card className="p-5 gap-4">
      {/* Title, then two labelled columns, then the rest of the household.

          "Name" and "This plan" are the same kind of thing — a label over a
          box — so they are set the same way and sit on the same line, with
          their boxes on the line under. Only "About you" is a heading, and it
          is the tile's. */}
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
        About you
        {/* That it saves with your account is not worth a line: the tile does
            nothing else, and saying so told a signed-in reader what they
            already had. That it is *not* being saved is the one somebody
            needs — it is the promise the app makes everywhere else, that
            nothing survives the session without an account behind it. */}
        {saving ? (
          <span className="font-normal normal-case tracking-normal text-muted-foreground">
            Saving…
          </span>
        ) : (
          !isAuthed && (
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              Not saved — sign in from your plan to keep it
            </span>
          )
        )}
      </span>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label htmlFor="householdName" className="text-xs text-muted-foreground">
            Name
          </Label>
          <Input
            id="householdName"
            value={facts.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            maxLength={120}
            className="h-9 w-full truncate"
          />
        </div>

        {/* The plan's own label and box, by portal from the planner, set the
            same way as Name so the two rows line up across the tile. */}
        <div ref={planSlot} className="empty:hidden" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="householdAge" className="flex items-center gap-1 text-xs text-muted-foreground">
          Your age now
          <InfoTip label="Your age now">
            <p>
              Everything is measured from it: how many years the plan has to
              run, and how far away a sale or a maturity is on the balance
              sheet.
            </p>
            <p>
              One age, not one per plan. A plan drawn up for somebody else is
              a plan named after them.
            </p>
          </InfoTip>
        </Label>
        {/* Clears when you choose it, like every other figure on the site.
            It did not, and a field already showing 30 turned a typed 53 into
            3053 — an age the projection will happily run with, because
            nothing downstream thinks to disbelieve it. */}
        <Input
          id="householdAge"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={age ?? (facts.currentAge === 0 ? '' : String(facts.currentAge))}
          placeholder="e.g. 55"
          onFocus={() => {
            if (returning()) return
            setAge('')
          }}
          onClick={() => setAge('')}
          onBlur={() => setAge(null)}
          onChange={(e) => {
            // Two digits is every age anybody has. Trimming as they type is
            // what stops a third from being appended to a figure that was
            // already there.
            const typed = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
            setAge(typed)
            const n = Number(typed)
            set(
              'currentAge',
              typed === '' || !Number.isFinite(n)
                ? 0
                : Math.min(AGE_MAX, n),
            )
          }}
          // h-9 like the selects beside it and the two boxes above. The
          // Input default is h-8, so this one box sat a row shorter than
          // everything it is meant to line up with.
          className="h-9 tabular-nums"
        />
        {facts.currentAge > 0 && facts.currentAge < AGE_MIN && (
          <span className="text-[11px] text-destructive text-pretty">
            That is under {AGE_MIN}. Everything here is measured from it, so
            it is worth checking.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="householdStatus" className="flex items-center gap-1 text-xs text-muted-foreground">
          Filing status
          <InfoTip label="Filing status">
            <p>
              It decides more than the brackets. Married thresholds are
              roughly twice as wide for the Medicare surcharge, for how much
              of Social Security is taxed, and for the health-insurance
              subsidy before 65.
            </p>
          </InfoTip>
        </Label>
        <select
          id="householdStatus"
          value={facts.filingStatus}
          onChange={(e) =>
            set('filingStatus', e.target.value === 'married' ? 'married' : 'single')
          }
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none"
        >
          {FILING_STATUSES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="householdState" className="flex items-center gap-1 text-xs text-muted-foreground">
          State
          <InfoTip label="State">
            <p>
              Pick one and the rates are worked out from its real brackets,
              year by year — including whether it taxes Social Security and
              whether it exempts retirement income.
            </p>
            <p>
              Leave it as no state income tax and only federal is charged.
            </p>
          </InfoTip>
        </Label>
        <select
          id="householdState"
          value={facts.taxState}
          onChange={(e) => set('taxState', e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none"
        >
          <option value="">No state income tax</option>
          {STATE_TAXES.map((st) => (
            <option key={st.code} value={st.code}>
              {st.name}
              {st.note ? ` — ${st.note}` : ''}
            </option>
          ))}
        </select>
          </div>

      </div>

    </Card>
  )
}
