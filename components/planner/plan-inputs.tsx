'use client'

import { useState } from 'react'
import type { PlanDraft, PlanInputs, YearRow } from '@/lib/retirement'
import { formatCurrency, simulate, toPlanInputs } from '@/lib/retirement'
import { withDerivedRates } from '@/lib/planner-draft'
import {
  STATE_TAXES,
  FILING_STATUSES,
  CUSTOM_RATES,
  findState,
} from '@/lib/state-tax'
import {
  benefitFactor,
  benefitFactorLabel,
  spousalFactor,
  spouseMonthlyBenefit,
  SPOUSAL_SHARE,
  FULL_RETIREMENT_AGE,
} from '@/lib/social-security'
import { taxPhases } from '@/lib/tax'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExpenseEstimator } from './expense-estimator'
import { Field, InfoTip } from './info-tip'
import { useWindowReturn } from '@/lib/use-window-return'
import { rmdAge } from '@/lib/insights'
import {
  clamp,
  withThousands,
  significantBefore,
  caretAfter,
} from '@/lib/number-format'

/**
 * One scale for all three timeline ages, so the thumbs are directly
 * comparable. Ordering is enforced by nudging the later ages along rather than
 * by narrowing each slider's range.
 */
const AGE_MIN = 18
const AGE_MAX = 110

/** The window in which a US retirement benefit can actually be claimed. */
const SS_AGE_MIN = 62
const SS_AGE_MAX = 70

/** Top federal bracket, and a ceiling above the highest state rate. */
const FEDERAL_MAX = 37
const STATE_MAX = 15


/**
 * The value shown above a slider, editable directly.
 *
 * Out of focus it reads as a finished value with its unit — "7%" — so the box
 * looks like an ordinary field rather than a bare number. Focusing clears it,
 * so a click is enough to start typing a replacement; there is no need to
 * select the existing text first. Leaving it untouched puts the value back.
 */
function ValueInput({
  value,
  min,
  max,
  onChange,
  label,
  suffix,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
  suffix?: string
}) {
  // Non-null only while the field is being edited.
  const [text, setText] = useState<string | null>(null)
  // Skips the emptying when the browser is handing the window back rather
  // than someone choosing the field — otherwise a part-typed figure vanishes
  // on returning from another app.
  const returning = useWindowReturn()
  const editing = text !== null

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${label} value`}
      value={editing ? text : `${value}${suffix ?? ''}`}
      onFocus={() => {
            if (returning()) return
            setText('')
          }}
      onClick={() => setText('')}
      onChange={(e) => {
        // The unit is added back on blur, so only the number is kept here.
        const raw = e.target.value.replace(/[^\d.]/g, '')
        setText(raw)
        const n = Number(raw)
        // Commit only what is already in range, so the thumb does not jump
        // while a longer number is still being typed.
        if (raw !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n)
      }}
      onBlur={() => {
        const n = Number(text)
        // An empty box means they focused and changed nothing: keep the value.
        if (text !== null && text.trim() !== '' && Number.isFinite(n)) {
          onChange(clamp(n, min, max))
        }
        setText(null)
      }}
      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm font-medium tabular-nums text-foreground transition-colors focus:border-ring focus:outline-none"
    />
  )
}

function SliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm text-muted-foreground">
          {label}
        </Label>
        <ValueInput
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          label={label}
          suffix={suffix}
        />
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => {
          const nextValue = Array.isArray(v) ? v[0] : v
          if (typeof nextValue === 'number') onChange(nextValue)
        }}
        aria-label={label}
      />
    </div>
  )
}

/**
 * A text box that empties when it is clicked into.
 *
 * The name fields arrive already filled — a plan called "My retirement plan",
 * a person named from the account — so the first thing anyone does is replace
 * what is there. Clicking put the caret beside the existing text and typing
 * ran into it. Same contract as the money boxes: cleared while focused,
 * restored on the way out if nothing was typed, so a stray click costs
 * nothing.
 */
function ClearingInput({
  value,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (next: string) => void
}) {
  const [text, setText] = useState<string | null>(null)
  // Skips the emptying when the browser is handing the window back rather
  // than someone choosing the field — otherwise a part-typed figure vanishes
  // on returning from another app.
  const returning = useWindowReturn()

  return (
    <Input
      {...props}
      value={text ?? value}
      onFocus={() => {
            if (returning()) return
            setText('')
          }}
      onClick={() => setText('')}
      onChange={(e) => {
        setText(e.target.value)
        onValueChange(e.target.value)
      }}
      onBlur={() => setText(null)}
    />
  )
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
  prefix,
  placeholder,
  hint,
}: {
  id: string
  label: string
  value: number | null
  min: number
  max: number
  step: number
  onChange: (value: number | null) => void
  prefix?: string
  placeholder?: string
  /** Examples of what belongs in the field. Shown under it rather than as a
      placeholder, which a field holding a default 0 would never reveal. */
  hint?: string
}) {
  // Held while editing so a part-typed entry survives reformatting; cleared on
  // blur so the field falls back to the canonical value, which is what lets an
  // externally loaded plan replace what is shown.
  //
  // Focusing empties it, the same contract the slider boxes and the expense
  // estimator use. A field sitting at 0 would otherwise keep that zero and
  // merge the typing into it — 2,000 becoming 20,000 or 02,000 depending on
  // which side of it the caret landed.
  const [text, setText] = useState<string | null>(null)
  // Skips the emptying when the browser is handing the window back rather
  // than someone choosing the field — otherwise a part-typed figure vanishes
  // on returning from another app.
  const returning = useWindowReturn()
  const shown = text ?? (value === null ? '' : withThousands(String(value)))

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          // Text, not number: a number input refuses to display separators at
          // all. inputMode keeps the numeric keypad on touch devices.
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={shown}
          placeholder={placeholder}
          onChange={(e) => {
            const el = e.target
            const typed = el.value
            const digits = significantBefore(typed, el.selectionStart ?? typed.length)
            const formatted = withThousands(typed)
            setText(formatted)

            const numeric = formatted.replace(/,/g, '')
            if (numeric === '') {
              // Empty stays null, so a blank field is distinguishable from a
              // deliberate zero.
              onChange(null)
            } else {
              const n = Number(numeric)
              // A lone "." parses as NaN; hold the previous value until the
              // entry becomes a number again.
              if (Number.isFinite(n)) onChange(n)
            }

            // Reformatting rewrites the whole string, which would otherwise
            // park the caret at the end after every keystroke. Count back to
            // the same digit instead.
            requestAnimationFrame(() => {
              const pos = caretAfter(formatted, digits)
              el.setSelectionRange(pos, pos)
            })
          }}
          onFocus={() => {
            if (returning()) return
            setText('')
          }}
          // Also on click, not only on focus: clicking a field that already
          // has focus does not re-fire it, so correcting a figure you just
          // typed would insert into it instead of replacing it. The cost is
          // that a click cannot place the caret mid-number; on a box this
          // short, retyping is quicker than the editing it gives up.
          onClick={() => setText('')}
          onBlur={() => {
            if (value !== null) {
              const bounded = clamp(value, min, max)
              if (bounded !== value) onChange(bounded)
            }
            setText(null)
          }}
          className={prefix ? 'pl-7' : undefined}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Spells out which figures the rates are applied to, using the first year of
 * retirement. Only rendered once every money field has a value, since the
 * numbers are meaningless before that.
 */
function TaxNote({ inputs }: { inputs: PlanDraft }) {
  const complete = toPlanInputs(inputs)
  const state = findState(inputs.taxState)
  const combined = Math.round((inputs.federalTaxRate + inputs.stateTaxRate) * 10) / 10
  const statusWord =
    FILING_STATUSES.find((f) => f.value === inputs.filingStatus)?.short ?? 'single'

  if (!complete) {
    return (
      <p className="text-xs text-muted-foreground leading-relaxed">
        A combined <span className="font-medium text-foreground">{combined}%</span>{' '}
        applies to withdrawals from your savings. Enter your figures to have the
        rates worked out from a state&apos;s tax brackets.
      </p>
    )
  }

  // The rates above describe the first stretch of retirement. Read the rest
  // from the phases, or the benefit would be reported from a year before it
  // has started.
  const phases = taxPhases(complete, inputs.taxState, inputs.filingStatus)
  const withBenefit = phases.find((p) => p.rates.benefit > 0)
  const rateOf = (p: (typeof phases)[number]) =>
    Math.round((p.rates.federal + p.rates.state) * 10) / 10
  const first = phases[0]
  const changes = phases.length > 1 && first && withBenefit && rateOf(first) !== rateOf(withBenefit)

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">{combined}% combined</span> —{' '}
        {inputs.federalTaxRate}% federal and {inputs.stateTaxRate}%
        {state ? ` ${state.name}` : ' state'}, effective rates from 2026 brackets
        for a {statusWord} filer.
        {changes ? (
          <>
            {' '}
            That covers ages {first.fromAge}–{first.toAge}; from{' '}
            {withBenefit.fromAge} it becomes{' '}
            <span className="font-medium text-foreground">
              {rateOf(withBenefit)}%
            </span>
            , and the projection applies each to its own years.
          </>
        ) : null}
      </p>
      {withBenefit && (
        <p>
          <span className="font-medium text-foreground">
            {Math.round(withBenefit.rates.taxableShare * 100)}%
          </span>{' '}
          of your {formatCurrency(withBenefit.rates.benefit)} benefit counts as
          ordinary income federally once it starts.
          {state
            ? state.taxesSocialSecurity
              ? ` ${state.name} taxes it too.`
              : ` ${state.name} does not tax it.`
            : ''}
        </p>
      )}
      <p>
        The <span className="font-medium text-foreground">Tax tab</span> breaks this
        down stretch by stretch.
      </p>
    </div>
  )
}

/**
 * What the spending figure actually costs the portfolio.
 *
 * Spending is entered net — it is what you keep — so the withdrawal funding it
 * is larger by the tax on it. Against the 4% rule, which is a rule about the
 * withdrawal rather than about spending, that gap is easy to miss: $8,000 a
 * month at a 17% rate is not a 4% plan but closer to 4.8%.
 */
/**
 * The spouse's half of the household benefit.
 *
 * Held as their own benefit rather than as the spousal amount, because deemed
 * filing pays the larger of the two and never both: a spouse whose own record
 * beats half the worker's gets nothing from the spousal rules, and a field
 * holding "the spousal benefit" could not express that.
 */
function SpouseBenefit({
  inputs,
  set,
}: {
  inputs: PlanDraft
  set: <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => void
}) {
  const workerFull = inputs.socialSecurityMonthly ?? 0
  const spousalStart = Math.max(inputs.spouseClaimAge, inputs.socialSecurityAge)
  const { own, spousal, paid } = spouseMonthlyBenefit(
    workerFull,
    inputs.spouseBenefitMonthly,
    inputs.spouseClaimAge,
    spousalStart,
  )
  const money = (v: number) => formatCurrency(Math.round(v))
  const married = inputs.filingStatus === 'married'
  const unanswered = married && inputs.spouseBenefitMonthly === 0 && workerFull > 0
  const waits = spousalStart > inputs.spouseClaimAge && spousal > own
  // A single filer has no spousal share, so the fields themselves would only
  // mislead — but hiding them silently left no way to find out they exist,
  // since the switch that reveals them lives in Taxes at the foot of the page.
  if (!married) {
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground text-pretty leading-relaxed">
          Married? A spouse can claim up to half your benefit at{' '}
          {FULL_RETIREMENT_AGE}, even with no record of their own
          {workerFull > 0 ? (
            <>
              {' '}— worth{' '}
              <span className="font-medium text-foreground">
                {money(workerFull * SPOUSAL_SHARE)}
              </span>{' '}
              a month here
            </>
          ) : null}
          .
        </p>
        <button
          type="button"
          onClick={() => set('filingStatus', 'married')}
          className="w-fit text-xs font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
        >
          Add a spouse — also sets your filing status to married filing jointly
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      {/* Asked rather than answered for them: filing jointly gets the joint
          brackets whether or not a second benefit was entered, so a zero here
          is more likely an unanswered question than an answer.

          The figure is shown rather than written into the box above, because
          that box means "their own record" and the two reduce on different
          schedules — putting the spousal amount in it and then claiming at 62
          would pay it down the worker's gentler curve and overstate it. */}
      {unanswered && (
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-foreground text-pretty leading-relaxed">
          You are filing jointly — does your spouse have a benefit of their own?
          If not, the plan already pays them the{' '}
          <span className="font-medium">{money(spousal)}</span> spousal share,
          which is what it is assuming. If they do, enter it below and the larger
          of the two applies.
        </p>
      )}

      <NumberField
        id="spouseBenefitMonthly"
        label="Spouse's monthly benefit at 67 (today's $)"
        value={inputs.spouseBenefitMonthly}
        min={0}
        max={100000}
        step={100}
        prefix="$"
        hint="Their own record. Leave at 0 if they have none — they are paid the spousal share instead."
        onChange={(v) => set('spouseBenefitMonthly', v ?? 0)}
      />
      <SliderField
        id="spouseClaimAge"
        label="Age spouse claims"
        value={inputs.spouseClaimAge}
        min={SS_AGE_MIN}
        max={SS_AGE_MAX}
        step={1}
        onChange={(v) => set('spouseClaimAge', v)}
      />

      {paid > 0 && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {own >= spousal && own > 0 ? (
            <>
              Their own {money(own)} a month beats the {money(spousal)} spousal
              share, and only the larger of the two is paid.
            </>
          ) : (
            <>
              The spousal share pays {money(spousal)} a month — half your benefit
              at {FULL_RETIREMENT_AGE}
              {spousalStart < FULL_RETIREMENT_AGE
                ? `, cut to ${Math.round(spousalFactor(spousalStart) * SPOUSAL_SHARE * 100)}% of it for claiming at ${spousalStart}`
                : ''}
              . Waiting past {FULL_RETIREMENT_AGE} adds nothing to it: delayed
              credits raise your own benefit only.
            </>
          )}{' '}
          {waits && (
            <>
              It cannot start until you claim, so they get nothing until{' '}
              {spousalStart} however early they file.{' '}
            </>
          )}
          Household benefit{' '}
          <span className="font-medium text-foreground">
            {money((workerFull * benefitFactor(inputs.socialSecurityAge) + paid) * 12)}
          </span>{' '}
          a year. Whichever of you lives longer keeps only the larger benefit, so
          it would fall to{' '}
          {money(
            Math.max(workerFull * benefitFactor(inputs.socialSecurityAge), paid) * 12,
          )}{' '}
          — and they would file single from then on, on half the brackets. The
          projection does not model either yet.
        </p>
      )}
    </div>
  )
}

/**
 * Which account the money comes out of, and what that costs.
 *
 * The order is fixed but the answer is not: each pot empties in turn, so the
 * tax on a withdrawal changes at ages the plan never asked about. Naming those
 * ages is the point — a jump from a few hundred dollars to several thousand
 * arrives without warning otherwise.
 */
function AccountTaxNote({
  plan,
  inputs,
}: {
  plan: ReturnType<typeof simulate>
  inputs: PlanInputs
}) {
  const years = plan.rows.filter((r) => r.phase === 'retirement')
  if (years.length === 0) return null
  const money = (v: number) => formatCurrency(Math.round(v))

  // The first year a pot supplies most of the withdrawal, not the first year
  // it is touched at all. A pot's opening year is usually a few hundred
  // dollars topping up the one before it, and quoting the tax on that says
  // nothing about what the switch costs.
  const takesOver = (pick: (r: YearRow) => number) =>
    years.find((r) => r.withdrawals > 0 && pick(r) > r.withdrawals / 2)
  const brokerageYear = takesOver((r) => r.fromBrokerage)
  const deferredYear = takesOver((r) => r.fromDeferred)
  const rothYear = takesOver((r) => r.fromRoth)

  const parts: React.ReactNode[] = []
  if (brokerageYear) {
    parts.push(
      <span key="b">
        From {brokerageYear.age} it comes out of the brokerage account, where only
        the {inputs.brokerageGainShare}% that is gain is taxed and at
        capital-gains rates —{' '}
        {brokerageYear.taxes < 1
          ? 'nothing at all on this income'
          : `${money(brokerageYear.taxes)} that year`}
        .
      </span>,
    )
  }
  if (deferredYear) {
    parts.push(
      <span key="d">
        {' '}
        {brokerageYear
          ? `From ${deferredYear.age} that is spent and the money comes from the 401(k) and IRA, where every dollar is ordinary income and drags more of your Social Security into tax with it`
          : `From ${deferredYear.age} it comes out of the 401(k) and IRA, where every dollar is ordinary income`}{' '}
        —{' '}
        {brokerageYear && brokerageYear.taxes < deferredYear.taxes ? (
          <>
            tax goes from {money(brokerageYear.taxes)} to{' '}
            <span className="font-medium text-foreground">
              {money(deferredYear.taxes)}
            </span>
          </>
        ) : (
          `${money(deferredYear.taxes)} that year`
        )}
        .
      </span>,
    )
  }
  if (rothYear) {
    parts.push(
      <span key="r">
        {' '}
        {parts.length > 0
          ? `From ${rothYear.age} what is left is Roth, and nothing is owed on it.`
          : `From ${rothYear.age} it comes out of the Roth, and nothing is owed on it at all.`}
      </span>,
    )
  }
  if (parts.length === 0) return null

  const retireAge = Math.max(inputs.retirementAge, inputs.currentAge)
  const startRmd = rmdAge(inputs.currentAge, plan.rows[0]?.year ?? new Date().getFullYear())
  const deferredLeft = years.some((r) => r.age >= startRmd && r.fromDeferred > 0)

  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      {parts}{' '}
      {retireAge < 60 && (deferredYear?.age ?? 99) < 60 && (
        <>
          Drawing on a 401(k) or IRA before 59½ costs another 10% on top, and
          the projection charges it — those years are grossed up to cover it,
          so they use more of the balance than the ones after.{' '}
        </>
      )}
      {deferredLeft && (
        <>
          Required minimum distributions start at {startRmd} for someone born
          when you were: from then on a rising share of the 401(k) comes out
          and is taxed whether the spending calls for it or not, and anything
          above what you need moves to the brokerage account.
        </>
      )}
    </p>
  )
}

/**
 * Spending that changes with age.
 *
 * Thirty years of one figure is the assumption nobody actually holds. Two
 * steps carry the shape people describe: more early while they are still
 * travelling, less once they slow down, often more again late when care
 * arrives. Left at 100% they change nothing at all.
 */
function SpendingSteps({
  inputs,
  set,
  setMany,
}: {
  inputs: PlanDraft
  set: <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => void
  setMany: (patch: Partial<PlanDraft>) => void
}) {
  const base = inputs.monthlyRetirementSpending
  const money = (v: number) => formatCurrency(Math.round(v))
  const on = inputs.spendingStep1Monthly > 0 || inputs.spendingStep2Monthly > 0
  const from = Math.max(inputs.retirementAge, inputs.currentAge)

  // The shape most retirement spending studies find: a fall through the slower
  // years, then part of it back when health costs arrive. Needs a base figure
  // to take a fraction of, so it only offers itself once there is one.
  const applySmile = () =>
    base !== null &&
    setMany({
      spendingStep1Age: Math.max(from + 1, 75),
      spendingStep1Monthly: Math.round(base * 0.85),
      spendingStep2Age: Math.max(from + 2, 85),
      spendingStep2Monthly: Math.round(base * 0.95),
    })

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm text-muted-foreground">Spending as you age</span>
        <button
          type="button"
          onClick={
            on
              ? () => setMany({ spendingStep1Monthly: 0, spendingStep2Monthly: 0 })
              : applySmile
          }
          className="text-xs font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
        >
          {on ? 'Keep it level instead' : 'Use the usual shape'}
        </button>
      </div>

      <SliderField
        id="spendingStep1Age"
        label="Changes at"
        value={inputs.spendingStep1Age}
        min={AGE_MIN}
        max={AGE_MAX}
        step={1}
        onChange={(v) => set('spendingStep1Age', v)}
      />
      <NumberField
        id="spendingStep1Monthly"
        label="Spend this a month instead"
        value={inputs.spendingStep1Monthly}
        min={0}
        max={100000}
        step={100}
        prefix="$"
        placeholder="0 for no change"
        onChange={(v) => set('spendingStep1Monthly', v ?? 0)}
      />
      <SliderField
        id="spendingStep2Age"
        label="Changes again at"
        value={inputs.spendingStep2Age}
        min={AGE_MIN}
        max={AGE_MAX}
        step={1}
        onChange={(v) => set('spendingStep2Age', v)}
      />
      <NumberField
        id="spendingStep2Monthly"
        label="Then this a month"
        value={inputs.spendingStep2Monthly}
        min={0}
        max={100000}
        step={100}
        prefix="$"
        placeholder="0 for no change"
        onChange={(v) => set('spendingStep2Monthly', v ?? 0)}
      />

      <p className="text-xs text-muted-foreground leading-relaxed">
        {!on ? (
          <>
            Both are at nothing, so spending holds level for the whole plan.
            Enter an amount to spend more, or less, from that age.
          </>
        ) : base === null ? (
          <>Enter a monthly figure above and the steps apply from these ages.</>
        ) : (
          <>
            {money(base)} a month from {from}
            {[
              { age: inputs.spendingStep1Age, monthly: inputs.spendingStep1Monthly },
              { age: inputs.spendingStep2Age, monthly: inputs.spendingStep2Monthly },
            ]
              .filter((s) => s.monthly > 0)
              .sort((a, b) => a.age - b.age)
              .map((s) => `, ${money(s.monthly)} from ${s.age}`)
              .join('')}
            . Today&apos;s dollars, so each figure holds its own buying power
            from there.
          </>
        )}
      </p>
    </div>
  )
}

/**
 * What the split is for: the tax on a dollar depends on which account it comes
 * out of, and the order they are drawn in decides how much of that tax gets
 * paid at all.
 */
function AccountNote({ inputs }: { inputs: PlanDraft }) {
  const brokerage = inputs.brokerageBalance ?? 0
  const deferred = (inputs.balance401k ?? 0) + (inputs.traditionalIraBalance ?? 0)
  const roth = inputs.rothIraBalance ?? 0
  const total = brokerage + deferred + roth
  const startRmd = rmdAge(inputs.currentAge, new Date().getFullYear())
  const contributing = (inputs.monthlyContribution ?? 0) > 0
  if (total <= 0) return null
  const pct = (v: number) => Math.round((v / total) * 100)

  // In the order they are drawn, and only the ones holding anything. A plan
  // with one account has no order to explain and no mix to report, so it is
  // told what its own account costs and nothing else.
  const pots = [
    {
      amount: brokerage,
      name: 'the brokerage account',
      label: 'Brokerage',
      treatment: (
        <>
          you are taxed only on the growth, not on what you put in — that is the{' '}
          {inputs.brokerageGainShare}% above — and at the lower rate for things
          held over a year, which starts at nothing
        </>
      ),
    },
    {
      amount: deferred,
      name: 'the 401(k) and IRA',
      label: '401(k) and traditional IRA',
      treatment: (
        <>
          every dollar counts as income at your normal rate, and it can pull
          more of your Social Security into tax behind it
        </>
      ),
    },
    {
      amount: roth,
      name: 'the Roth',
      label: 'Roth',
      treatment: <>you owe nothing on it at all</>,
    },
  ].filter((p) => p.amount > 0)

  const ages = deferred > 0 && (
    <p>
      Two ages matter. Take money out of a 401(k) or IRA before you turn
      59&frac12; and there is normally a 10% penalty on top of the usual tax.
      And from {startRmd} the rules start forcing money out of those accounts
      every year whether you need it or not — a required minimum distribution —
      taxed like any other withdrawal.
    </p>
  )

  const contribution = contributing && (
    <>
      {' '}
      The monthly contribution below is added to the 401(k), so it will be taxed
      as income when it comes back out.
    </>
  )

  if (pots.length === 1) {
    const only = pots[0]
    // Contributions build a 401(k) even when there is not one yet, so a plan
    // holding only a brokerage or only a Roth today will have two pots by the
    // time it is drawing on them — and "taxed the same way" would be wrong.
    const buildsDeferred = contributing && deferred === 0
    return (
      <div className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
        {buildsDeferred ? (
          <p>
            Everything saved so far is in {only.name}, where {only.treatment}.
            The monthly contribution below goes into a 401(k) instead, and every
            dollar of that counts as income at your normal rate on the way out —
            so by retirement there are two pots taxed differently. The 401(k) is
            spent {only.name === 'the brokerage account' ? 'after' : 'before'}{' '}
            {only.name}.
          </p>
        ) : (
          <p>
            All of it is in {only.name}, so every withdrawal is taxed the same
            way: {only.treatment}.{contribution}
          </p>
        )}
        {ages}
      </div>
    )
  }

  const order =
    pots.length === 2 ? (
      <>
        {pots[0].name} first, then {pots[1].name}
      </>
    ) : (
      <>
        {pots[0].name} first, then {pots[1].name}, and {pots[2].name} last
      </>
    )

  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground leading-relaxed">
      <p>The tax you pay depends on which account the money comes out of.</p>
      <ul className="flex flex-col gap-1.5">
        {pots.map((p) => (
          <li key={p.label} className="flex gap-1.5">
            <span className="shrink-0 text-foreground/50">&mdash;</span>
            <span>
              <span className="font-medium text-foreground">{p.label}</span>{' '}
              &mdash; {p.treatment}.
            </span>
          </li>
        ))}
      </ul>
      <p>
        Savings are spent from {order}, which leaves the money that grows
        untaxed alone the longest. Today{' '}
        {pots
          .map((p) => `${pct(p.amount)}% is in ${p.name}`)
          .reduce((acc, part, i, all) =>
            i === all.length - 1 ? `${acc} and ${part}` : `${acc}, ${part}`,
          )}
        .{contribution}
      </p>
      {ages}
    </div>
  )
}





function WithdrawalNote({
  inputs,
  median,
}: {
  inputs: PlanDraft
  median?: number
}) {
  const complete = toPlanInputs(inputs)
  if (!complete) return null

  const plan = simulate(complete)
  const first = plan.rows.find((r) => r.phase === 'retirement')
  if (!first || plan.balanceAtRetirement <= 0) return null

  const money = (v: number) => formatCurrency(Math.round(v))
  const age = Math.max(complete.retirementAge, complete.currentAge)
  const spending = complete.monthlyRetirementSpending * 12
  // What arrives without a withdrawal. Only counts the sources that have
  // actually started by the first retirement year.
  const covered = first.socialSecurity + first.otherIncome
  const gross = first.withdrawals
  const net = Math.max(0, gross - first.taxes)
  const rate = (gross / (median && median > 0 ? median : plan.balanceAtRetirement)) * 100
  const horizon = Math.max(0, complete.endAge - age)
  // What the percentage is a percentage of. Quoting a rate against a balance
  // the reader has not been shown asks them to take it on trust; the whole
  // point of the figure is that it can be checked.
  const savedToday =
    complete.brokerageBalance +
    complete.balance401k +
    complete.traditionalIraBalance +
    complete.rothIraBalance
  const contributing = complete.monthlyContribution * 12
  const yearsSaving = Math.max(0, complete.retirementAge - complete.currentAge)
  // The middle outcome where there is one; the fixed-return path only until
  // the first simulation has run.
  const pot = median && median > 0 ? median : plan.balanceAtRetirement

  const sources = [
    first.socialSecurity > 0 ? 'Social Security' : null,
    complete.pensionMonthly > 0 && age >= complete.pensionStartAge ? 'your pension' : null,
    complete.otherIncomeMonthly > 0 && age >= complete.otherIncomeStartAge
      ? 'your other income'
      : null,
  ].filter(Boolean) as string[]
  const list =
    sources.length > 1
      ? `${sources.slice(0, -1).join(', ')} and ${sources[sources.length - 1]}`
      : (sources[0] ?? '')
  // "Social Security cover" otherwise, since the list is often one thing.
  const verb = sources.length === 1 ? 'covers' : 'cover'

  // The rule is about the gross draw, so judge the gross draw.
  const verdict =
    rate <= 3.5
      ? 'well inside it'
      : rate <= 4
        ? 'just inside it'
        : rate <= 4.5
          ? 'a little above it'
          : 'well above it'

  return (
    <div className="flex flex-col gap-2">
    <p className="text-xs text-muted-foreground leading-relaxed">
      {yearsSaving > 0 ? (
        <>
          {money(savedToday)} saved
          {contributing > 0 ? <> and {money(contributing)} a year going in</> : null},
          growing for {yearsSaving} {yearsSaving === 1 ? 'year' : 'years'}, comes
          to <span className="font-medium text-foreground">{money(pot)}</span> by{' '}
          {age} in the middle outcome.
        </>
      ) : (
        <>
          <span className="font-medium text-foreground">{money(pot)}</span> saved,
          and the drawing starts now.
        </>
      )}{' '}
      <span className="font-medium text-foreground">{money(spending)}</span> a year to
      spend.{' '}
      {covered <= 0 ? (
        <>All of it has to come from savings.</>
      ) : net <= 0 ? (
        <>
          {list} {verb} all of it, so nothing is needed from savings for the
          spending itself.
        </>
      ) : (
        <>
          {list} {verb} {money(covered)} of it, leaving{' '}
          <span className="font-medium text-foreground">{money(net)}</span> net to come
          from savings.
        </>
      )}{' '}
      {gross > 0 && (
        <>
          {/* Not tax on the withdrawal: the pension and the taxable part of the
              benefit are income too, and their tax has to be funded from
              somewhere. Once they are spent, savings are the only place left. */}
          {net <= 0 ? (
            <>
              Tax on that income is still due though, {money(first.taxes)} of it,
              and savings are the only place left to pay it from — so the gross
              draw is{' '}
            </>
          ) : (
            <>
              The year&apos;s tax comes to {money(first.taxes)},{' '}
              {covered > 0
                ? 'owed on the withdrawal and on the income above alike, and payable from savings either way'
                : 'owed on the withdrawal itself'}{' '}
              — so the gross draw is{' '}
            </>
          )}
          <span className="font-medium text-foreground">{money(gross)}</span>,{' '}
          <span className="font-medium text-foreground">{rate.toFixed(1)}%</span> of
          that {money(pot)}. The 4% rule measures this gross draw rather than what
          you spend, over a 30-year retirement; yours runs {horizon}
          {horizon === 1 ? ' year' : ' years'}, so {rate.toFixed(1)}% sits {verdict}.
        </>
      )}
    </p>
    <AccountTaxNote plan={plan} inputs={complete} />
    </div>
  )
}

/**
 * Refreshes the two rates from the figures, while a state is selected.
 *
 * Done here rather than in an effect so the rates change in the same update
 * as the figure that moved them; editing either rate by hand clears the state
 * and stops this, which is what keeps the override honest.
 */
/**
 * A named, collapsible group of fields. Only the section being edited needs
 * to be open, which is what keeps the column from running several screens
 * long. Uses <details> so it works before hydration and is keyboard- and
 * screen-reader-navigable without any state of its own.
 */
function Section({
  title,
  summary,
  defaultOpen,
  className,
  info,
  children,
}: {
  title: string
  summary: string
  defaultOpen?: boolean
  className?: string
  /** What this section is, opened from a question mark beside the heading. */
  info?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        // No h-fit: as a grid item a tile fills its row, so Saving and
        // Spending come out level with Social Security and Other income stacked.
        // Inside the stacked column they are flex children instead, so those
        // two keep their own heights.
        'group rounded-lg border-2 border-border px-4 [&_summary::-webkit-details-marker]:hidden',
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-left">
        <span className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            {title}
          </span>
          <span className="text-sm text-foreground/70 group-open:hidden">{summary}</span>
        </span>
        {info && (
          // Clicking a <summary> opens the section — that is the default action
          // of the click, not a handler — so the question mark has to cancel it
          // or reading the explanation would collapse what it explains. The
          // button's own handler has already run by the time this fires.
          <span
            className="ml-auto flex shrink-0 items-center"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <InfoTip label={title} className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {info}
            </InfoTip>
          </span>
        )}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  )
}

export function PlanInputsPanel({
  inputs,
  onChange,
  name,
  onNameChange,
  medianAtRetirement,
  personName,
  onPersonNameChange,
  saveButton,
}: {
  inputs: PlanDraft
  onChange: (next: PlanDraft) => void
  name: string
  onNameChange: (next: string) => void
  /**
   * The middle of the simulated runs, from the panel above. Quoted rather than
   * the single fixed-return path, because that path ignores volatility drag
   * and comes out around a fifth high over twenty years — and because the
   * tile below reports the median, so the two would disagree.
   */
  medianAtRetirement?: number
  personName: string
  onPersonNameChange: (next: string) => void
  /** Owned by the planner, which holds the saving state; placed here. */
  saveButton: React.ReactNode
}) {
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    onChange(withDerivedRates({ ...inputs, [key]: value }))

  /**
   * Several fields at once. Calling set() in a loop does not work: each call
   * spreads the draft this render was given, so every write but the last is
   * discarded.
   */
  const setMany = (patch: Partial<PlanDraft>) =>
    onChange(withDerivedRates({ ...inputs, ...patch }))

  /**
   * Ages must stay in order, but equality is allowed throughout: retiring at
   * your current age is a real plan, and so is planning through the year you
   * retire. Changing one age pushes the later ones along rather than refusing
   * the change.
   */
  const setAge = (key: 'currentAge' | 'retirementAge' | 'endAge', value: number) => {
    const next = { ...inputs, [key]: value }
    if (key !== 'endAge') {
      next.retirementAge = Math.max(next.retirementAge, next.currentAge)
    }
    next.endAge = Math.max(next.endAge, next.retirementAge)
    onChange(withDerivedRates(next))
  }

  const money = (v: number | null) =>
    v === null ? '—' : formatCurrency(v)

  return (
    <div className="flex flex-col gap-4">
      {/* Who the plan is for, and what it is called. The name and the button
          that stores it belong to the plan itself, so they live in the plan's
          own tile rather than floating above the panel. Deliberately not
          collapsible: saving should never be a click away behind a closed
          section. */}
      <div className="rounded-lg border-2 border-border px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label
              htmlFor="personName"
              className="text-xs font-bold uppercase tracking-wider text-foreground"
            >
              Personal info
            </Label>
            <ClearingInput
              id="personName"
              value={personName}
              onValueChange={onPersonNameChange}
              placeholder="Your name"
              autoComplete="name"
              maxLength={120}
              // Reads as the heading of the plan until it is clicked, which is
              // the point: this is who the plan is for, not a form field to
              // get past. Never required — the plan works unnamed.
              className="h-auto w-full max-w-sm truncate rounded-md border-transparent bg-transparent px-0 py-0.5 font-serif text-xl font-medium shadow-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-input focus-visible:bg-background focus-visible:px-2 md:text-xl"
            />
          </div>
          {/* The plan's own name sits with the button that stores it, since
              naming a plan and saving it are one action. */}
          {/* Full width on a phone so the field can shrink beside the button
              instead of pushing it off the tile. */}
          <div className="flex w-full items-end gap-2 sm:w-auto">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-none">
              <Label htmlFor="planName" className="text-xs text-muted-foreground">
                Plan name
              </Label>
              <ClearingInput
                id="planName"
                value={name}
                onValueChange={onNameChange}
                placeholder="Name this plan"
                maxLength={120}
                className="h-9 w-full sm:w-44"
              />
            </div>
            {saveButton}
          </div>
        </div>
        <div className="mt-3 grid gap-x-6 gap-y-4 border-t border-border pt-4 md:grid-cols-3">
          <SliderField
            id="currentAge"
            label="Current age"
            value={inputs.currentAge}
            min={AGE_MIN}
            max={AGE_MAX}
            step={1}
            onChange={(v) => setAge('currentAge', v)}
          />
          <SliderField
            id="retirementAge"
            label="Retirement age"
            value={inputs.retirementAge}
            min={AGE_MIN}
            max={AGE_MAX}
            step={1}
            onChange={(v) => setAge('retirementAge', v)}
          />
          <SliderField
            id="endAge"
            label="Plan through age"
            value={inputs.endAge}
            min={AGE_MIN}
            max={AGE_MAX}
            step={1}
            onChange={(v) => setAge('endAge', v)}
          />
        </div>
      </div>

      {/* Social Security and Other income stack into one column: both are
          short, and together they are the income arriving without a
          withdrawal. Taxes is far wider than the rest and takes its own row. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-4">
          <Section
            defaultOpen
            title="Social Security"
            info={
              <>
                <Field name="Monthly benefit at 67">
                  the figure at{' '}
                  <span className="font-medium text-foreground">
                    full retirement age
                  </span>{' '}
                  — 67 for anyone born in 1960 or later — <em>not</em> the amount
                  at the age you plan to claim. The planner applies the
                  reduction or the increase itself, so entering the age-70
                  figure here would count the increase twice.
                </Field>
                <Field name="Where to find it">
                  sign in at ssa.gov/myaccount and open your Social Security
                  Statement. It shows estimates at 62, at full retirement age
                  and at 70. Use the middle one.
                </Field>
                <Field name="Age you claim">
                  anywhere from 62 to 70. Claiming at 62 pays about 70% of the
                  full amount for life; waiting to 70 pays about 124%. The Tax
                  tab and the summary both compare the ages for you.
                </Field>
                <Field name="Annual COLA">
                  the cost-of-living adjustment — the rise Social Security
                  applies each year to keep the benefit up with prices. Entered
                  separately from your inflation rate because the two differ in
                  practice, and where they do the benefit slowly gains or loses
                  ground in real terms.
                </Field>
                <Field name="Spouse's benefit and claim age">
                  their own record, on their own timeline. Leave the amount at
                  zero for a spouse with no record of their own — they are then
                  paid the spousal share, which cannot start until you have
                  filed.
                </Field>
              </>
            }
            summary={
              inputs.socialSecurityMonthly === null
                ? 'Not entered'
                : inputs.socialSecurityMonthly === 0
                  ? 'None expected'
                  : `${money(inputs.socialSecurityMonthly)} a month from ${inputs.socialSecurityAge}`
            }
          >
            <div className="flex flex-col gap-4">
            <NumberField
              id="socialSecurityMonthly"
              label="Monthly benefit at 67 (today's $)"
              value={inputs.socialSecurityMonthly}
              min={0}
              max={20000}
              step={100}
              prefix="$"
              placeholder="e.g. 2,000 — enter 0 if none"
              onChange={(v) => set('socialSecurityMonthly', v)}
            />
            <SliderField
              id="socialSecurityAge"
              label="Age you claim"
              value={inputs.socialSecurityAge}
              min={SS_AGE_MIN}
              max={SS_AGE_MAX}
              step={1}
              onChange={(v) => set('socialSecurityAge', v)}
            />
            <SliderField
              id="socialSecurityCola"
              label="Annual COLA"
              value={inputs.socialSecurityCola}
              min={0}
              max={8}
              step={0.1}
              suffix="%"
              onChange={(v) => set('socialSecurityCola', v)}
            />
            <SpouseBenefit inputs={inputs} set={set} />
            {inputs.socialSecurityMonthly !== null && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Claiming at {inputs.socialSecurityAge} pays{' '}
                <span className="font-medium text-foreground">
                  {benefitFactorLabel(inputs.socialSecurityAge)}
                </span>{' '}
                of the amount due at 67
                {inputs.socialSecurityMonthly > 0
                  ? ` — ${formatCurrency(
                      Math.round(inputs.socialSecurityMonthly * benefitFactor(inputs.socialSecurityAge)),
                    )} a month.`
                  : '.'}{' '}
                {inputs.socialSecurityCola === inputs.inflationRate
                  ? 'Matching your inflation rate, so the benefit holds its value.'
                  : inputs.socialSecurityCola > inputs.inflationRate
                    ? `Above your ${inputs.inflationRate}% inflation rate, so the benefit gains a little purchasing power each year.`
                    : `Below your ${inputs.inflationRate}% inflation rate, so the benefit loses purchasing power each year.`}{' '}
                The 2026 adjustment was 2.8%; the past decade averaged 3.1%.
              </p>
            )}
            </div>
          </Section>

          <Section
            defaultOpen
            title="Other income"
            info={
              <>
                <p>
                  Money arriving in retirement that is neither Social Security
                  nor drawn from savings. Every dollar of it is a dollar the
                  accounts do not have to cover.
                </p>
                <Field name="Monthly pension">
                  in today&apos;s money, like everything else here. Zero if you
                  have none.
                </Field>
                <Field name="Pension COLA">
                  the cost-of-living adjustment on that pension — and most
                  private ones have{' '}
                  <span className="font-medium text-foreground">none</span>,
                  which is why it defaults to zero. A pension that never rises
                  loses roughly a third of its buying power over twenty years at
                  2.5% inflation, so this field matters more than it looks.
                </Field>
                <Field name="Other monthly income">
                  rent, an annuity, part-time work — anything steady. Assumed to
                  keep pace with inflation, so it holds its value.
                </Field>
                <Field name="Starts at">
                  the age each one begins. A pension that starts later than you
                  retire leaves a gap the savings have to bridge, which is often
                  the most expensive stretch of a plan.
                </Field>
                <p>
                  All of it is ordinary income for tax, and it counts towards
                  how much of your Social Security becomes taxable.
                </p>
              </>
            }
            summary={
              inputs.pensionMonthly === 0 && inputs.otherIncomeMonthly === 0
                ? 'None'
                : [
                    inputs.pensionMonthly > 0
                      ? `${money(inputs.pensionMonthly)} pension`
                      : null,
                    inputs.otherIncomeMonthly > 0
                      ? `${money(inputs.otherIncomeMonthly)} other`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(', ')
            }
          >
            <div className="flex flex-col gap-4">
              <NumberField
                id="pensionMonthly"
                label="Monthly pension (today's $)"
                value={inputs.pensionMonthly}
                min={0}
                max={100000}
                step={100}
                prefix="$"
                placeholder="0 if none"
                onChange={(v) => set('pensionMonthly', v ?? 0)}
              />
              <SliderField
                id="pensionStartAge"
                label="Pension starts at"
                value={inputs.pensionStartAge}
                min={AGE_MIN}
                max={AGE_MAX}
                step={1}
                onChange={(v) => set('pensionStartAge', v)}
              />
              <SliderField
                id="pensionCola"
                label="Pension COLA"
                value={inputs.pensionCola}
                min={0}
                max={8}
                step={0.1}
                suffix="%"
                onChange={(v) => set('pensionCola', v)}
              />
              <NumberField
                id="otherIncomeMonthly"
                label="Other monthly income (today's $)"
                value={inputs.otherIncomeMonthly}
                min={0}
                max={100000}
                step={100}
                prefix="$"
                hint="Rental income, an annuity, part-time work, a trust."
                onChange={(v) => set('otherIncomeMonthly', v ?? 0)}
              />
              <SliderField
                id="otherIncomeStartAge"
                label="Other income starts at"
                value={inputs.otherIncomeStartAge}
                min={AGE_MIN}
                max={AGE_MAX}
                step={1}
                onChange={(v) => set('otherIncomeStartAge', v)}
              />
              {inputs.pensionMonthly > 0 && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {inputs.pensionCola === 0
                    ? 'With no adjustment a pension buys less every year, which is how most private ones work.'
                    : `Rising ${inputs.pensionCola}% a year against ${inputs.inflationRate}% inflation.`}{' '}
                  Both count as ordinary income, and both push more of your Social
                  Security into tax.
                </p>
              )}
            </div>
          </Section>
        </div>

        <Section
          defaultOpen
          title="Saving"
          info={
            <>
              <p>
                What you have now, split by how it will be taxed when it comes
                out — which is the single thing that decides what a dollar of
                spending actually costs you.
              </p>
              <Field name="Brokerage account">
                an ordinary investment account, taxed as you go. The plan spends
                it first, because most of it has already been taxed once.
              </Field>
              <Field name="…of which is gain">
                how much of that balance is profit rather than money you put in.
                When you sell, only the profit is taxed — and at lower
                capital-gains rates, sometimes at nothing. A $200,000 account you
                paid $120,000 for is 40% gain. Your brokerage shows this as{' '}
                <span className="font-medium text-foreground">cost basis</span>{' '}
                or unrealised gain; if you have no idea, 40% is a fair guess for
                a long-held account.
              </Field>
              <Field name="401(k) and Traditional IRA">
                never taxed yet, so every dollar out is ordinary income. These
                are also the accounts the government eventually forces you to
                empty.
              </Field>
              <Field name="Roth IRA">
                already taxed, so nothing more is ever owed on it. The plan
                spends it last, and nothing is forced out of it.
              </Field>
              <Field name="Monthly contribution">
                what you add between now and retiring. It goes into the 401(k),
                which is where most payroll saving lands.
              </Field>
              <Field name="HSA balance and monthly">
                the only account taxed at neither end: it goes in untaxed,
                grows untaxed, and comes out untaxed when it pays for care.
                Nothing is ever forced out of it, so the plan spends it before
                the Roth on the assumption that medical costs are what it will
                meet. Leave both at zero if you have none. Contributions stop at
                65, when Medicare starts.
              </Field>
              <Field name="Annual salary">
                only used to work out the employer match — a match is a share
                of pay up to a limit, so the pay has to be known. Leave it at
                zero and no match is assumed rather than guessed.
              </Field>
              <Field name="Employer matches / up to this much of salary">
                the two halves of a match. &ldquo;50% up to 6%&rdquo; means your
                employer adds 50 cents for every dollar you put in, on the first
                6% of your salary. Contributing past that line earns nothing
                more; contributing under it leaves money behind, and the
                insights below will say how much.
              </Field>
              <Field name="Return while saving (nominal)">
                the growth you assume, <em>before</em> inflation is taken off —
                which is how returns are normally quoted. Inflation is entered
                separately and subtracted, so 7% here against 2.5% inflation is
                about 4.4% of real growth.
              </Field>
              <Field name="Volatility">
                how much those returns swing from year to year. It does not
                change the average; it decides how wide the range of outcomes
                is, and so how often the plan survives a bad decade.
              </Field>
            </>
          }
          summary={`${money(
            [
              inputs.brokerageBalance,
              inputs.balance401k,
              inputs.traditionalIraBalance,
              inputs.rothIraBalance,
            ].every((b) => b === null)
              ? null
              : (inputs.brokerageBalance ?? 0) +
                  (inputs.balance401k ?? 0) +
                  (inputs.traditionalIraBalance ?? 0) +
                  (inputs.rothIraBalance ?? 0),
          )} saved, ${money(inputs.monthlyContribution)} a month`}
        >
          <div className="flex flex-col gap-4">
          <NumberField
            id="brokerageBalance"
            label="Brokerage account"
            value={inputs.brokerageBalance}
            min={0}
            max={100000000}
            step={1000}
            prefix="$"
            placeholder="e.g. 25,000"
            onChange={(v) => set('brokerageBalance', v)}
          />
          <SliderField
            id="brokerageGainShare"
            label="…of which is gain"
            value={inputs.brokerageGainShare}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(v) => set('brokerageGainShare', v)}
          />
          <NumberField
            id="balance401k"
            label="401(k)"
            value={inputs.balance401k}
            min={0}
            max={100000000}
            step={1000}
            prefix="$"
            placeholder="e.g. 100,000"
            onChange={(v) => set('balance401k', v)}
          />
          <NumberField
            id="traditionalIraBalance"
            label="Traditional IRA"
            value={inputs.traditionalIraBalance}
            min={0}
            max={100000000}
            step={1000}
            prefix="$"
            placeholder="e.g. 50,000"
            onChange={(v) => set('traditionalIraBalance', v)}
          />
          <NumberField
            id="rothIraBalance"
            label="Roth IRA"
            value={inputs.rothIraBalance}
            min={0}
            max={100000000}
            step={1000}
            prefix="$"
            placeholder="e.g. 40,000"
            onChange={(v) => set('rothIraBalance', v)}
          />
          <AccountNote inputs={inputs} />
          <NumberField
            id="monthlyContribution"
            label="Monthly contribution"
            value={inputs.monthlyContribution}
            min={0}
            max={100000}
            step={50}
            prefix="$"
            placeholder="e.g. 800"
            onChange={(v) => set('monthlyContribution', v)}
          />
          {/* Optional, and grouped after the contribution they modify. A plan
              that says nothing here behaves exactly as it did before they
              existed: no salary means no match, and no HSA means no fourth
              pot. */}
          <NumberField
            id="hsaBalance"
            label="HSA balance"
            value={inputs.hsaBalance}
            min={0}
            max={100000000}
            step={1000}
            prefix="$"
            placeholder="Optional"
            onChange={(v) => set('hsaBalance', v ?? 0)}
          />
          <NumberField
            id="hsaMonthlyContribution"
            label="Monthly into the HSA"
            value={inputs.hsaMonthlyContribution}
            min={0}
            max={10000}
            step={25}
            prefix="$"
            placeholder="Optional"
            onChange={(v) => set('hsaMonthlyContribution', v ?? 0)}
          />
          <NumberField
            id="annualSalary"
            label="Annual salary"
            value={inputs.annualSalary}
            min={0}
            max={100000000}
            step={1000}
            prefix="$"
            placeholder="Optional, for the match"
            onChange={(v) => set('annualSalary', v ?? 0)}
          />
          <SliderField
            id="employerMatchPercent"
            label="Employer matches"
            value={inputs.employerMatchPercent}
            min={0}
            max={100}
            step={5}
            suffix="%"
            onChange={(v) => set('employerMatchPercent', v)}
          />
          <SliderField
            id="employerMatchLimitPercent"
            label="…up to this much of salary"
            value={inputs.employerMatchLimitPercent}
            min={0}
            max={25}
            step={0.5}
            suffix="%"
            onChange={(v) => set('employerMatchLimitPercent', v)}
          />
          <SliderField
            id="preRetirementReturn"
            label="Return while saving (nominal)"
            value={inputs.preRetirementReturn}
            min={0}
            max={12}
            step={0.1}
            suffix="%"
            onChange={(v) => set('preRetirementReturn', v)}
          />
          <SliderField
            id="preRetirementVolatility"
            label="Volatility while saving"
            value={inputs.preRetirementVolatility}
            min={0}
            max={30}
            step={0.5}
            suffix="%"
            onChange={(v) => set('preRetirementVolatility', v)}
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            How much your returns rise and fall from year to year. About 15% for a
            mostly-stocks portfolio, or 10% for a balanced one. A higher number does
            not change your average return — it just makes the result less
            predictable.
          </p>
          </div>
        </Section>

        <Section
          defaultOpen
          title="Spending"
          info={
            <>
              <Field name="Monthly spending in retirement">
                what that life costs at{' '}
                <span className="font-medium text-foreground">
                  today&apos;s prices
                </span>
                . Do not inflate it yourself for a future decade — the planner
                does that. This is spending, not withdrawals: it works out how
                much has to leave the accounts to leave you this much after tax.
              </Field>
              <Field name="Spending as you age">
                two optional steps, because spending rarely holds flat for
                thirty years. The usual shape is more early on while you are
                travelling, less once things slow down, and more again late when
                care arrives.
              </Field>
              <Field name="Changes at / Spend this a month instead">
                the age the first step takes effect, and the new monthly figure
                from then on — again in today&apos;s money. It replaces the
                figure above rather than adding to it.
              </Field>
              <Field name="Changes again at / Then this a month">
                the same for a second step later on. Leave either at zero for no
                step at all, which is the default.
              </Field>
              <Field name="Return in retirement (nominal)">
                growth before inflation, once you have stopped working. Most
                people hold something steadier than they did while saving.
              </Field>
              <Field name="Inflation rate">
                how fast prices rise. Everything on the page is shown in
                today&apos;s money, so this is what converts your figures into
                the dollars of each year and back again.
              </Field>
            </>
          }
          summary={`${money(inputs.monthlyRetirementSpending)} a month in retirement`}
        >
          <div className="flex flex-col gap-4">
          <NumberField
            id="monthlyRetirementSpending"
            label="Monthly spending in retirement (today's $)"
            value={inputs.monthlyRetirementSpending}
            min={0}
            max={100000}
            step={100}
            prefix="$"
            placeholder="e.g. 4,000"
            onChange={(v) => set('monthlyRetirementSpending', v)}
          />
          {/* For anyone who knows what their life costs but not the total. */}
          <ExpenseEstimator
            onApply={(monthly) => set('monthlyRetirementSpending', monthly)}
          />
          <WithdrawalNote inputs={inputs} median={medianAtRetirement} />
          <SpendingSteps inputs={inputs} set={set} setMany={setMany} />
          <SliderField
            id="postRetirementReturn"
            label="Return in retirement (nominal)"
            value={inputs.postRetirementReturn}
            min={0}
            max={10}
            step={0.1}
            suffix="%"
            onChange={(v) => set('postRetirementReturn', v)}
          />
          <SliderField
            id="postRetirementVolatility"
            label="Volatility in retirement"
            value={inputs.postRetirementVolatility}
            min={0}
            max={30}
            step={0.5}
            suffix="%"
            onChange={(v) => set('postRetirementVolatility', v)}
          />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Usually lower than while you are working, because most people move to
            safer investments in retirement — about 8%. It matters more here,
            because a bad year hits while you are taking money out.
          </p>
          <SliderField
            id="inflationRate"
            label="Inflation rate"
            value={inputs.inflationRate}
            min={0}
            max={8}
            step={0.1}
            suffix="%"
            onChange={(v) => set('inflationRate', v)}
          />
          </div>
        </Section>
      </div>

      <Section
        defaultOpen
        title="Taxes"
        info={
          <>
            <Field name="State">
              pick one and the planner works the rates out from the real
              brackets, year by year — federal and state, including how much of
              your Social Security becomes taxable and what your capital gains
              cost.
            </Field>
            <Field name="Filing status">
              matters more than people expect. Married brackets are roughly
              twice as wide, and so are the thresholds for Medicare surcharges
              and for the health-insurance subsidy before 65.
            </Field>
            <Field name="Federal and state tax rate">
              only used if you would rather set a flat rate by hand than have it
              derived. It is treated as one levy on withdrawals, so it cannot
              tell one account from another and the Tax tab has less to show
              you.
            </Field>
            <Field name="What state tax leaves out">
              a state is priced from its brackets and standard deduction only.
              Credits and exemptions aimed at retirees — low-income credits,
              age-based exclusions, deductions on pension income — are not
              counted, so the state figures err high, and highest for the
              lowest incomes. Federal tax, the bigger number, is unaffected.
            </Field>
            <p>
              The rates shown are{' '}
              <span className="font-medium text-foreground">effective</span>, not
              your top bracket: tax owed divided by the whole withdrawal. The
              standard deduction and the lower bands are taxed first, so a plan
              showing 12% can easily be one whose top bracket is 22%.
            </p>
          </>
        }
        summary={`${
          Math.round((inputs.federalTaxRate + inputs.stateTaxRate) * 10) / 10
        }% combined${findState(inputs.taxState) ? `, ${findState(inputs.taxState)!.name}` : ''}`}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="filingStatus" className="text-sm text-muted-foreground">
            Filing status
          </Label>
          <select
            id="filingStatus"
            value={inputs.filingStatus}
            onChange={(e) =>
              onChange(
                withDerivedRates({
                  ...inputs,
                  filingStatus: e.target.value as PlanDraft['filingStatus'],
                }),
              )
            }
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none"
          >
            {FILING_STATUSES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <SliderField
          id="federalTaxRate"
          label="Federal tax rate"
          value={inputs.federalTaxRate}
          min={0}
          max={FEDERAL_MAX}
          step={0.5}
          suffix="%"
          onChange={(v) =>
            onChange({ ...inputs, federalTaxRate: v, taxState: CUSTOM_RATES })
          }
        />
        </div>

        <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="taxState" className="text-sm text-muted-foreground">
            State
          </Label>
          <select
            id="taxState"
            value={inputs.taxState}
            onChange={(e) =>
              // Picking a state derives both rates from the figures entered.
              // Either slider can still override, which drops back to Custom.
              onChange(withDerivedRates({ ...inputs, taxState: e.target.value }))
            }
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-ring focus:outline-none"
          >
            <option value="">No state income tax</option>
            <option value={CUSTOM_RATES}>Rates I set myself</option>
            {STATE_TAXES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.name}
                {st.note ? ` — ${st.note}` : ''}
              </option>
            ))}
          </select>
        </div>
        <SliderField
          id="stateTaxRate"
          label="State tax rate"
          value={inputs.stateTaxRate}
          min={0}
          max={STATE_MAX}
          step={0.5}
          suffix="%"
          onChange={(v) =>
            // Hand-editing the rate detaches it from the chosen state rather
            // than leaving a state named beside a rate it does not have.
            onChange({ ...inputs, stateTaxRate: v, taxState: CUSTOM_RATES })
          }
        />
        </div>
        <TaxNote inputs={inputs} />
        </div>
      </Section>
    </div>
  )
}
