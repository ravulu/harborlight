'use client'

import type { PlanInputs, YearRow } from '@/lib/retirement'
import { formatCurrency } from '@/lib/retirement'
import {
  taxPhases,
  SS_THRESHOLDS,
  FEDERAL,
  CAPITAL_GAINS,
  type RateEstimate,
  type PhaseSources,
} from '@/lib/tax'
import { findState, FILING_STATUSES, type FilingStatus } from '@/lib/state-tax'
import { cn } from '@/lib/utils'

const money = (v: number) => formatCurrency(Math.round(v))



/**
 * The tax picture across the whole plan rather than for one year: what
 * changes at retirement, what changes again when Social Security starts, and how
 * long each stretch lasts.
 */
export function TaxPhases({
  inputs,
  rows,
}: {
  inputs: PlanInputs
  /** The projected years, so the 59½ split knows when the 401(k) is drawn. */
  rows: YearRow[]
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
                    <Line
                      label={`State tax (${p.rates.state}%)`}
                      value={money(p.totalStateTax)}
                    />
                  </dl>
                  <Why
                    rates={p.rates}
                    sources={p.sources}
                    status={inputs.filingStatus}
                  />
                  <p className="text-xs text-muted-foreground text-pretty">{p.detail}</p>
                  <p className="mt-auto rounded-md border border-primary/20 bg-accent/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground text-pretty">
                    <span className="font-medium text-foreground">What you can do.</span>{' '}
                    {p.scenario}
                  </p>
                </>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">How these were worked out</p>
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
              ? 'Taxes Social Security, following the federal taxable amount. Its income limits, which exempt many retirees outright, are not modelled here.'
              : 'Does not tax Social Security, so only the withdrawal is exposed to state tax.'
            : 'No state selected, so the rates you entered by hand apply to every year.'}{' '}
          {state?.retirementExempt
            ? 'Withdrawals from retirement accounts are exempt too, which is why the state rate is zero.'
            : ''}
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="tabular-nums text-foreground/80">{value}</dd>
    </div>
  )
}
