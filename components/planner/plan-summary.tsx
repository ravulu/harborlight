'use client'

import type { PlanInputs, PlanResult } from '@/lib/retirement'
import type { MonteCarloResult, Outcomes } from '@/lib/monte-carlo'
import type { ClaimComparison, Suggestion } from '@/lib/suggestions'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'
import { formatCurrency } from '@/lib/retirement'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { taxPhases } from '@/lib/tax'
import { benefitFactor, spouseMonthlyBenefit } from '@/lib/social-security'
import {
  TrendingUp,
  PiggyBank,
  CalendarClock,
  CircleCheck,
  CircleAlert,
  Landmark,
  Receipt,
} from 'lucide-react'

/** One row in either suggestion list, so both read the same way. */
function OptionRow({
  action,
  context,
  value,
  best,
}: {
  action: string
  context: string
  value: string
  best?: boolean
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="font-medium text-foreground">{action}</span>
      <span className="text-muted-foreground">{context}</span>
      {best && (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          Best
        </span>
      )}
      <span
        className={cn(
          'ml-auto font-medium tabular-nums',
          best ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </li>
  )
}

/** A titled list of options, shared by both suggestion blocks. */
function Options({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  )
}

/** A labelled recommendation line under the claim-age rows. */
function Goal({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground">
      <span className="text-[10px] font-medium uppercase tracking-wider text-foreground/70">
        {label}
      </span>
      <span className="flex-1 text-pretty">{children}</span>
    </li>
  )
}

/**
 * When to claim, answered by simulating each age rather than by rule of
 * thumb, against two goals that can disagree.
 *
 * Confidence comes first: waiting raises the benefit for life but the waiting
 * years come out of savings, and which side wins depends on the horizon.
 *
 * Tax is the second, and it moves for a reason worth naming. A larger benefit
 * means smaller withdrawals, which lowers provisional income, which drags less
 * of the benefit into taxable income — the tax torpedo working in reverse. So
 * waiting can cut lifetime tax and the taxed share of the benefit at once.
 */
function Claiming({ claiming }: { claiming: ClaimComparison }) {
  const { options, best, lowestTax, current, spread, taxSaving } = claiming
  const shown = options.filter((o) => [62, 67, 70].includes(o.age))
  const gain = Math.round((best.confidence - current.confidence) * 100)
  const worthwhileTax = taxSaving > 1000 && lowestTax.age !== current.age
  const compact = (v: number) => formatCurrency(v, { compact: true })

  return (
    <Options title="When you claim your Social Security matters:">
      {shown.map((o) => (
        <OptionRow
          key={o.age}
          action={`Claim at ${o.age}`}
          context={`${formatCurrency(Math.round(o.monthly))} a month`}
          value={`${Math.round(o.confidence * 100)}%`}
          best={o.age === best.age && spread > 2}
        />
      ))}

      <Goal label="For confidence">
        {spread <= 2
          ? 'Claiming age barely moves this plan, so take it when it suits you.'
          : best.age === current.age
            ? `Your ${current.age} is already the strongest of the nine ages, worth ${spread} points over the weakest.`
            : `Claim at ${best.age} — about ${gain} ${
                gain === 1 ? 'point' : 'points'
              } more than at ${current.age}.`}
      </Goal>

      <Goal label="For tax">
        {worthwhileTax ? (
          <>
            Claim at {lowestTax.age} — {compact(taxSaving)} less tax across the plan
            {lowestTax.taxedShare < current.taxedShare - 0.01 ? (
              <>
                , with {Math.round(lowestTax.taxedShare * 100)}% of the benefit taxed
                instead of {Math.round(current.taxedShare * 100)}%, since a larger
                benefit means smaller withdrawals
              </>
            ) : null}
            .
          </>
        ) : lowestTax.age === current.age ? (
          `Your ${current.age} already pays the least tax across the plan.`
        ) : (
          `Claiming age changes lifetime tax by under ${compact(1000)}, so it is not the deciding factor here.`
        )}
      </Goal>
    </Options>
  )
}

/**
 * What would actually close the gap, in figures rather than advice. Which
 * levers appear follows the runway: saving cannot be a lever once someone has
 * retired, and over a short one no realistic increase moves the result, so the
 * absence of an option is itself the answer.
 */
function Fixes({
  suggestions,
  yearsToRetire,
  retirementAge,
}: {
  suggestions: Suggestion[]
  yearsToRetire: number
  retirementAge: number
}) {
  const target = Math.round(TARGET_CONFIDENCE * 100)
  const money = (v: number) => formatCurrency(v)

  if (suggestions.length === 0) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground text-pretty">
        No single change gets this to {target}%
        {yearsToRetire > 0 && yearsToRetire <= 5
          ? ` — with ${yearsToRetire} ${yearsToRetire === 1 ? 'year' : 'years'} left before retirement there is little time for saving to compound.`
          : '.'}{' '}
        It will take a combination, or a later retirement date.
      </p>
    )
  }

  const describe = (s: Suggestion) => {
    if (s.kind === 'save')
      return {
        action: `Save ${money(s.amount)} more a month`,
        context: `over your ${yearsToRetire} ${yearsToRetire === 1 ? 'year' : 'years'} to retirement`,
      }
    if (s.kind === 'spend')
      return {
        action: `Spend ${money(s.amount)} less a month`,
        context: 'in retirement',
      }
    return {
      action: `Retire ${s.amount} ${s.amount === 1 ? 'year' : 'years'} later`,
      context: `at ${retirementAge + s.amount} instead`,
    }
  }

  return (
    <Options title={`Any one of these would take it to about ${target}%:`}>
      {suggestions.map((s) => {
        const { action, context } = describe(s)
        return (
          <OptionRow
            key={s.kind}
            action={action}
            context={context}
            value={`${Math.round(s.confidence * 100)}%`}
          />
        )
      })}
    </Options>
  )
}

/**
 * The spread behind a headline figure, for the tiles that have one.
 *
 * Only the balances do. Spending, the benefit, the contributions and the tax
 * on them are decisions and rules rather than market outcomes, so they come
 * out the same in all 10,000 runs and quoting a range for them would invent
 * uncertainty that is not there.
 */
function Spread({ outcomes }: { outcomes: Outcomes }) {
  const cell = (label: string, value: number, align: string, strong?: boolean) => (
    <div className={cn('flex flex-col gap-0.5', align)}>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'text-sm tabular-nums',
          strong ? 'font-semibold text-foreground' : 'text-foreground/75',
        )}
      >
        {formatCurrency(value, { compact: true })}
      </span>
    </div>
  )

  return (
    <div className="mt-auto border-t border-border pt-3">
      <div className="hidden grid-cols-3 gap-2 sm:grid">
        {cell('Worst 10%', outcomes.low, 'items-start text-left')}
        {cell('Middle', outcomes.median, 'items-center text-center', true)}
        {cell('Best 10%', outcomes.high, 'items-end text-right')}
      </div>
      {/* Three columns need room the tile does not have on a phone. The middle
          is the figure above it, so the bounds alone lose nothing. */}
      <div className="flex flex-col gap-0.5 sm:hidden">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Worst to best 10%
        </span>
        <span className="text-sm tabular-nums text-foreground/75">
          {formatCurrency(outcomes.low, { compact: true })} –{' '}
          {formatCurrency(outcomes.high, { compact: true })}
        </span>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  icon,
  outcomes,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  outcomes?: Outcomes
}) {
  return (
    <Card className="p-5 gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground text-balance">
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      {/* Retiring today leaves the markets no time to act, so all three points
          are the same figure. Three identical numbers read as a fault. */}
      {outcomes && outcomes.low !== outcomes.high ? (
        <Spread outcomes={outcomes} />
      ) : (
        // Said rather than left blank, so the absence of a range reads as an
        // answer — this figure does not depend on how the markets go — instead
        // of as something missing from the tile.
        <p className="mt-auto border-t border-border pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Fixed by your assumptions
        </p>
      )}
    </Card>
  )
}

export function PlanSummary({
  inputs,
  result,
  monteCarlo,
  suggestions,
  claiming,
}: {
  inputs: PlanInputs
  result: PlanResult
  monteCarlo: MonteCarloResult
  suggestions: Suggestion[]
  claiming: ClaimComparison | null
}) {
  const yearsToRetire = Math.max(0, inputs.retirementAge - inputs.currentAge)
  // Gated on filing jointly, exactly as the projection is: the entitlement is
  // computed from the worker's own record, so without this a single filer
  // would see half their benefit again on top of it.
  const spousePaid =
    inputs.filingStatus === 'married'
      ? spouseMonthlyBenefit(
          inputs.socialSecurityMonthly,
          inputs.spouseBenefitMonthly,
          inputs.spouseClaimAge,
          Math.max(inputs.spouseClaimAge, inputs.socialSecurityAge),
        ).paid
      : 0
  const householdBenefit =
    inputs.socialSecurityMonthly * benefitFactor(inputs.socialSecurityAge) + spousePaid
  // "in 0 years" reads as a bug rather than as retiring today, which is what
  // it means once the two ages meet.
  const whenRetired =
    yearsToRetire === 0
      ? 'from today'
      : `${yearsToRetire} ${yearsToRetire === 1 ? 'year' : 'years'} away`
  // The verdict is now how often the plan worked, not whether one fixed path
  // happened to. A plan that survives 9 runs in 10 is a different proposition
  // from one that survives 5, and a single path cannot tell them apart.
  const success = Math.round(monteCarlo.successRate * 100)
  const lasts = success >= 80

  // With a state chosen the projection uses a rate per phase, so quoting one
  // combined figure here would describe only the first stretch.
  const rates = inputs.taxState
    ? taxPhases(inputs, inputs.taxState, inputs.filingStatus)
        .map((p) => Math.round((p.rates.federal + p.rates.state) * 10) / 10)
    : []
  const spread = [...new Set(rates)]
  const taxSub =
    spread.length > 1
      ? `Lifetime, at ${Math.min(...spread)}–${Math.max(...spread)}% by age`
      : `Lifetime, at ${
          spread[0] ??
          Math.round((inputs.federalTaxRate + inputs.stateTaxRate) * 10) / 10
        }% combined`


  return (
    <div className="flex flex-col gap-4">
      <Card
        className={cn(
          'p-5 flex-row items-start gap-4 border-l-4',
          lasts ? 'border-l-primary' : 'border-l-destructive',
        )}
      >
        <span className={cn('mt-0.5', lasts ? 'text-primary' : 'text-destructive')}>
          {lasts ? <CircleCheck className="size-8" /> : <CircleAlert className="size-8" />}
        </span>
        <div className="flex flex-col">
          <p className="font-semibold text-foreground text-pretty">
            Your savings lasted through age {inputs.endAge} in {success}% of{' '}
            {monteCarlo.runs.toLocaleString()} simulations.
          </p>
          <p className="text-sm text-muted-foreground text-pretty">
            {lasts
              ? 'A plan that holds up across most market outcomes, not just a lucky one.'
              : monteCarlo.medianDepletionAge
                ? `Where it fell short, the money typically ran out around age ${monteCarlo.medianDepletionAge}.`
                : 'Some runs came up short.'}
          </p>

          {claiming && <Claiming claiming={claiming} />}

          {!lasts && (
            <Fixes
              suggestions={suggestions}
              yearsToRetire={yearsToRetire}
              retirementAge={Math.max(inputs.retirementAge, inputs.currentAge)}
            />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          icon={<PiggyBank className="size-4" />}
          label="At retirement"
          value={formatCurrency(monteCarlo.balanceAtRetirement.median, { compact: true })}
          outcomes={monteCarlo.balanceAtRetirement}
          // "Median" is the right word and the wrong one to put on a tile: it
          // is the middle of the simulated runs, so say that.
          sub={`Middle outcome, ${whenRetired}`}
        />
        <Stat
          icon={<CalendarClock className="size-4" />}
          label="First-year income"
          value={formatCurrency(result.firstYearRetirementSpending, { compact: true })}
          sub={`From age ${Math.max(inputs.retirementAge, inputs.currentAge)}`}
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label="Total contributed"
          value={formatCurrency(result.totalContributions, { compact: true })}
          sub={
            yearsToRetire === 0
              ? 'No working years left to add to it'
              : `Over your ${yearsToRetire} ${yearsToRetire === 1 ? 'year' : 'years'} of saving`
          }
        />
        <Stat
          icon={<PiggyBank className="size-4" />}
          label="Peak balance"
          value={formatCurrency(monteCarlo.peakBalance.median, { compact: true })}
          outcomes={monteCarlo.peakBalance}
          sub="Middle outcome, at its highest"
        />
        <Stat
          icon={<Landmark className="size-4" />}
          label="Social Security"
          // The household's, per year: with a spouse on the record the tile
          // would otherwise report half of what the projection is spending.
          value={formatCurrency(householdBenefit * 12, { compact: true })}
          sub={
            householdBenefit > 0
              ? `Per year from age ${inputs.socialSecurityAge}${
                  spousePaid > 0 ? ', you and your spouse' : ''
                }${
                  inputs.socialSecurityCola !== inputs.inflationRate
                    ? `, then ${inputs.socialSecurityCola}% COLA`
                    : ''
                }`
              : 'None included'
          }
        />
        <Stat
          icon={<Receipt className="size-4" />}
          label="Tax on withdrawals"
          value={formatCurrency(result.totalTaxes, { compact: true })}
          sub={taxSub}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Every figure on this page is in today&apos;s money, so spending and
        withdrawals hold their buying power — in the dollars of each year they
        rise with inflation. The balances are the middle outcome of{' '}
        {monteCarlo.runs.toLocaleString()} simulated runs: half came out above
        it and half below, so it is the result to plan around rather than the
        one to count on. Income and tax follow your assumptions and do not
        depend on market returns.
      </p>
    </div>
  )
}
