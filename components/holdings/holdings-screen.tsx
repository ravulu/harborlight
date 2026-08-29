'use client'

import { useMemo, useState } from 'react'
import { record } from '@/lib/usage'
import { ChevronDown, Plus, RotateCcw, Trash2 } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/retirement'
import { FILING_STATUSES, STATE_TAXES } from '@/lib/state-tax'
import {
  HOLDING_KINDS,
  annualCosts,
  carryIsLongTerm,
  endAgeOf,
  isSyndication,
  isInterestBearing,
  isProperty,
  annualIncome,
  realise,
  type Holding,
  type HoldingKind,
} from '@/lib/holdings'
import { blankHolding } from '@/lib/holdings-store'
import type { HouseholdFacts, Register } from '@/lib/balance-sheet'
import { cn } from '@/lib/utils'
import type { Liability } from '@/lib/liabilities'
import { DebtPayoffCalculator } from '@/components/debt/debt-payoff-calculator'
import { LiabilitiesList } from '@/components/holdings/liabilities-list'
import { InfoTip } from '@/components/planner/info-tip'
import { caretAfter, significantBefore, withThousands } from '@/lib/number-format'
import { useWindowReturn } from '@/lib/use-window-return'

const money = (v: number) => formatCurrency(v)
const kindOf = (k: HoldingKind) => HOLDING_KINDS.find((x) => x.kind === k)!

/**
 * A money box that separates as you type.
 *
 * The same contract as the planner's fields, and the same helpers behind it:
 * grouping a figure while it is being typed moves the caret, so the digits
 * before it are counted first and the caret is put back after the same ones.
 * Without that, typing into the middle of a number throws you to the end.
 */
function Money({
  label,
  value,
  onChange,
  hint,
  info,
  period,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  hint?: string
  info?: React.ReactNode
  /** "per month", "per year" — stated beside the label rather than inside it. */
  period?: string
}) {
  const [text, setText] = useState<string | null>(null)
  // Skips the emptying when the browser is handing the window back rather than
  // someone choosing the field, so a part-typed figure survives a tab away.
  const returning = useWindowReturn()

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {period && (
          <span className="text-muted-foreground/70">· {period}</span>
        )}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text ?? withThousands(String(value))}
          placeholder="0"
          onFocus={() => {
            if (returning()) return
            setText('')
          }}
          onClick={() => setText('')}
          onBlur={() => setText(null)}
          onChange={(e) => {
            const el = e.target
            const typed = el.value
            const digits = significantBefore(typed, el.selectionStart ?? typed.length)
            const formatted = withThousands(typed)
            setText(formatted)

            const numeric = formatted.replace(/,/g, '')
            const n = numeric === '' ? 0 : Number(numeric)
            if (Number.isFinite(n)) onChange(n)

            requestAnimationFrame(() => {
              const pos = caretAfter(formatted, digits)
              el.setSelectionRange(pos, pos)
            })
          }}
          className="pl-6 tabular-nums"
        />
      </div>
      {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

function Num({
  label,
  value,
  onChange,
  suffix,
  hint,
  info,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  hint?: string
  info?: React.ReactNode
}) {
  const [text, setText] = useState<string | null>(null)
  const returning = useWindowReturn()

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {suffix ? ` (${suffix})` : ''}
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text ?? (value === 0 ? '' : String(value))}
        placeholder="0"
        onFocus={() => {
          if (returning()) return
          setText('')
        }}
        onClick={() => setText('')}
        onBlur={() => setText(null)}
        onChange={(e) => {
          const typed = e.target.value.replace(/[^0-9.]/g, '')
          setText(typed)
          const n = Number(typed)
          onChange(Number.isFinite(n) ? n : 0)
        }}
        className="tabular-nums"
      />
      {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

/**
 * The register itself, controlled from above.
 *
 * It used to own its own state. The summary bar now sits on the parent, above
 * both tabs, and two components reading the same storage key would drift the
 * moment either wrote — so the state moved up and this edits what it is given.
 */
export function HoldingsScreen({
  household,
  register,
  onChange,
  incomeByAge,
  isAuthed = false,
}: {
  household: HouseholdFacts
  register: Register
  onChange: (next: Register) => void
  /**
   * Whether there is an account behind this.
   *
   * Only used to say truthfully where the figures go. It said "kept on this
   * device only, and not sent anywhere" to everybody, which for a signed-in
   * reader was plainly false — the register is written to the database with
   * the plan — and for a signed-out one was false the other way: nothing is
   * kept on the device either, since the browser copies are cleared on every
   * mount and this lives in memory until it is saved.
   */
  isAuthed?: boolean
  /**
   * Ordinary income by age, from the plan next door.
   *
   * A gain is charged at whatever band it reaches on top of everything else
   * earned that year, so a sale at 62 and a sale at 70 are priced against
   * different figures. This used to be one number somebody typed.
   */
  incomeByAge: Map<number, number>
}) {
  // Kept in the shape the rest of this file already reads, so the household
  // moving out did not become a rewrite of every reference below.
  const state = {
    currentAge: household.currentAge,
    filingStatus: household.filingStatus,
    taxState: household.taxState,
    otherIncome: 0,
    holdings: register.holdings,
    liabilities: register.liabilities,
  }
  const [open, setOpen] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)

  /** Only the two lists are editable here; the household lives above the tabs. */
  const setState = (fn: (s: typeof state) => typeof state) => {
    const next = fn(state)
    onChange({ holdings: next.holdings, liabilities: next.liabilities })
  }

  const patch = (id: string, over: Partial<Holding>) =>
    setState((s) => ({
      ...s,
      holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...over } : h)),
    }))

  /**
   * Once per visit, the first time anything is put on the register.
   *
   * A milestone, never a figure — the same contract every other event here
   * keeps. It records that somebody started, not what they own.
   */
  const started = () => record('register_started', undefined, true)

  const add = (kind: HoldingKind) => {
    const h = blankHolding(kind)
    setState((s) => ({ ...s, holdings: [...s.holdings, h] }))
    setOpen((o) => [...o, h.id])
    started()
  }

  // Read once. A maturity year is measured against it, and taking it per
  // field would let two rows disagree across midnight on New Year's Eve.
  const thisYear = useMemo(() => new Date().getFullYear(), [])

  const sales = useMemo(
    () =>
      state.holdings
        .map((h) =>
          realise(
            h,
            state.currentAge,
            thisYear,
            // What the plan earns in the year this one is sold, rather than
            // one figure standing in for every year.
            incomeByAge.get(
              endAgeOf(h, state.currentAge, thisYear) ?? state.currentAge,
            ) ?? 0,
            state.filingStatus,
            state.taxState,
          ),
        )
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => a.age - b.age),
    [state, thisYear, incomeByAge],
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-medium text-foreground">
          What you own
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
          The home, property, belongings, crypto, fund positions, a stake in a
          business, a loan owed to you. The plan does not model these — it
          tracks pots that get drawn down smoothly, and these are lumps of value
          that arrive on a date. Anything borrowed against one of them belongs
          with it, so its equity is right.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {state.holdings.length === 0 && (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground text-pretty">
              Nothing added yet. Start with whichever is largest — for most
              people that is a property.
            </p>
          </Card>
        )}

        {state.holdings.map((h) => {
          const sale = sales.find((s) => s.holding.id === h.id)
          const inc = annualIncome(h, state.currentAge)
          const isOpen = open.includes(h.id)
          return (
            <Card key={h.id} className="p-0 gap-0 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setOpen((o) => (isOpen ? o.filter((x) => x !== h.id) : [...o, h.id]))
                }
                className="flex items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-foreground">
                      {h.name || kindOf(h.kind).label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {kindOf(h.kind).label}
                    </span>
                    {h.counted && (
                      <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                        to spend in retirement
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {money(h.value)} now
                    {isInterestBearing(h)
                      ? h.maturityYear
                        ? ` · matures ${h.maturityYear} · ${money(sale?.netProceeds ?? 0)} back`
                        : ' · no maturity set'
                      : h.saleAge !== null
                        ? ` · sell at ${h.saleAge} · ${money(sale?.netProceeds ?? 0)} after tax`
                        : ' · no sale planned'}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>

              {isOpen && (
                <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground">Name</span>
                      <Input
                        value={h.name}
                        placeholder={kindOf(h.kind).hint}
                        onChange={(e) => patch(h.id, { name: e.target.value })}
                      />
                    </label>
                    <Money
                      label={isInterestBearing(h) ? 'Principal' : 'Value'}
                      value={h.value}
                      onChange={(v) =>
                        // For a loan the principal is also the basis: it is the
                        // same money under two names, so it is kept in step
                        // rather than asked for twice.
                        patch(
                          h.id,
                          isInterestBearing(h) ? { value: v, basis: v } : { value: v },
                        )
                      }
                      info={
                        isInterestBearing(h) ? (
                          <>
                            <p>
                              What is outstanding — the amount you would get
                              back if it were repaid today.
                            </p>
                            <p>
                              There is no separate cost basis for a loan: what
                              you lent and what it is worth are the same figure,
                              and nothing above it is a gain. Only the interest
                              is income.
                            </p>
                          </>
                        ) : (
                          <>
                            <p>
                              Your own estimate of what it would fetch today,
                              before any mortgage. Nobody is checking it — this
                              is a projection built on your assumption, not a
                              valuation.
                            </p>
                            <p>
                              For a fund position, the latest reported net asset
                              value is the usual answer.
                            </p>
                          </>
                        )
                      }
                    />
                    {/* Not asked for a loan: it would be the principal again,
                        and a second box for the same money is a box that can
                        disagree with the first. */}
                    {!isInterestBearing(h) && (
                    <Money
                      // A limited partner put money in rather than bought a
                      // thing, and "capital invested" is the phrase on their
                      // own statements. Same figure, named the way they hold it.
                      label={isSyndication(h) ? 'Capital invested' : 'Cost basis'}
                      value={h.basis}
                      onChange={(v) => patch(h.id, { basis: v })}
                      hint={h.basis === 0 ? 'left blank, the whole sale is taxed as gain' : undefined}
                      info={
                        <>
                          <p>
                            Your cost basis — the purchase price plus anything
                            you spent improving it. Only the gain above this is
                            taxed, so it is the single figure that most changes
                            the answer.
                          </p>
                          <p>
                            Leave it blank and the whole sale price is treated
                            as profit, which overstates the tax. That is the
                            safe direction to be wrong in, but it is wrong.
                          </p>
                        </>
                      }
                    />
                    )}
                    {/* Not shown for a note or a certificate: the principal
                        does not appreciate, and what makes the figure rise is
                        the interest rate below. Two fields competing to
                        describe the same thing would invite one to be wrong. */}
                    {!isInterestBearing(h) && (
                    <Num
                      label="Annual growth"
                      value={h.growthPercent}
                      suffix="% a year"
                      onChange={(v) => patch(h.id, { growthPercent: v })}
                      info={
                        <>
                          <p>
                            What you assume it appreciates by each year between
                            now and the sale. Nothing is simulated here — this
                            is your number, applied steadily.
                          </p>
                          <p>
                            Worth being conservative. A rate that looks modest
                            compounds into most of the sale price over twenty
                            years, and the tax follows it up.
                          </p>
                        </>
                      }
                    />
                    )}
                    <Num
                      label={
                        isInterestBearing(h)
                          ? 'Maturity year'
                          : isSyndication(h)
                            ? 'Exit age'
                            : 'Sale age'
                      }
                      value={
                        isInterestBearing(h) ? (h.maturityYear ?? 0) : (h.saleAge ?? 0)
                      }
                      onChange={(v) =>
                        patch(
                          h.id,
                          isInterestBearing(h)
                            ? { maturityYear: v > 0 ? v : null }
                            : { saleAge: v > 0 ? v : null },
                        )
                      }
                      hint={
                        isInterestBearing(h)
                          ? 'the year the principal comes back'
                          : isSyndication(h)
                            ? 'when the deal expects to sell — you do not decide it'
                            : 'blank means you are holding it'
                      }
                      info={
                        isInterestBearing(h) ? (
                          <>
                            <p>
                              The calendar year it matures — the year on the
                              certificate or in the loan agreement, rather than
                              an age you would have to work out.
                            </p>
                            <p>
                              The principal itself is never taxed when it comes
                              back: it is your own money returning.
                            </p>
                            <p>
                              Leave it blank for something with no end date, a
                              perpetual loan or a rolling deposit.
                            </p>
                          </>
                        ) : (
                          <>
                            <p>
                              The age you expect to sell. Leave it blank for
                              something you intend to keep — it still counts
                              towards what you are worth, and nothing is taxed.
                            </p>
                            <p>
                              The year matters as much as the amount. Before 65 a
                              large sale can cost you the whole health-insurance
                              subsidy, and any sale raises your Medicare premiums
                              two years later.
                            </p>
                          </>
                        )
                      }
                    />

                    {isProperty(h) && (
                      <>
                        {h.kind === 'realEstate' && (
                        <>
                        <Num
                          label="Years owned"
                          value={h.ownedYears ?? 0}
                          onChange={(v) => patch(h.id, { ownedYears: v })}
                          hint="sets the depreciation already taken"
                          info={
                            <>
                              <p>
                                A rental is written down over 27½ years, and
                                every year of that is added back and taxed when
                                you sell — at up to 25%, its own rate.
                              </p>
                              <p>
                                This is the number most calculators miss. On a
                                property held twenty years it is routinely the
                                largest single line in the tax bill, and it is
                                charged on what you were <em>allowed</em> to
                                claim, whether or not you claimed it.
                              </p>
                            </>
                          }
                        />
                        <Num
                          label="Land share"
                          value={h.landSharePercent ?? 20}
                          suffix="%"
                          onChange={(v) => patch(h.id, { landSharePercent: v })}
                          hint="land does not depreciate"
                          info={
                            <>
                              <p>
                                How much of what you paid was for the land
                                rather than the building. Land is not written
                                down, so only the building share depreciates —
                                and only that share is recaptured.
                              </p>
                              <p>
                                Around 20% is the common assumption. Your
                                property tax assessment usually splits the two,
                                if you want the real figure.
                              </p>
                            </>
                          }
                        />
                        </>
                        )}
                        <Money
                          label="Mortgage"
                          value={h.mortgage ?? 0}
                          onChange={(v) => patch(h.id, { mortgage: v })}
                          info={
                            <>
                              <p>
                                What is still owed. It comes off what you are
                                worth, and off the proceeds when you sell.
                              </p>
                              <p>
                                It does not reduce the tax. You are taxed on the
                                gain, not on what reaches your account — which
                                is why a heavily mortgaged property can produce
                                a large bill and a small cheque.
                              </p>
                            </>
                          }
                        />
                        <Num
                          label="Interest rate"
                          value={h.mortgageRatePercent ?? 0}
                          suffix="%"
                          onChange={(v) => patch(h.id, { mortgageRatePercent: v })}
                          info={
                            <>
                              <p>
                                What the mortgage charges. The interest is a
                                cost and comes off the rental income before tax.
                              </p>
                              <p>
                                The principal you repay alongside it is not
                                counted: that money leaves the account and
                                arrives as equity, so treating it as a cost
                                would report you poorer than you are.
                              </p>
                            </>
                          }
                        />
                        {h.kind === 'realEstate' && (
                        <Money
                          label="Rental income"
                          period="per month"
                          value={h.monthlyRent ?? 0}
                          onChange={(v) => patch(h.id, { monthlyRent: v })}
                          info={
                            <p>
                              What the tenants pay you each month, before any
                              costs — the figure on the lease. The costs below
                              are yearly, because that is how those bills
                              arrive.
                            </p>
                          }
                        />
                        )}
                        <Money
                          label="Taxes"
                          period="per year"
                          value={h.propertyTax ?? 0}
                          onChange={(v) => patch(h.id, { propertyTax: v })}
                          info={
                            <p>
                              Property tax for the year. Your assessment notice
                              has it, and usually splits the land from the
                              building while it is at it — which is the other
                              figure this page asks for.
                            </p>
                          }
                        />
                        <Money
                          label="Insurance"
                          period="per year"
                          value={h.insurance ?? 0}
                          onChange={(v) => patch(h.id, { insurance: v })}
                          info={
                            <p>
                              Landlord or hazard cover for the year, plus flood
                              or umbrella if you carry them on this property.
                            </p>
                          }
                        />
                        <Money
                          label="Maintenance"
                          period="per year"
                          value={h.maintenance ?? 0}
                          onChange={(v) => patch(h.id, { maintenance: v })}
                          info={
                            <>
                              <p>
                                Repairs, management fees, and the months it sits
                                empty between tenants. A common rule of thumb is
                                a tenth of the rent, and most owners find that
                                optimistic.
                              </p>
                              <p>
                                Not depreciation — that is worked out from what
                                you paid and applied on top, which is why the
                                taxable income comes out below the cash.
                              </p>
                            </>
                          }
                        />
                      </>
                    )}

                    {isSyndication(h) && (
                      <>
                        <Num
                          label="Years held"
                          value={h.ownedYears ?? 0}
                          onChange={(v) => patch(h.id, { ownedYears: v })}
                          hint="sets the depreciation passed through so far"
                        />
                        <Money
                          label="Distributions"
                          period="per year"
                          value={h.annualDistribution ?? 0}
                          onChange={(v) => patch(h.id, { annualDistribution: v })}
                          info={
                            <p>
                              The cash the deal pays you over a year, before any
                              of it is taxed. Most of it is often sheltered in
                              the early years, which is the next box.
                            </p>
                          }
                        />
                        <Money
                          label="Depreciation on your K-1"
                          period="per year"
                          value={h.annualDepreciationShare ?? 0}
                          onChange={(v) =>
                            patch(h.id, { annualDepreciationShare: v })
                          }
                          info={
                            <>
                              <p>
                                Your share of the partnership&apos;s
                                depreciation, from your K-1. You do not own the
                                building, so this cannot be worked out from a
                                purchase price — the partnership works it out
                                and passes a share down.
                              </p>
                              <p>
                                It does two jobs. It shelters your distributions
                                on the way through, which is why the cash you
                                receive and the income you report differ so
                                much. And it is recaptured when the deal exits,
                                at up to 25% — the part that surprises people
                                about a syndication that looked tax-free while
                                it ran.
                              </p>
                            </>
                          }
                        />
                      </>
                    )}

                    {isSyndication(h) && h.sponsors && (
                      <>
                        <Money
                          label="Sponsor fees"
                          period="per year"
                          value={h.sponsorFees ?? 0}
                          onChange={(v) => patch(h.id, { sponsorFees: v })}
                          info={
                            <>
                              <p>
                                What running the deal pays you — asset
                                management and the rest. Ordinary income in the
                                year it lands.
                              </p>
                              <p>
                                The depreciation above does not shelter any of
                                it. That shelter belongs to the property; a fee
                                is earned by working, so it is taxed whole.
                              </p>
                              <p>
                                Self-employment tax on these fees is not
                                modelled here, and on a fee of any size it is
                                the larger half of the bill — roughly 15% up to
                                the wage base and about 3% above it. Many
                                sponsors take fees through a separate entity
                                for exactly that reason.
                              </p>
                            </>
                          }
                        />
                        <Money
                          label="Promote at exit"
                          value={h.promoteAtExit ?? 0}
                          onChange={(v) => patch(h.id, { promoteAtExit: v })}
                          hint={
                            (h.promoteAtExit ?? 0) > 0
                              ? carryIsLongTerm(h, state.currentAge, thisYear)
                                ? 'held past three years — taxed as a long-term gain'
                                : 'under three years at exit — §1061 taxes it as ordinary income'
                              : "in today's money, from your own pro forma"
                          }
                          info={
                            <>
                              <p>
                                Your carried interest — the share of profits
                                above the preferred return — as you expect it to
                                land, in today&apos;s money.
                              </p>
                              <p>
                                One figure rather than a waterfall. Rebuilding
                                one would need the deal&apos;s total equity, the
                                pref, the catch-up and every hurdle tier: five
                                guesses that would produce a precise-looking
                                number out of no better information than the
                                pro forma this figure is already in.
                              </p>
                              <p>
                                None of it is basis. You carried it rather than
                                bought it, so every dollar is gain — and under
                                §1061 it has to be held three years, not one, to
                                be taxed at the long-term rate. An early exit
                                loses that rate on the largest single item in
                                the deal.
                              </p>
                              <p>
                                It is left out of your net worth today, because
                                a promote is contingent: if the deal never
                                clears the pref, it is worth nothing. It appears
                                when the deal sells.
                              </p>
                            </>
                          }
                        />
                      </>
                    )}

                    {h.kind === 'personal' && (
                      <>
                        <Money
                          label="Loan outstanding"
                          value={h.mortgage ?? 0}
                          onChange={(v) => patch(h.id, { mortgage: v })}
                          info={
                            <p>
                              What is still owed on it — a car loan, or anything
                              secured against the thing itself. It comes off what
                              you are worth.
                            </p>
                          }
                        />
                        <Num
                          label="Interest rate"
                          value={h.mortgageRatePercent ?? 0}
                          suffix="%"
                          onChange={(v) => patch(h.id, { mortgageRatePercent: v })}
                        />
                        <Money
                          label="Insurance"
                          period="per year"
                          value={h.insurance ?? 0}
                          onChange={(v) => patch(h.id, { insurance: v })}
                        />
                        <Money
                          label="Running costs"
                          period="per year"
                          value={h.maintenance ?? 0}
                          onChange={(v) => patch(h.id, { maintenance: v })}
                          info={
                            <p>
                              Servicing, fuel, registration, storage — whatever it
                              costs to keep over a year.
                            </p>
                          }
                        />
                      </>
                    )}

                    {isInterestBearing(h) && (
                      <>
                      <Num
                        label="Interest rate"
                        value={h.interestPercent ?? 0}
                        suffix="% a year"
                        onChange={(v) => patch(h.id, { interestPercent: v })}
                        info={
                          <>
                            <p>
                              The rate it pays. Interest is ordinary income,
                              taxed at your normal rates each year — not at the
                              lower rates a capital gain gets.
                            </p>
                            <p>
                              This is why a certificate sits here rather than
                              with your investments: the projection taxes a
                              brokerage withdrawal as a capital gain, which
                              would understate what interest costs you.
                            </p>
                            <p>
                              When the principal comes back it is not taxed at
                              all. Getting your own money returned is not
                              income.
                            </p>
                          </>
                        }
                      />
                      <label className="flex flex-col gap-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          Interest
                          <InfoTip label="Interest paid out or left to build up">
                            <p>
                              Paid out, it reaches your account each year. Left
                              alone, it builds up and comes back with the
                              principal.
                            </p>
                            {h.kind === 'deposit' ? (
                              <p>
                                For a bank account that changes the cash and not
                                the tax. The bank credits the interest and
                                reports it on a 1099 every year, so it is income
                                whether or not you take it out.
                              </p>
                            ) : (
                              <>
                                <p>
                                  For a private loan it changes both. You are
                                  taxed when the money reaches you, so interest
                                  that genuinely accrues is not income until it
                                  is paid — and then every year of it lands as
                                  ordinary income at once.
                                </p>
                                <p>
                                  That single year is worth looking at. Before
                                  65 it can cost the whole health-insurance
                                  subsidy, and it raises Medicare premiums two
                                  years later.
                                </p>
                              </>
                            )}
                          </InfoTip>
                        </span>
                        <select
                          value={h.interestPaidOut === false ? 'accrue' : 'paid'}
                          onChange={(e) =>
                            patch(h.id, { interestPaidOut: e.target.value === 'paid' })
                          }
                          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none"
                        >
                          <option value="paid">Paid out to me</option>
                          <option value="accrue">
                            {h.kind === 'deposit' ? 'Left to compound' : 'Left to accrue'}
                          </option>
                        </select>
                        {h.interestPaidOut === false && (
                          <span className="text-[11px] text-muted-foreground/80 text-pretty">
                            {h.kind === 'deposit'
                              ? 'Still taxed each year — the bank reports it whether you take it or not.'
                              : 'Not taxed until it is paid, and then all of it lands in one year.'}
                          </span>
                        )}
                      </label>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {h.kind === 'home' && (
                      <span className="text-xs text-muted-foreground text-pretty">
                        Because you live in it, the first{' '}
                        {state.filingStatus === 'married' ? '$500,000' : '$250,000'}{' '}
                        of any gain is excluded when you sell.
                      </span>
                    )}
                    {isSyndication(h) && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={h.sponsors ?? false}
                          onChange={(e) =>
                            patch(h.id, { sponsors: e.target.checked })
                          }
                        />
                        I run this deal as well as investing in it — there is a
                        promote or sponsor fee on top of my capital.
                      </label>
                    )}
                    {(h.kind === 'fund' || h.kind === 'business') && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={h.qsbs ?? false}
                          onChange={(e) => patch(h.id, { qsbs: e.target.checked })}
                        />
                        Qualified small business stock — held five years, gain
                        excluded up to the greater of $10M or ten times what you
                        paid
                      </label>
                    )}
                    {/* This used to read "Count it in the plan", which the
                        plan does not do: nothing on the register reaches
                        `simulate`, and `netWorth`'s counted/held split is read
                        by no component. The tick is kept because the intention
                        is worth recording and is saved with the plan — it is
                        the answer to a question the projection will ask when
                        the two are joined. What it must not do is claim to
                        have been asked already. */}
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={h.counted}
                        onChange={(e) => patch(h.id, { counted: e.target.checked })}
                      />
                      I expect to spend this in retirement
                    </label>
                  </div>

                  {/* Outside the row above, which is `flex flex-wrap` — a
                      paragraph in there is another item competing for the
                      line rather than a note under it. */}
                  <p className="text-xs text-muted-foreground text-pretty">
                    Noted, not yet modelled. The projection does not draw on
                    anything you own here, so ticking that changes no figure on
                    the page — your balance and the years it lasts are the same
                    either way.
                  </p>

                  {/* The one kind here that a household might also have
                      entered in the planner. Everything else is illiquid and
                      has nowhere else to be; a savings balance does. */}
                  {h.kind === 'deposit' && h.value > 0 && (
                    <p className="rounded-md border border-primary/20 bg-accent/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground text-pretty">
                      <span className="font-medium text-foreground">
                        Do not also count this in the planner.
                      </span>{' '}
                      If this balance is part of the brokerage or savings figure
                      in your retirement plan, take it out of one of the two.
                      Counted in both places it appears twice in what you are
                      worth — and the planner would tax its interest as a
                      capital gain, which is why it is better off here.
                    </p>
                  )}

                  {sale && <SaleBreakdown sale={sale} />}

                  {inc.cash > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Pays {money(inc.cash)} a year, of which{' '}
                      <span className="font-medium text-foreground">
                        {money(inc.taxable)}
                      </span>{' '}
                      is taxable
                      {inc.shelter > 0
                        ? ` — depreciation shelters ${money(inc.shelter)} of it`
                        : ''}
                      .
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        holdings: s.holdings.filter((x) => x.id !== h.id),
                      }))
                    }
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Remove
                  </button>
                </div>
              )}
            </Card>
          )
        })}

        <div className="flex flex-wrap gap-2">
          {HOLDING_KINDS.map((k) => (
            <Button
              key={k.kind}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => add(k.kind)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              {k.label}
            </Button>
          ))}
        </div>
      </div>

      {sales.length > 0 && (
        <p className="rounded-md bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground text-justify hyphens-auto">
          <span className="font-medium text-foreground">
            Each sale is taxed against what your plan earns that year.
          </span>{' '}
          A gain has no rate of its own — it stacks on top of your ordinary
          income and is charged at whatever band it reaches, so the same sale
          costs different amounts in different years. The figures come from the
          projection next door rather than from anything typed here, which is
          why selling at one age and selling at another are not priced alike.
        </p>
      )}

      <LiabilitiesList
        liabilities={state.liabilities}
        onChange={(liabilities) => {
          if (liabilities.length > state.liabilities.length) started()
          setState((s) => ({ ...s, liabilities }))
        }}
      />

      {/* The same calculator the standalone page runs, handed the debts that
          are already here rather than a blank form.
          A link would have sent somebody who has just typed every one of them
          to an empty page to type them again — which is the reader this is
          most for. Read-only by construction: no `onChange`, so the list above
          stays the one place a debt is edited and there is no second copy to
          drift. */}
      {state.liabilities.some((l) => l.balance > 0) && <PayoffSection debts={state.liabilities} />}

      {sales.length > 0 && <Timeline sales={sales} />}

      <div className="flex flex-wrap items-start justify-between gap-4 border-t border-border pt-4">
        <p className="max-w-2xl text-xs text-muted-foreground text-pretty">
          {isAuthed
            ? 'Saved with your plan when you press Save — one press keeps this and the plan together.'
            : 'Not stored anywhere yet. Close this tab and it is gone unless you sign in and save it.'}{' '}
          Nothing here reaches your retirement projection yet. Passive loss
          rules, 1031 exchanges and instalment sales are not modelled, so a sale
          spread over several years would cost less than shown.
        </p>

        {/* Only where there is something to lose. A reset offered to somebody
            with an empty register is a button that can only do nothing. */}
        {(state.holdings.length > 0 || state.liabilities.length > 0) &&
          (confirming ? (
            <span className="flex shrink-0 items-center gap-3 text-xs">
              <span className="text-muted-foreground">
                {state.holdings.length > 0
                  ? `Remove ${state.holdings.length} ${
                      state.holdings.length === 1 ? 'entry' : 'entries'
                    } and start again?`
                  : 'Clear your figures and start again?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  // The household stays: it belongs to the person, not to the
                  // list, and it is edited above the tabs.
                  onChange({ holdings: [], liabilities: [] })
                  setOpen([])
                  setConfirming(false)
                }}
                className="font-medium text-destructive underline underline-offset-4 hover:no-underline"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Keep them
              </button>
            </span>
          ) : (
            /* Two steps rather than one. Everything here was typed by hand and
               none of it can be recovered, which is a different weight of
               button from clearing a dialog. */
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Start over
            </button>
          ))}
      </div>
    </div>
  )
}

/**
 * Where the money goes when a holding ends.
 *
 * Ends, not sells. A certificate and a private loan are not sold to anybody —
 * they run to a date and pay out — and calling that a sale asked the reader to
 * accept a word for their own money coming back. Everything below reads for
 * whichever it is.
 */
function SaleBreakdown({ sale }: { sale: NonNullable<ReturnType<typeof realise>> }) {
  const d = sale.decomposition
  const matures = isInterestBearing(sale.holding)
  const rows: [string, number, string?][] = [
    [
      matures ? `Principal and interest at ${sale.age}` : `Sale price at ${sale.age}`,
      sale.gross,
    ],
    ['Selling costs', -sale.sellingCosts],
    ['Mortgage cleared', -sale.mortgagePayoff],
    ['Tax on the depreciation taken back', -sale.tax.recapture, money(d.recapture) + ' at up to 25%'],
    ['Tax on the gain', -sale.tax.capitalGains, money(d.longTermGain) + ' at the gains rates'],
    // This row was missing entirely, so a private loan's interest and a
    // syndication exiting inside three years were both taxed by the engine
    // and charged against the total without appearing — the figures above did
    // not add up to the figure below, and nothing said why.
    [
      matures ? 'Tax on the interest' : 'Tax at income rates',
      -sale.tax.ordinary,
      matures
        ? money(d.ordinary) + ', all of it taxed in this one year'
        : money(d.ordinary) + ' at your income rate',
    ],
    ['Net investment income tax', -sale.tax.niit, '3.8% on the part above the threshold'],
    ['State tax', -sale.tax.state],
  ].filter(([, v]) => v !== 0) as [string, number, string?][]

  return (
    <div className="flex flex-col gap-1 rounded-md bg-muted/40 p-3">
      <p className="text-xs font-medium text-foreground">
        {matures
          ? 'What it actually leaves you at maturity'
          : 'What selling actually leaves you'}
      </p>
      <dl className="flex flex-col gap-0.5 text-xs">
        {rows.map(([label, v, note]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">
              {label}
              {note && <span className="block text-[11px] text-muted-foreground/70">{note}</span>}
            </dt>
            <dd className={cn('tabular-nums', v < 0 ? 'text-muted-foreground' : 'text-foreground')}>
              {v < 0 ? '−' : ''}
              {money(Math.abs(v))}
            </dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-1">
          <dt className="font-medium text-foreground">In your pocket</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {money(sale.netProceeds)}
          </dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * The summary: everything with an end date, in the order it arrives.
 *
 * It was headed "When it lands", which named the ordering rather than the
 * point, and left three unlabelled figures per row for the reader to work out.
 * It is a summary, so it says so, labels its columns and totals them.
 */
function Timeline({ sales }: { sales: NonNullable<ReturnType<typeof realise>>[] }) {
  const byAge = new Map<number, typeof sales>()
  for (const s of sales) byAge.set(s.age, [...(byAge.get(s.age) ?? []), s])
  const crowded = [...byAge.values()].some((g) => g.length > 1)
  const totalTax = sales.reduce((a, s) => a + s.tax.total, 0)
  const totalNet = sales.reduce((a, s) => a + s.netProceeds, 0)

  return (
    <Card className="p-6 gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-medium text-foreground">
          Summary: what each one leaves you
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Everything you have given an end date, earliest first. What the tax
          costs in that year, and what is left for you afterwards.
        </p>
      </div>

      <ul className="flex flex-col">
        {/* Labelled, because three figures in a row are three guesses. */}
        <li className="flex items-baseline gap-3 border-b border-border pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="w-10 shrink-0">Age</span>
          <span className="min-w-0 flex-1">What ends</span>
          <span className="shrink-0">Tax</span>
          <span className="w-28 shrink-0 text-right">You keep</span>
        </li>
        {sales.map((s) => (
          <li
            key={s.holding.id}
            className="flex items-baseline gap-3 border-b border-border/60 py-2 text-sm last:border-0"
          >
            <span className="w-10 shrink-0 font-medium tabular-nums text-foreground">
              {s.age}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {s.holding.name || kindOf(s.holding.kind).label}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              −{money(s.tax.total)}
            </span>
            <span className="w-28 shrink-0 text-right font-medium tabular-nums text-foreground">
              {money(s.netProceeds)}
            </span>
          </li>
        ))}
        {sales.length > 1 && (
          <li className="flex items-baseline gap-3 border-t border-border pt-2 text-sm">
            <span className="w-10 shrink-0" />
            <span className="min-w-0 flex-1 font-medium text-foreground">
              All of it
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              −{money(totalTax)}
            </span>
            <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-foreground">
              {money(totalNet)}
            </span>
          </li>
        )}
      </ul>

      {crowded && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground text-justify hyphens-auto">
          <span className="font-medium text-foreground">
            Two in the same year cost more than two in different years.
          </span>{' '}
          Each figure above is worked out on its own, as though the other had
          not happened. In a real year they add together, which can push the
          second one into a higher tax band — and, before 65, over the income
          limit for help with health cover.
        </p>
      )}
    </Card>
  )
}

/**
 * How fast these debts clear, offered rather than imposed.
 *
 * Collapsed by default: somebody on this tab came to enter what they own and
 * owe, and a payoff table unfolding underneath it is an answer to a question
 * they have not asked yet. Open, it is the same component the standalone
 * calculator uses, so the two cannot report different figures for the same
 * debts.
 */
function PayoffSection({ debts }: { debts: Liability[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="flex flex-col gap-3 p-6">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
          if (!open) record('debt_answered', undefined, true)
        }}
        className="flex w-fit items-center gap-2 text-left"
      >
        <h2 className="font-serif text-lg font-medium text-foreground">
          How fast could these clear?
        </h2>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
        The two ways of paying off the debts above, side by side. This does
        not change your plan. It is just a way to see what paying more each
        month would do.
      </p>
      {open && <DebtPayoffCalculator debts={debts} />}
    </Card>
  )
}
