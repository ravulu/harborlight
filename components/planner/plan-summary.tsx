'use client'

import type { PlanInputs, PlanResult } from '@/lib/retirement'
import type { MonteCarloResult, Outcomes } from '@/lib/monte-carlo'
import type { ClaimComparison, Suggestion } from '@/lib/suggestions'
import type { EarliestRetirement } from '@/lib/earliest'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'
import { formatCurrency } from '@/lib/retirement'
import { Card } from '@/components/ui/card'
import { InfoTip } from './info-tip'
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
/**
 * Why a simulated tile and the year-by-year table disagree.
 *
 * The app answers "what is this plan worth" on two bases — a single steady run
 * in the Table tab and in the ladders under Tax, and the middle of ten thousand
 * volatile ones in these tiles — and used to say so nowhere. A reader comparing
 * the two finds a discrepancy with no wrong number in it, which is the worst
 * kind to go looking for. The gap is not even consistent in direction: drag
 * pulls the median below a smooth path at retirement, while a random path's
 * highest point tends to overshoot a smooth one's.
 */
function BasisNote() {
  return (
    <p>
      Because this is simulated, it will not match the Table tab or the ladders
      under Tax — those are a single steady run at the return you entered, with
      no market variation. Two different questions, and neither answer is the
      other&apos;s error.
    </p>
  )
}

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

/**
 * The earliest age this plan could support — offered, not asserted.
 *
 * It is the question people arrive with, and until now the planner only graded
 * an age they had already picked. But an age is a heavier thing to hand
 * someone than a percentage: it is a decision that cannot be taken back, and
 * it rests on every assumption in the plan holding for thirty years. So it is
 * framed as somewhere to look rather than an answer, and it carries the
 * reasons it might be wrong rather than putting them in a footnote.
 */
function Earliest({
  earliest,
  endAge,
}: {
  earliest: EarliestRetirement
  endAge: number
}) {
  const bar = Math.round(earliest.target * 100)
  const pct = (v: number) => `${Math.round(v * 100)}%`

  if (earliest.age === null) {
    return (
      <Card className="p-5 gap-2 border-l-4 border-l-destructive">
        <p className="text-sm font-medium text-foreground text-pretty">
          No retirement age between {earliest.searchedFrom} and{' '}
          {earliest.searchedTo} reaches {bar}% on these figures.
        </p>
        <p className="text-xs text-muted-foreground text-pretty">
          Working longer alone does not fix this plan — the changes below will
          have to come from saving, spending, or both. Your{' '}
          {earliest.chosenAge} comes out at {pct(earliest.chosenConfidence)}.
        </p>
      </Card>
    )
  }

  const earlier = earliest.yearsEarlier
  const headline =
    earlier > 0
      ? `You could look at retiring at ${earliest.age}`
      : earlier < 0
        ? `This plan reaches ${bar}% at ${earliest.age}, not ${earliest.chosenAge}`
        : `${earliest.chosenAge} is the earliest this plan reaches ${bar}%`

  return (
    <Card className="p-5 gap-3 border-l-4 border-l-primary">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wider text-primary">
          Worth exploring
        </p>
        <p className="font-serif text-lg font-medium text-foreground text-pretty">
          {headline}
        </p>
        <p className="text-sm text-muted-foreground text-pretty">
          {earlier > 0 ? (
            <>
              {earlier} {earlier === 1 ? 'year' : 'years'} earlier than the{' '}
              {earliest.chosenAge} you entered, and it still lasts through{' '}
              {endAge} in {pct(earliest.confidence)} of runs — against{' '}
              {pct(earliest.chosenConfidence)} at {earliest.chosenAge}.
            </>
          ) : earlier < 0 ? (
            <>
              Your {earliest.chosenAge} comes out at{' '}
              {pct(earliest.chosenConfidence)}, below the {bar}% this planner
              treats as sound. Waiting to {earliest.age} reaches{' '}
              {pct(earliest.confidence)}.
            </>
          ) : (
            <>
              Retiring any earlier drops below {bar}%. At {earliest.age} it
              lasts through {endAge} in {pct(earliest.confidence)} of runs.
            </>
          )}
        </p>
      </div>

      <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
        <Goal label="It is a probability">
          {pct(earliest.confidence)} means about {Math.round((1 - earliest.confidence) * 10)} in
          10 simulated markets still ran out of money. A number that clears a
          bar is not a promise, and {bar}% is this planner&apos;s choice of bar,
          not a rule.
        </Goal>
        <Goal label="It assumes everything else holds">
          The spending you entered, the returns you assumed, the Social Security
          you expect, and contributions continuing until that age. Change any of
          them and this age moves.
        </Goal>
        {earliest.beforeMedicare && (
          <Goal label="Before 65 you buy your own cover">
            Medicare has not started, so health insurance comes out of the same
            savings — priced on the Tax tab, but premiums vary a great deal by
            where you live. Check a real quote before treating this age as
            reachable.
          </Goal>
        )}
        {earliest.beforePenaltyFree && (
          <Goal label="Before 59½ the 401(k) costs more">
            A withdrawal from it carries an extra 10%. The projection charges
            it, so this age already accounts for it — but it is the reason
            retiring early leans hard on whatever sits outside the 401(k).
          </Goal>
        )}
        <Goal label="What to do with it">
          Change the retirement age above to try it. Nothing here has been
          applied — this is the same plan, run again at a different age.
        </Goal>
      </ul>
    </Card>
  )
}

function Stat({
  label,
  value,
  sub,
  icon,
  outcomes,
  info,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  outcomes?: Outcomes
  info?: React.ReactNode
}) {
  return (
    <Card className="p-5 gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {info && <InfoTip label={label}>{info}</InfoTip>}
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
  earliest,
}: {
  inputs: PlanInputs
  result: PlanResult
  monteCarlo: MonteCarloResult
  earliest: EarliestRetirement | null
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
  // The same bar the suggestions aim at, rather than a second one written out
  // in digits beside it.
  const lasts = monteCarlo.successRate >= TARGET_CONFIDENCE

  /**
   * What the projection itself says, as distinct from the simulations.
   *
   * The headline above is a distribution over ten thousand market paths. This
   * is the single run the rest of the page is built from, at the returns the
   * plan actually states — so when it comes up short it is not bad luck, it is
   * the plan. Worth saying plainly and separately, and worth sizing: running
   * out at 84 with a small gap is a different problem from running out at 72
   * with a large one.
   */
  const shortfalls = result.rows.filter((r) => r.unfunded > 0)
  const worstShortfall = shortfalls.reduce((a, r) => Math.max(a, r.unfunded), 0)

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

          {result.depletionAge !== null && (
            <p className="mt-1 text-sm text-destructive text-pretty">
              At the returns this plan states, the accounts run out at age{' '}
              {result.depletionAge} — leaving{' '}
              {shortfalls.length === 1
                ? 'one year'
                : `${shortfalls.length} years`}{' '}
              unpaid for, up to{' '}
              {formatCurrency(worstShortfall, { compact: true })} of spending
              short in the worst of them.
            </p>
          )}

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

      {earliest && <Earliest earliest={earliest} endAge={inputs.endAge} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat
          icon={<PiggyBank className="size-4" />}
          label="At retirement"
          value={formatCurrency(monteCarlo.balanceAtRetirement.median, { compact: true })}
          outcomes={monteCarlo.balanceAtRetirement}
          // "Median" is the right word and the wrong one to put on a tile: it
          // is the middle of the simulated runs, so say that.
          sub={`Middle outcome, ${whenRetired}`}
          info={
            <>
              <p>
                What the savings come to on the day you stop working, in
                today&apos;s money — so it is what that pot would buy now, not
                the larger number it will say on a statement by then.
              </p>
              <p>
                The plan is run {monteCarlo.runs.toLocaleString()} times against
                different market outcomes.{' '}
                <span className="font-medium text-foreground">
                  Middle outcome
                </span>{' '}
                means half the runs did better than this and half did worse. The
                range underneath is where the middle four-fifths of them landed.
              </p>
              <BasisNote />
            </>
          }
        />
        <Stat
          icon={<CalendarClock className="size-4" />}
          label="First-year income"
          value={formatCurrency(result.firstYearRetirementSpending, { compact: true })}
          sub={`From age ${Math.max(inputs.retirementAge, inputs.currentAge)}`}
          info={
            <>
              <p>
                What this plan spends in the first year of retirement, before
                tax — the monthly figure you entered, times twelve.
              </p>
              <p>
                It does not move with the markets, which is why there is no
                range under it: it is a decision you made, not an outcome. What
                the markets decide is whether the savings can keep paying it.
              </p>
            </>
          }
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
          info={
            <>
              <p>
                The money you put in yourself between now and retiring — your
                monthly contribution added up. It is not what that money grows
                to, and it does not include what you have already saved.
              </p>
              <p>
                Comparing it with the tile above is the point of it: the gap
                between the two is what the growth did.
              </p>
            </>
          }
        />
        <Stat
          icon={<PiggyBank className="size-4" />}
          label="Peak balance"
          value={formatCurrency(monteCarlo.peakBalance.median, { compact: true })}
          outcomes={monteCarlo.peakBalance}
          sub="Middle outcome, at its highest"
          info={
            <>
              <p>
                The most the savings are ever worth, at any point in the plan.
                For most people that is early in retirement — contributions have
                stopped, but drawing down has not yet outpaced the growth.
              </p>
              <p>
                If this is much larger than the balance at retirement, the plan
                is still growing after you stop working.
              </p>
              <p>
                Like the tile beside it, this is the middle of{' '}
                {monteCarlo.runs.toLocaleString()} runs against different market
                outcomes — the highest point each run reached, with half of them
                peaking above this and half below.
              </p>
              <BasisNote />
            </>
          }
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
          info={
            <>
              <p>
                The whole household&apos;s benefit for a year
                {spousePaid > 0 ? ', yours and your spouse’s together' : ''} — the
                monthly figure at full retirement age, adjusted for claiming at{' '}
                {inputs.socialSecurityAge}, times twelve.
              </p>
              <p>
                <span className="font-medium text-foreground">COLA</span> is the
                cost-of-living adjustment: the rise Social Security applies each
                year to keep the benefit up with prices. Yours is set to{' '}
                {inputs.socialSecurityCola}%. Where that differs from your{' '}
                {inputs.inflationRate}% inflation rate the benefit slowly gains
                or loses ground in real terms, which is why the two are entered
                separately.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  To find your own figure:
                </span>{' '}
                sign in at ssa.gov/myaccount and open your Social Security
                Statement. It estimates your monthly benefit at 62, at full
                retirement age, and at 70. The number to enter here is the one
                at full retirement age — the planner applies the reduction or
                the increase for the age you actually claim.
              </p>
            </>
          }
        />
        <Stat
          icon={<Receipt className="size-4" />}
          label="Tax on withdrawals"
          value={formatCurrency(result.totalTaxes, { compact: true })}
          sub={taxSub}
          info={
            <>
              <p>
                Federal and state income tax on everything drawn out of the
                accounts across the whole of retirement, added up — including
                the tax on the part of your Social Security that counts as
                income.
              </p>
              <p>
                Which account a dollar leaves from decides what it costs: a
                brokerage dollar is taxed only on its gain, a 401(k) dollar in
                full, and a Roth dollar not at all. The Tax tab shows the
                working.
              </p>
              <p>
                It is income tax only. Medicare surcharges and health-insurance
                premiums are costs of having income rather than taxes on it, and
                they are counted separately on the Tax tab.
              </p>
            </>
          }
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
