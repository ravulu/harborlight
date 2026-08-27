'use client'

import { useMemo } from 'react'

import type { PlanInputs, YearRow } from '@/lib/retirement'
import { formatCurrency } from '@/lib/retirement'
import {
  taxPhases,
  SS_THRESHOLDS,
  FEDERAL,
  CAPITAL_GAINS,
  BRACKET_YEAR,
  CURRENT_TAX_TABLE,
  type RateEstimate,
  type PhaseSources,
} from '@/lib/tax'
import { findState, FILING_STATUSES, type FilingStatus } from '@/lib/state-tax'
import type { ConversionComparison } from '@/lib/conversions'
import { InsightsLink } from '@/components/planner/insights-link'
import { ClaimingLadder } from '@/components/planner/claiming-ladder'
import { RoomToMove } from '@/components/planner/room-to-move'
import type { RoomWindow } from '@/lib/room'
import { compareClaiming } from '@/lib/claiming'
import { CLIFF, MEDICARE_AGE, NATIONAL_AVERAGE_NOTE, povertyLine } from '@/lib/aca'
import { cn } from '@/lib/utils'

const money = (v: number) => formatCurrency(Math.round(v))

/**
 * Small numbers written out, as prose wants them.
 *
 * This used to be `size === 2 ? 'two' : 'one'`, which was every household the
 * app could describe. Dependents made larger ones possible, and that ternary
 * would have called a family of five "one".
 */
const HOUSEHOLD_WORDS: Record<number, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
}



/**
 * The tax picture across the whole plan rather than for one year: what
 * changes at retirement, what changes again when Social Security starts, and how
 * long each stretch lasts.
 */
export function TaxPhases({
  inputs,
  rows,
  conversions,
  room,
}: {
  inputs: PlanInputs
  /** The projected years, so the 59½ split knows when the 401(k) is drawn. */
  rows: YearRow[]
  /**
   * The conversion ladder, worked out once by the planner and shared with the
   * insight card so the two cannot quote different amounts.
   */
  conversions: ConversionComparison | null
  /**
   * The low-income window, run by the planner so this tab does not run the
   * projection a second time on every keystroke.
   */
  room: RoomWindow | null
}) {
  const phases = taxPhases(inputs, inputs.taxState, inputs.filingStatus, rows)
  const state = findState(inputs.taxState)
  const statusWord =
    FILING_STATUSES.find((f) => f.value === inputs.filingStatus)?.short ?? 'single'
  const thresholds = SS_THRESHOLDS[inputs.filingStatus]
  const totalYears = phases.reduce((n, p) => n + p.years, 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Proportional strip: how long each stretch runs. */}
      <div className="flex flex-col gap-2">
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {phases.map((p) => (
            <div
              key={p.key}
              style={{ width: `${(p.years / Math.max(totalYears, 1)) * 100}%` }}
              className={cn(
                p.key === 'earlyPenalty' && 'bg-destructive/40',
                p.key === 'penaltyFree' && 'bg-chart-1/70',
                p.key === 'withBenefit' && 'bg-chart-2/70',
                p.key === 'withBothBenefits' && 'bg-chart-4/70',
              )}
            />
          ))}
        </div>
        {/* Named, because a coloured bar with no key is a puzzle rather than
            a picture — the red stretch in particular reads as a warning
            without saying what it is warning about. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {phases.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  p.key === 'earlyPenalty' && 'bg-destructive/60',
                  p.key === 'penaltyFree' && 'bg-chart-1',
                  p.key === 'withBenefit' && 'bg-chart-2',
                  p.key === 'withBothBenefits' && 'bg-chart-4',
                )}
              />
              <span className="text-foreground/80">{p.label}</span>
              <span className="tabular-nums">
                {p.fromAge}–{p.toAge}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'grid gap-4 sm:grid-cols-2',
          phases.length > 3 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        {phases.map((p) => {
          const combined =
            Math.round((p.rates.federal + p.rates.state) * 10) / 10
          const endCombined = p.endRates
            ? Math.round((p.endRates.federal + p.endRates.state) * 10) / 10
            : null
          return (
            <div
              key={p.key}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Age {p.fromAge}–{p.toAge} · {p.years}{' '}
                  {p.years === 1 ? 'year' : 'years'}
                </span>
                <span className="font-medium text-foreground">{p.label}</span>
              </div>

              <>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {combined}
                    {endCombined !== null && endCombined !== combined
                      ? `–${endCombined}`
                      : ''}
                    %
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      combined
                    </span>
                  </p>
                  {/* Two groups, each on one basis. They used to be one list
                      mixing a per-year withdrawal with a whole-stretch tax
                      bill, which read as a rate of 64% in the first tile and
                      300% in the last. */}
                  <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <Heading>Each year</Heading>
                    <Line
                      label="Taken from savings"
                      value={money(p.rates.grossWithdrawal)}
                    />
                    <Line
                      label="Social Security"
                      value={
                        p.rates.benefit > 0
                          ? p.endRates
                            ? `${money(p.rates.benefit)} → ${money(p.endRates.benefit)}`
                            : money(p.rates.benefit)
                          : 'not started'
                      }
                    />
                    <Line
                      label="Of Social Security, taxed"
                      value={
                        p.rates.benefit > 0
                          ? `${Math.round(p.rates.taxableShare * 100)}%`
                          : '—'
                      }
                    />
                    {/* Tax belongs in both groups. Without it here the reader
                        has a withdrawal per year and a tax bill per stretch,
                        and no way to get from one to the other. */}
                    <Line
                      label="Tax"
                      value={money(p.rates.federalTax + p.rates.stateTax)}
                    />

                    <Heading className="mt-2">
                      Over all {p.years} {p.years === 1 ? 'year' : 'years'}
                    </Heading>
                    <Line
                      label="Taken from savings"
                      value={money(
                        p.sources.fromProjection
                          ? p.sources.total
                          : p.rates.grossWithdrawal * p.years,
                      )}
                    />
                    {p.sources.fromProjection && p.sources.total > 0 && (
                      <>
                        {/* Named whether or not it is drawn: "did we touch the
                            401(k)?" is answered by a dash as much as by a
                            figure, and only one of the two used to appear. */}
                        <Source
                          label="From the 401(k) / IRA"
                          note="ordinary income"
                          amount={p.sources.deferred}
                          total={p.sources.total}
                        />
                        {p.sources.brokerage > 0 && (
                          <Source
                            label="From the brokerage"
                            note="gain only"
                            amount={p.sources.brokerage}
                            total={p.sources.total}
                          />
                        )}
                        {p.sources.roth > 0 && (
                          <Source
                            label="From the Roth"
                            note="untaxed"
                            amount={p.sources.roth}
                            total={p.sources.total}
                          />
                        )}
                      </>
                    )}
                    <Line
                      label={`Federal tax (${p.rates.federal}%)`}
                      value={money(p.totalFederalTax)}
                    />
                    {/* Inset, because it is a part of the federal figure above
                        rather than a charge beside it — and shown at all
                        because it is the one line here that a different
                        decision removes outright rather than merely reduces. */}
                    {p.totalPenalty > 0 && (
                      <Line
                        label="of which the 10% early-withdrawal penalty"
                        value={money(p.totalPenalty)}
                        inset
                      />
                    )}
                    <Line
                      label={`State tax (${p.rates.state}%)`}
                      value={money(p.totalStateTax)}
                    />
                    {/* Beside the tax, never inside it: a Medicare premium is
                        not a tax, and a total that mixed the two would be a
                        bill nobody sends. */}
                    {p.totalIrmaa > 0 && (
                      <Line
                        label="Medicare surcharge"
                        value={money(p.totalIrmaa)}
                      />
                    )}
                    {/* Beside the tax for the same reason the surcharge is: a
                        premium is not a tax. Shown at all because the plan
                        works this figure out rather than being told it, and a
                        cost nobody entered has to be visible somewhere. */}
                    {p.totalHealthPremium > 0 && (
                      <Line
                        label="Health cover before 65"
                        value={`about ${money(p.totalHealthPremium)}`}
                      />
                    )}
                  </dl>
                  <Why
                    rates={p.rates}
                    sources={p.sources}
                    status={inputs.filingStatus}
                  />
                  <p className="text-xs text-muted-foreground text-pretty">{p.detail}</p>
                  {/* Beside the figure rather than in a footnote, because the
                      caveat is about the level and the level is right there. */}
                  {p.totalHealthPremium > 0 && (
                    <p className="text-xs text-muted-foreground text-pretty">
                      <span className="font-medium text-foreground">
                        Health cover
                      </span>{' '}
                      is {NATIONAL_AVERAGE_NOTE}. What it does across the rows —
                      when it steps, and that it stops at {MEDICARE_AGE} — holds
                      wherever you are; the exact figure is indicative.
                    </p>
                  )}
                  <p className="mt-auto rounded-md border border-primary/20 bg-accent/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground text-pretty">
                    <span className="font-medium text-foreground">What you can do.</span>{' '}
                    {p.scenario}
                  </p>
                </>
            </div>
          )
        })}
      </div>

      <RoomToMove window={room} />

      <SuggestedActions conversions={conversions} inputs={inputs} />

      <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">How these were worked out</p>
        {CURRENT_TAX_TABLE.estimated && (
          <p className="text-justify hyphens-auto">
            <span className="font-medium text-foreground">
              {CURRENT_TAX_TABLE.year} brackets are estimated.
            </span>{' '}
            The last published figures held here are {BRACKET_YEAR}&apos;s. Rather
            than charge {CURRENT_TAX_TABLE.year} income against{' '}
            {BRACKET_YEAR} thresholds, they have been carried forward at the
            rate they are normally indexed at — the rates themselves are set by
            law and have not been touched. Expect the bands to be a little out,
            and expect nothing at all if the law has changed since.
          </p>
        )}
        <p>
          Figures are in today&apos;s dollars. Spending is flat in real terms and
          the brackets are inflation-indexed, so within a stretch the only thing
          that moves is Social Security — and only when its cost-of-living adjustment
          differs from your inflation rate. Where a range is shown, that is the
          drift from the start of the stretch to its end. The projection works a
          rate out for every year rather than averaging across them.
        </p>
        <p>
          <span className="font-medium text-foreground">
            The two groups are on different bases.
          </span>{' '}
          Everything under &ldquo;each year&rdquo; is one year of the stretch;
          everything under &ldquo;over all N years&rdquo; is the whole of it,
          added up from the projected years rather than a yearly figure
          multiplied out. That is why the longest stretch does not come to its
          rate times its length — Social Security drifts and the withdrawal changes
          as the accounts empty.
        </p>
        <p>
          <span className="font-medium text-foreground">
            Which account pays decides the rate.
          </span>{' '}
          A dollar of spending costs very different amounts depending on where
          it comes from: a brokerage dollar is taxed only on its gain and at
          capital-gains rates, a 401(k) or IRA dollar is ordinary income in
          full, and a Roth dollar is not taxed at all. The projection spends the
          taxable account first, then the 401(k) and IRA, then the Roth — so the
          mix shown in each tile is what actually funds that stretch, and the
          rate above it follows from that mix. Reaching 59½ does not by itself
          change the rate; it only stops the 10% penalty on the tax-deferred
          accounts.
        </p>
        <p>
          <span className="font-medium text-foreground">
            The percentage is not a bracket.
          </span>{' '}
          It is the tax owed divided by the whole withdrawal, so it sits below
          the bracket you are in — the standard deduction and the lower bands
          are taxed first, and only the last slice meets your top rate. A plan
          showing 12% can easily be one whose top bracket is 22%.
        </p>
        <p>
          <span className="font-medium text-foreground">Social Security.</span> Up to
          85% of it counts as ordinary income federally, decided by
          provisional income — withdrawals plus half of Social Security — against a{' '}
          {money(thresholds.base)} floor and a {money(thresholds.adjusted)} ceiling
          for {statusWord} filers. Those thresholds are fixed in law and never rise
          with inflation, so more of Social Security becomes taxable over a long
          retirement in nominal terms.
        </p>
        <p>
          <span className="font-medium text-foreground">
            {state ? state.name : 'State tax'}.
          </span>{' '}
          {state
            ? state.taxesSocialSecurity
              ? state.socialSecurityExempt
                ? `One of the eight states that still taxes Social Security — but only above its income limit, which this plan is measured against. ${
                    state.socialSecurityExempt.fromAge !== undefined
                      ? `Here the exemption turns on age rather than income: a full deduction from ${state.socialSecurityExempt.fromAge}.`
                      : `Below ${money(state.socialSecurityExempt[inputs.filingStatus])} of income the benefit is exempt; above it, it follows the federal taxable amount.`
                  }`
                : 'Taxes Social Security, following the federal taxable amount.'
              : 'Does not tax Social Security, so only the withdrawal is exposed to state tax.'
            : 'No state chosen, so no state income tax is charged. Federal tax is still worked out from the real brackets, year by year, exactly as it is with a state selected — the percentages shown are what that comes to, not a rate being applied.'}{' '}
          {state?.retirementExempt
            ? 'Withdrawals from retirement accounts are exempt too, which is why the state rate is zero.'
            : ''}
        </p>

        {state && state.single.brackets.length > 0 && (
          <p className="text-justify hyphens-auto">
            <span className="font-medium text-foreground">
              State credits and exemptions are not modelled.
            </span>{' '}
            {state.name} is priced from its brackets and its standard deduction
            alone. Most states also offer credits and exemptions aimed at
            retirees — a low-income credit, an age-based exclusion, a deduction
            on pension income — and none of them are counted here. The state
            figures above therefore err high, and err highest for the lowest
            incomes, which is where those reliefs are largest. Federal tax,
            which is the bigger number on this page, is not affected.
          </p>
        )}

        {/* These notes are the rules. What the rules come to on this
            particular plan is written against the reader's own figures in a
            different card, and someone who reads to the bottom of this box has
            no way to know that. */}
        <p className="border-t border-border/60 pt-2 text-justify hyphens-auto">
          <span className="font-medium text-foreground">
            What this comes to on your plan.
          </span>{' '}
          Everything above is the rules. Why your figures land where they do —
          where the Medicare surcharge starts and why it totals what it does,
          what the forced withdrawals do to your later years, which of these
          you can still change — is worked out against your own numbers in{' '}
          <InsightsLink />, the card below this one.
        </p>
      </div>
    </div>
  )
}

/**
 * Where the percentage came from.
 *
 * The figure is tax divided by the withdrawal, which is not a bracket and is
 * usually well below the one someone is in — so a reader who knows they are in
 * the 22% bracket and sees 11.7% deserves to be told why rather than left to
 * doubt it. The arithmetic is short enough to show in full: what was taxed,
 * what was owed on it, and what that is as a share of the money taken out.
 */
function Why({
  rates,
  sources,
  status,
}: {
  rates: RateEstimate
  sources: PhaseSources
  status: FilingStatus
}) {
  const total = rates.federalTax + rates.stateTax
  const combined = Math.round((rates.federal + rates.state) * 10) / 10
  const deduction = FEDERAL[status].standardDeduction
  const gross = rates.grossWithdrawal

  const known = sources.fromProjection && sources.total > 0
  const share = (v: number) => (known ? v / sources.total : 0)
  const fromDeferred = known ? gross * share(sources.deferred) : gross
  const fromBrokerage = known ? gross * share(sources.brokerage) : 0
  const fromRoth = known ? gross * share(sources.roth) : 0

  // The two halves of the federal bill. Splitting them is the whole point:
  // the note used to quote a gain of six figures, apply the deduction to a
  // different number, and announce a bill that the reader could not reach
  // from either — when on a plan spending a taxable account the gain is
  // most of what they are paying.
  const gainsTax = rates.federalGainsTax
  const ordinaryTax = Math.max(0, rates.federalTax - gainsTax)
  const gains = rates.capitalGains
  const ordinary = fromDeferred + rates.taxableSocialSecurity
  const taxedOrdinary = Math.max(0, ordinary - deduction)
  // Where the 0% capital-gains band ends for this filer. The gain stacks on
  // whatever ordinary income is already taxed, so this is the headroom.
  const zeroBandTop =
    CAPITAL_GAINS[status].find((b) => b.rate > 0)?.from ?? 0

  return (
    <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground text-pretty">
      <span className="font-medium text-foreground">Why {combined}%.</span> In a
      year here, {money(gross)} comes out
      {fromBrokerage > 1 || fromRoth > 1 ? (
        <>
          {' — '}
          {[
            fromDeferred > 1 ? `${money(fromDeferred)} from the 401(k) or IRA` : '',
            fromBrokerage > 1 ? `${money(fromBrokerage)} from the brokerage` : '',
            fromRoth > 1 ? `${money(fromRoth)} from the Roth` : '',
          ]
            .filter(Boolean)
            .join(', ')}
        </>
      ) : null}
      .{' '}
      {/* What is taxed, and at what. */}
      {ordinary > 1 ? (
        <>
          {fromDeferred > 1 ? money(fromDeferred) + ' of that' : 'Social Security'}
          {fromDeferred > 1 && rates.taxableSocialSecurity > 1
            ? `, plus ${money(rates.taxableSocialSecurity)} of Social Security,`
            : rates.taxableSocialSecurity > 1 && fromDeferred <= 1
              ? ` puts ${money(rates.taxableSocialSecurity)} of`
              : ''}
          {rates.taxableSocialSecurity > 1 && fromDeferred <= 1
            ? ' ordinary income beside it'
            : ' is ordinary income'}
          .{' '}
          {taxedOrdinary > 0 ? (
            <>
              The {money(deduction)} standard deduction leaves {money(taxedOrdinary)}{' '}
              of it in the brackets, at {money(ordinaryTax)}.{' '}
            </>
          ) : (
            <>
              The {money(deduction)} standard deduction covers all of it, so no
              ordinary tax is owed.{' '}
            </>
          )}
        </>
      ) : fromRoth > 1 && fromBrokerage <= 1 ? (
        <>Roth money is not taxed and Social Security has not started.{' '}</>
      ) : null}
      {gains > 1 ? (
        <>
          Only the gain in the brokerage account is taxed — {money(gains)} of it
          —{' '}
          {taxedOrdinary > 0 ? (
            <>
              and it stacks on top of that ordinary income, so the first{' '}
              {money(Math.max(0, zeroBandTop - taxedOrdinary))} of it still
              falls in the 0% capital-gains band and the rest meets 15%
            </>
          ) : (
            <>
              and with nothing under it the first {money(zeroBandTop)} falls in
              the 0% capital-gains band, the rest meeting 15%
            </>
          )}
          ,{' '}
          {gainsTax < 1 ? (
            <>which costs nothing — it all fits inside that band</>
          ) : (
            <>
              which comes to{' '}
              <span className="font-medium text-foreground">
                {money(gainsTax)}
              </span>
            </>
          )}
          .{' '}
        </>
      ) : null}
      {rates.stateTax > 1 ? <>State tax adds {money(rates.stateTax)}. </> : null}
      {total > 0 ? (
        <>
          That is {money(total)} against the {money(gross)} withdrawn, or{' '}
          {combined}% — the share of the money you took out, not the bracket you
          are in.
        </>
      ) : (
        <>Nothing is owed on it, which is why the rate is zero.</>
      )}
    </p>
  )
}

/** What one pot put in over a stretch, in dollars and as a share. */
function Source({
  label,
  note,
  amount,
  total,
}: {
  label: string
  note: string
  amount: number
  total: number
}) {
  const drawn = amount > 0
  return (
    <div className="flex items-baseline justify-between gap-3 pl-3">
      <dt className="text-muted-foreground/80">
        {label} <span className="text-muted-foreground/60">· {note}</span>
      </dt>
      <dd className="tabular-nums text-foreground/70">
        {drawn ? (
          <>
            {money(amount)}
            <span className="ml-1 text-muted-foreground/60">
              {Math.round((amount / total) * 100)}%
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/60">nothing drawn</span>
        )}
      </dd>
    </div>
  )
}

/** Which basis the rows beneath are on. */
function Heading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <dt
      className={cn(
        'text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70',
        className,
      )}
    >
      {children}
    </dt>
  )
}

/**
 * Things this plan could do, with the numbers behind each one.
 *
 * A container rather than a single card: conversions are the first action to
 * be modelled and will not be the last, and each one belongs in the same place
 * with the same shape — here is a choice, here is what it costs, here is what
 * it is worth, here is what we cannot tell you about it.
 *
 * Nothing here is applied. The plan above is unchanged whichever row a reader
 * finds convincing.
 */
function SuggestedActions({
  conversions,
  inputs,
}: {
  conversions: ConversionComparison | null
  inputs: PlanInputs
}) {
  // Cheap enough to sit here rather than be threaded down from the planner:
  // a handful of deterministic runs, no market simulation behind any of them.
  const claiming = useMemo(() => compareClaiming(inputs), [inputs])

  /**
   * The actions this plan actually has, as one list.
   *
   * One list rather than two. The heading below is only worth rendering if
   * something follows it, and the obvious way to arrange that — a guard that
   * names every action, and then a body that names them all again — is two
   * lists that have to be kept in agreement by hand. They will not stay in
   * agreement: adding a third action and forgetting the guard hides a section
   * that has content, and removing one and forgetting the guard leaves a
   * heading with nothing under it.
   *
   * Deriving the guard from the list makes both impossible. Adding or removing
   * an action is one line, and emptiness takes care of itself.
   */
  const actions = [
    conversions ? (
      <RothConversions key="roth" c={conversions} inputs={inputs} />
    ) : null,
    claiming ? (
      <ClaimingLadder key="claiming" c={claiming} inputs={inputs} />
    ) : null,
  ].filter(Boolean)

  if (actions.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          Suggested actions
        </h3>
        <p className="text-xs text-muted-foreground text-justify hyphens-auto">
          Worked out from your figures, and not applied to them. Nothing below
          changes your plan or is saved with it — each one is a choice you could
          make, priced against the choice of doing nothing.
        </p>
      </div>
      {actions}
    </div>
  )
}

/**
 * Moving money out of the 401(k) and into a Roth while the low brackets are
 * empty.
 *
 * The whole ladder is shown rather than the winning row alone. The tax answer
 * is only part of the decision — before 65 a conversion also moves the income
 * a health-insurance subsidy is judged on, and this projection cannot price
 * that. Someone weighing the two needs to see what each amount costs, not be
 * handed a recommendation that only counted one side.
 */
function RothConversions({
  c,
  inputs,
}: {
  c: ConversionComparison
  inputs: PlanInputs
}) {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const endAge = inputs.endAge
  /**
   * Whether losing the subsidy is a property of a choice or of the plan.
   *
   * The red on that column exists to tell rows apart — this amount costs you
   * the credit, that one keeps it. When every row crosses, it distinguishes
   * nothing and only repeats what the panel below already says at length, so
   * it is dropped. A household that is over the line whatever it converts is
   * not being warned about a choice; it is being told about its income, and
   * that is the panel's job rather than the column's.
   */
  const cliffIsUnavoidable =
    c.options.length > 0 && c.options.every((o) => o.crossesCliff)
  // Named from the table rather than hardcoded, so the note cannot drift from
  // the brackets the projection actually charged.
  const bands = FEDERAL[inputs.filingStatus].brackets
  const lowRate = bands[1]?.rate ?? 12
  const topRate = bands.at(-1)?.rate ?? 37
  /** What this row is, in words, under the amount. */
  const meaning = (o: (typeof c.options)[number]) => {
    if (o.annual === 0) return 'what your plan does now'
    if (o.drainsPot) return 'empties the account as fast as allowed'
    if (c.excessive && o.annual === c.excessive.annual)
      return 'more than pays for itself'
    if (o.annual === c.best.annual && c.worthwhile)
      return 'fills the cheap brackets, no further'
    return 'a partial conversion'
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          Move money into a Roth between {c.fromAge} and {c.toAge}
        </p>
        <p className="text-xs text-muted-foreground text-justify hyphens-auto">
          A Roth conversion moves money out of your 401(k) or IRA and into a
          Roth. You pay income tax on it in the year you move it, and nothing on
          it ever again — no tax when you spend it, and it is not counted in the
          amounts the government later forces you to withdraw. Between{' '}
          {c.fromAge} and {c.toAge} your other income is at its lowest, so this
          is when moving it is cheapest.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left align-bottom">
              <th className="py-1.5 pr-3 font-medium">Move each year</th>
              <th className="px-3 py-1.5 font-medium text-right">
                Total tax
                <span className="block text-[10px] font-normal normal-case">
                  whole plan
                </span>
              </th>
              <th className="px-3 py-1.5 font-medium text-right">
                Medicare surcharge
                <span className="block text-[10px] font-normal normal-case">
                  a year, once it starts
                </span>
              </th>
              {c.beforeMedicare && (
                <th className="px-3 py-1.5 font-medium text-right">
                  ACA premiums
                  <span className="block text-[10px] font-normal normal-case">
                    a year, after subsidy
                  </span>
                </th>
              )}
              <th className="px-3 py-1.5 font-medium text-right">
                RMD at {c.toAge + 1}
                <span className="block text-[10px] font-normal normal-case">
                  first year
                </span>
              </th>
              <th className="px-3 py-1.5 font-medium text-right">
                Tax-free
                <span className="block text-[10px] font-normal normal-case">
                  at the end
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {c.options.map((o) => {
              const isBest = o.annual === c.best.annual && c.worthwhile
              const versus = o.lifetimeTax - c.none.lifetimeTax
              return (
                <tr
                  key={o.annual}
                  className={cn(
                    'border-t border-border tabular-nums',
                    isBest && 'bg-accent/40',
                  )}
                >
                  <td className="py-1.5 pr-3">
                    <span
                      className={cn(isBest && 'font-medium text-foreground')}
                    >
                      {o.annual === 0
                        ? 'Nothing'
                        : o.drainsPot
                          ? 'All of it'
                          : money(o.annual)}
                    </span>
                    {isBest && (
                      <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                        cheapest
                      </span>
                    )}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {meaning(o)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-foreground">
                    {money(o.lifetimeTax)}
                    <span
                      className={cn(
                        'block text-[11px]',
                        versus < 0 ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {o.annual === 0
                        ? '—'
                        : versus < 0
                          ? `${money(-versus)} less`
                          : `${money(versus)} more`}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-foreground">
                    {o.irmaaPerYear >= 1 ? money(o.irmaaPerYear) : 'none'}
                    {/* The yearly figure is the one worth comparing; the span
                        beneath is what turns it back into a lifetime cost, so
                        neither has to be inferred from the other. */}
                    <span className="block text-[11px] text-muted-foreground">
                      {o.irmaaYears === 0
                        ? 'never charged'
                        : `${money(o.lifetimeIrmaa)} over ${o.irmaaYears} ${
                            o.irmaaYears === 1 ? 'year' : 'years'
                          }`}
                    </span>
                  </td>
                  {c.beforeMedicare && (
                    <td className="px-3 py-1.5 text-right text-foreground">
                      <span
                        className={cn(
                          o.crossesCliff && !cliffIsUnavoidable && 'text-destructive',
                        )}
                      >
                        {o.acaPerYear >= 1 ? money(o.acaPerYear) : 'none'}
                      </span>
                      {/* What the figure above is, said rather than left to be
                          worked out: the subsidy is the invisible half of the
                          price, and the row that loses it needs to say so in
                          money rather than in a word. */}
                      <span
                        className={cn(
                          'block text-[11px]',
                          o.crossesCliff && !cliffIsUnavoidable
                            ? 'font-medium text-destructive'
                            : 'text-muted-foreground',
                        )}
                      >
                        {/* How many years actually lose it, not merely whether
                            any did — a conversion that empties the account in
                            two years is subsidised in all the rest. */}
                        {o.acaCliffYears === 0
                          ? `${money(o.acaSubsidyPerYear)} subsidised`
                          : o.acaCliffYears === o.acaYears
                            ? `no subsidy at all`
                            : `nothing in ${o.acaCliffYears} of ${o.acaYears} years`}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {/* An emptied account still carries a fraction of a cent,
                        and a required distribution on it rounds to $0 — which
                        reads as a figure rather than as the absence of one. */}
                    {o.firstRmd >= 1 ? money(o.firstRmd) : 'nothing'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {pct(o.endingRothShare)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* A glossary rather than a paragraph. Four columns explained in prose
          runs to six lines that have to be held in the head at once; the same
          four explained one at a time can be read in any order, and the one
          being puzzled over can be found without re-reading the others. */}
      <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 text-xs">
        <p className="text-muted-foreground text-justify hyphens-auto">
          Every row is your plan exactly as it stands, changed in one way only —
          how much you move into the Roth each year — and then run again to the
          end. What the columns mean:
        </p>
        <dl className="flex flex-col gap-2">
          <Column name="Move each year">
            How much leaves the 401(k) and IRA each year, every year from{' '}
            {c.fromAge} to {c.toAge}.
          </Column>
          <Column name="Total tax">
            Every dollar of tax you pay from now until {endAge}, added up. Lower
            is better. The small figure underneath compares it with moving
            nothing.
          </Column>
          <Column name="Medicare surcharge">
            Medicare charges people with higher incomes extra for Parts B and D,
            on top of the ordinary premium — and it decides using your income
            from <em>two years earlier</em>. Moving money counts as income, so a
            large move today can raise your premiums the year after next. The
            figure is what that costs{' '}
            <span className="font-medium text-foreground">in a year</span> it is
            charged; underneath is the whole of it, and how many years that is.
            Why your plan comes to that total — which year it starts, and how
            much of it is a long-run assumption about premium growth rather
            than your own income — is set out in <InsightsLink />.
          </Column>
          {c.beforeMedicare && (
            <Column name="ACA premiums">
              Medicare starts at {MEDICARE_AGE}; until then you buy your own
              cover through the ACA marketplace. The figure is what{' '}
              <span className="font-medium text-foreground">you</span> would pay
              in premiums{' '}
              <span className="font-medium text-foreground">in a year</span>{' '}
              between {c.fromAge} and {MEDICARE_AGE - 1} — not the price of the
              plan. The government pays the rest as a subsidy, and the grey line
              under each figure is how much of it that covers. How the price
              splits between the two depends on your income for the year, and
              moving money into a Roth counts as income. Above four times the poverty line — {' '}
              {money(povertyLine(c.householdSize) * CLIFF)} for a household of{' '}
              {HOUSEHOLD_WORDS[c.householdSize] ?? c.householdSize} — the subsidy stops
              entirely rather than tapering, which is why this column can leap
              between one row and the next.
            </Column>
          )}
          <Column name={`RMD at ${c.toAge + 1}`}>
            The required minimum distribution: what the government makes you
            take out of the 401(k) that year, whether you need it or not. Move
            money now and there is less left to be forced out later.
          </Column>
          <Column name="Tax-free at the end">
            Of whatever is left at {endAge}, the share sitting in the Roth —
            money you or your heirs can spend without owing anything further on
            it.
          </Column>
        </dl>
        {/* The glossary says what a column is. It does not say why a column
            comes to the number it does on this plan — that is written against
            the reader's own figures further down, and someone who never
            scrolls past the table has no way to know it exists. */}
        <p className="border-t border-border/60 pt-2 text-muted-foreground text-justify hyphens-auto">
          That is what the columns are. Why they come to these particular
          figures on your plan is taken apart in <InsightsLink />, further down
          this page.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        <Goal label="Why moving everything costs more">
          {c.everything.lifetimeCost > c.best.lifetimeCost ? (
            <>
              Tax rates climb in steps as your income for the year rises — about{' '}
              {lowRate}% at the bottom, up to {topRate}% at the top. Moving a
              modest amount each year keeps you on the low steps. Moving the
              whole account crams years of income into one or two, which pushes
              that income onto the high steps, so you hand over {topRate}% today
              on money you could have taken out at {lowRate}% later — and the
              same spike raises your Medicare premiums two years afterwards.
              Between them, moving all of it costs{' '}
              <span className="font-medium text-foreground">
                {money(c.everything.lifetimeCost - c.best.lifetimeCost)} more
              </span>{' '}
              than moving {money(c.best.annual)} a year. The aim is to fill the
              cheap steps each year and stop.
            </>
          ) : (
            <>
              On this plan it does not: even moving the whole account keeps you
              on cheaper steps than the forced withdrawals would meet later.
              That is unusual, and it happens here because your income stays low
              throughout.
            </>
          )}
        </Goal>

        {c.irmaaSaving > 1 && (
          <Goal label="It can lower your premiums too">
            Moving {money(c.best.annual)} a year leaves less to be forced out of
            the 401(k) later, so your income in those later years is lower — and
            that is{' '}
            <span className="font-medium text-foreground">
              {money(c.irmaaSaving)} less
            </span>{' '}
            in Medicare surcharges across the plan, on top of the tax saved.
          </Goal>
        )}

        <Goal label="Where the tax money comes from">
          You owe the tax in the same year you move the money, and it should be
          paid from an ordinary savings or brokerage account — not out of the
          401(k) itself. If you withdraw extra from the 401(k) to cover the
          bill, that extra is taxed too, and less of your money ends up in the
          Roth. It still works, but you lose a good part of what you were trying
          to gain.
        </Goal>
      </ul>

      {c.beforeMedicare && (
        <div className="flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-destructive">
            The cliff in the ACA premiums column
          </p>
          <p className="text-justify hyphens-auto">
            Medicare starts at {MEDICARE_AGE}. Until then most people who have
            stopped working buy cover on the marketplace, where the government
            pays part of the premium and how much depends on your income for the
            year — and moving money into a Roth counts as income. The help does
            not fade out as you earn more: it stops. For a household of{' '}
            {c.householdSize === 2 ? 'two' : 'one'} the line is{' '}
            <span className="font-medium text-foreground">
              {money(povertyLine(c.householdSize) * CLIFF)}
            </span>{' '}
            of income, and a dollar past it costs the entire subsidy — worth{' '}
            <span className="font-medium text-foreground">
              {money(c.cliffCost)}
            </span>{' '}
            a year to this plan.
          </p>
          {/* Naming the rows only helps while there are rows it does not
              apply to. Where every one crosses — doing nothing included — the
              list is every amount in the table, and the useful sentence is not
              which rows but that the choice is not what put you over. */}
          {cliffIsUnavoidable ? (
            <p className="text-justify hyphens-auto">
              <span className="font-medium text-destructive">
                Every amount above crosses it, including moving nothing at all.
              </span>{' '}
              This plan&apos;s income is over the line before any conversion is
              made, so the subsidy is lost either way and no amount in the table
              can win it back. What the rows still differ on is tax — read the
              column beside this one, and treat the cover cost as the same
              charge under all of them.
            </p>
          ) : (
            c.cliffRows.length > 0 && (
              <p className="text-justify hyphens-auto">
                <span className="font-medium text-destructive">
                  {c.cliffRows.length === 1
                    ? 'One amount above crosses it'
                    : `${c.cliffRows.length} of the amounts above cross it`}
                  :
                </span>{' '}
                {c.cliffRows
                  .map((o) => (o.drainsPot ? 'all of it' : money(o.annual)))
                  .join(', ')}
                . Those rows are paying full price for cover, which is why their
                all-in cost jumps rather than climbing.
              </p>
            )
          )}
          <p className="text-justify hyphens-auto">
            <span className="font-medium text-foreground">
              Premiums vary by where you live.
            </span>{' '}
            The subsidy is worked out against a benchmark plan, and what that
            plan costs varies by where you live — sometimes by half. The figures
            here use the national average for your age, which is the right size
            everywhere and the exact number almost nowhere. Treat the gap
            between rows as the reliable part, and check your own marketplace
            quote before acting on the amounts.
          </p>
        </div>
      )}
    </div>
  )
}

/** One column of the table above, named and then explained. */
function Column({
  name,
  children,
}: {
  name: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 font-medium text-foreground sm:w-40">{name}</dt>
      <dd className="flex-1 text-muted-foreground text-justify hyphens-auto">
        {children}
      </dd>
    </div>
  )
}

function Goal({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
      <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/70">
        {label}
      </span>
      <span className="flex-1 text-justify hyphens-auto">{children}</span>
    </li>
  )
}

function Line({
  label,
  value,
  inset,
}: {
  label: string
  value: string
  /** A component of the line above it rather than a sibling of it. */
  inset?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3',
        inset && 'pl-3 text-xs text-muted-foreground',
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums text-foreground/80">{value}</dd>
    </div>
  )
}
