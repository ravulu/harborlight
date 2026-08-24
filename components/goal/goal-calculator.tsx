'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarClock, Coins, PiggyBank, TrendingUp } from 'lucide-react'

import { DEFAULT_INPUTS, formatCurrency } from '@/lib/retirement'
import { useSettled } from '@/lib/use-settled'
import {
  caretAfter,
  clamp,
  significantBefore,
  withThousands,
} from '@/lib/number-format'
import { goalInputs, reachGoal, type Lever } from '@/lib/goal'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { InfoTip } from '@/components/planner/info-tip'
import { cn } from '@/lib/utils'
import { record } from '@/lib/usage'

/** What the planner assumes, so the two pages start from the same place. */
const DEFAULT_RETURN = DEFAULT_INPUTS.preRetirementReturn
/**
 * How much a portfolio swings for the return it is expected to make, taken
 * from the planner's own defaults. Return and volatility move together here
 * for the same reason they do in the world.
 */
const RISK_RATIO =
  DEFAULT_INPUTS.preRetirementVolatility / DEFAULT_INPUTS.preRetirementReturn

const money = (v: number) => formatCurrency(Math.round(v))

/**
 * One figure the reader types, kept deliberately few.
 *
 * The same contract as the planner's boxes, and the same helpers behind it, so
 * a person moving between the two pages never has to learn a second set of
 * habits: thousands grouped as you type, and focusing or clicking empties the
 * box rather than selecting it.
 *
 * Emptying rather than selecting matters more than it sounds. A field sitting
 * at 600 that only highlights will merge the next keystroke into whatever the
 * caret happened to land beside — 2000 becoming 20,000 or 02,000 — and the
 * figures here are ones people replace rather than edit.
 */
function Field({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  info,
  min = 0,
  max = 100_000_000,
}: {
  id: string
  label: string
  /** Null while the box is empty, which is how every one of them starts. */
  value: number | null
  onChange: (v: number | null) => void
  prefix?: string
  suffix?: string
  /**
   * Shown in the empty box. Carries the unit for fields whose label has no
   * room for it — focusing empties the box, so this is what a reader sees at
   * the moment they are about to type, and it goes as soon as they do.
   */
  placeholder?: string
  info?: React.ReactNode
  min?: number
  max?: number
}) {
  // Held while editing so a part-typed entry survives reformatting; cleared on
  // blur so the box falls back to the canonical value.
  const [text, setText] = useState<string | null>(null)
  const shown =
    text ?? (value === null || !Number.isFinite(value) ? '' : withThousands(String(value)))

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {info && <InfoTip label={label} className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{info}</InfoTip>}
      </span>
      <span className="flex items-center gap-1.5 rounded-lg border-2 border-border px-3 py-2 focus-within:border-primary">
        {prefix && <span className="text-muted-foreground">{prefix}</span>}
        <input
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
              // Empty stays empty rather than becoming a zero: a blank target
              // is a question not yet asked, and answering it with $0 would
              // put a confident set of routes under an unasked question.
              onChange(null)
            } else {
              const n = Number(numeric)
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
          onFocus={() => setText('')}
          // Also on click: clicking a box that already has focus does not
          // re-fire focus, so correcting a figure you just typed would insert
          // into it rather than replace it.
          onClick={() => setText('')}
          onBlur={() => {
            if (value !== null) {
              const bounded = clamp(value, min, max)
              if (bounded !== value) onChange(bounded)
            }
            setText(null)
          }}
          className="w-full min-w-0 bg-transparent text-lg font-medium tabular-nums text-foreground outline-none placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/70"
        />
        {suffix && <span className="text-muted-foreground">{suffix}</span>}
      </span>
    </label>
  )
}

/** A count with its noun agreeing. */
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`

const LEVERS: Record<
  Lever['kind'],
  {
    title: string
    icon: React.ReactNode
    unit: (v: number) => string
    /**
     * What the answer costs against where the plan already is.
     *
     * The headline figure alone makes a reader do the subtraction — `$4,170 a
     * month` beside `$600 a month now` is two numbers and a sum. The
     * difference is the part they actually weigh, so it is the part that gets
     * said.
     *
     * `lump` is the exception: it is solved as the amount to add, so it is
     * already a difference and only needs saying what it is added to.
     */
    delta: (needed: number, current: number) => string
    note: string
  }
> = {
  save: {
    title: 'Save more each month',
    icon: <PiggyBank className="size-4" />,
    unit: (v) => `${money(v)} a month`,
    delta: (needed, current) => {
      const d = needed - current
      if (Math.abs(d) < 1) return `the same as you save now`
      return d > 0
        ? `${money(d)} a month more than now`
        : `${money(-d)} a month less than now`
    },
    note: 'The lever most within your control, and the one that costs you something every month between now and then.',
  },
  wait: {
    title: 'Give it more years',
    icon: <CalendarClock className="size-4" />,
    unit: (v) => `retire at ${Math.round(v)}`,
    delta: (needed, current) => {
      const d = Math.round(needed) - Math.round(current)
      if (d === 0) return `the age you already chose`
      return d > 0
        ? `${plural(d, 'year', 'years')} later than ${Math.round(current)}`
        : `${plural(-d, 'year', 'years')} sooner than ${Math.round(current)}`
    },
    note: 'The most powerful lever and the only one you cannot buy back later. Every year you wait is a year of growth on everything already saved.',
  },
  lump: {
    title: 'Start with more',
    icon: <Coins className="size-4" />,
    unit: (v) => `${money(v)} today`,
    // Solved as the amount to add, so the figure is the difference already.
    delta: (_needed, current) =>
      current > 0
        ? `on top of the ${money(current)} you have`
        : `paid in before the saving starts`,
    note: 'A windfall, a sale, an old account you had forgotten. Money that arrives today has the whole run to compound.',
  },
  risk: {
    title: 'Take more risk',
    icon: <TrendingUp className="size-4" />,
    unit: (v) => `${v}% a year`,
    delta: (needed, current) => {
      const d = Math.round((needed - current) * 10) / 10
      if (Math.abs(d) < 0.05) return `the rate you already set`
      return d > 0
        ? `${d} points above the ${current}% you set`
        : `${-d} points below the ${current}% you set`
    },
    note: 'The one that looks free and is not. A higher return has to be bought with a portfolio that can fall further, and this page treats it as steady — so it flatters this lever against the other three.',
  },
}

/** One line of the derivation: what it is, and what it comes to. */
function Row({
  label,
  value,
  total,
}: {
  label: string
  value: string
  total?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4',
        total && 'border-t border-border pt-2 font-medium text-foreground',
      )}
    >
      <dt className={cn(!total && 'text-muted-foreground')}>{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  )
}

function LeverCard({
  lever,
  target,
}: {
  lever: Lever
  target: number
}) {
  const meta = LEVERS[lever.kind]
  const unreachable = lever.needed === null
  // A lever with nothing to do says so. "$0 a month" is arithmetically right
  // and reads as an instruction to save nothing.
  const settledAlready = lever.needed === 0

  return (
    <Card className={cn('p-5 gap-3', unreachable && 'border-dashed')}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="text-primary">{meta.icon}</span>
        <span className="text-xs font-medium uppercase tracking-wider">
          {meta.title}
        </span>
      </div>

      {unreachable ? (
        <>
          <p className="text-lg font-semibold text-foreground text-balance">
            Not on its own
          </p>
          <p className="text-xs text-muted-foreground text-pretty">
            Pushed all the way to{' '}
            <span className="font-medium text-foreground">
              {meta.unit(lever.maxValue ?? 0)}
            </span>{' '}
            this still only reaches {money(lever.atMax ?? 0)} — short of the{' '}
            {money(target)} you asked for. It would have to be combined with one
            of the others.
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-semibold tabular-nums text-foreground text-balance">
            {settledAlready ? 'Nothing more' : meta.unit(lever.needed!)}
          </p>
          <p className="text-xs font-medium text-primary">
            {settledAlready
              ? 'this lever is already doing enough'
              : meta.delta(lever.needed!, lever.current)}
          </p>
        </>
      )}

      <p className="mt-auto border-t border-border pt-3 text-xs text-muted-foreground text-pretty">
        {meta.note}
      </p>
    </Card>
  )
}

/**
 * A target, an age, and the four ways to get there.
 *
 * Deliberately not a single answer. There are only four levers to any savings
 * goal — start with more, save more, wait longer, take more risk — and the
 * useful thing is not any one of them but how unequal they are. Ten years of
 * compounding cannot be bought back with any monthly contribution a person
 * could actually make, and seeing all four at once is what makes that obvious.
 */
export function GoalCalculator() {
  /**
   * Empty to begin with, all but the return.
   *
   * A form arriving pre-filled with somebody else's figures answers a question
   * nobody asked, and the answer under it looks like a finding rather than a
   * demonstration. The return keeps a default because it is an assumption
   * rather than a fact about the reader — they have one whether they name it
   * or not, and most will not want to.
   */
  const [target, setTarget] = useState<number | null>(null)
  const [currentAge, setCurrentAge] = useState<number | null>(null)
  const [retirementAge, setRetirementAge] = useState<number | null>(null)
  const [saved, setSaved] = useState<number | null>(null)
  const [monthly, setMonthly] = useState<number | null>(null)
  const [returnPct, setReturnPct] = useState<number | null>(DEFAULT_RETURN)

  /**
   * Held back until the typing stops.
   *
   * Every change runs thousands of simulated markets across eight bisections,
   * which is felt between one keystroke and the next. Settling first costs one
   * recompute per pause instead of one per character, and the whole set is
   * held rather than the answer alone so the page never shows a target from
   * one moment beside routes from another.
   */
  const typed = useMemo(
    () => ({ target, currentAge, retirementAge, saved, monthly, returnPct }),
    [target, currentAge, retirementAge, saved, monthly, returnPct],
  )
  const settled = useSettled(typed, 250)
  const working = settled !== typed

  /**
   * The three that cannot be assumed. A balance and a contribution left blank
   * mean none and nothing — both are real answers — but an age or a target
   * guessed on somebody's behalf would be inventing the question.
   */
  const ready =
    settled.target !== null &&
    settled.currentAge !== null &&
    settled.retirementAge !== null

  const inputs = useMemo(
    () =>
      goalInputs({
        currentAge: settled.currentAge ?? 0,
        retirementAge: settled.retirementAge ?? 0,
        brokerageBalance: settled.saved ?? 0,
        monthlyContribution: settled.monthly ?? 0,
        preRetirementReturn: settled.returnPct ?? DEFAULT_RETURN,
        // Risk travels with return rather than being held fixed: a portfolio
        // expected to return more swings more, and leaving volatility behind
        // would quietly make a higher return free.
        preRetirementVolatility: (settled.returnPct ?? DEFAULT_RETURN) * RISK_RATIO,
      }),
    [settled],
  )

  const goal = useMemo(
    () => (ready ? reachGoal(inputs, settled.target as number) : null),
    [ready, inputs, settled],
  )

  // Named rather than counted, so the empty state asks for the thing itself.
  const missing = [
    settled.target === null && 'a target',
    settled.currentAge === null && 'your age',
    settled.retirementAge === null && 'the age you want to retire',
  ].filter((v): v is string => typeof v === 'string')

  // Reached an answer worth reading, and later carried it across. Milestones
  // only — none of the figures above travel with them.
  useEffect(() => {
    if (goal) record('goal_answered', undefined, true)
  }, [goal])

  /**
   * A plain link, carrying nothing.
   *
   * This page has to put the balance somewhere to grow it, and it assumes a
   * brokerage account and a 401(k) — which is harmless while saving and
   * decisive on the way out, because what a dollar costs in tax depends
   * entirely on which of them it came from. Carrying that assumption across
   * silently would answer a question the planner is about to ask properly.
   */
  const handoff = '/planner'

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 gap-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field
            id="target"
            label="I want"
            placeholder="1,000,000"
            info={
              <>
                <p>
                  The amount you want to have saved by the age below.
                </p>
                <p>
                  The arithmetic here is plain compound growth at the rate you
                  set: your balance earns it every year, and each month&apos;s
                  saving earns it from the month you add it. Nothing is
                  adjusted for inflation and no market variation is modelled,
                  so every figure can be checked on a calculator.
                </p>
                <p>
                  The planner does both, because a retirement runs thirty years
                  and by then they decide whether the money holds out.
                </p>
              </>
            }
            value={target}
            prefix="$"
            onChange={setTarget}
          />
          <Field
            id="currentAge"
            label="I am now (age)"
            value={currentAge}
            min={16}
            max={90}
            onChange={setCurrentAge}
          />
          <Field
            id="retirementAge"
            label="By age"
            value={retirementAge}
            min={17}
            max={95}
            onChange={setRetirementAge}
          />
          <Field
            id="saved"
            label="Saved so far"
            placeholder="none yet"
            value={saved}
            prefix="$"
            onChange={setSaved}
          />
          <Field
            id="monthly"
            label="Saving now"
            placeholder="per month"
            value={monthly}
            prefix="$"
            onChange={setMonthly}
          />
          <Field
            id="returnPct"
            label="Return a year"
            value={returnPct}
            suffix="%"
            min={0}
            max={30}
            onChange={setReturnPct}
          />
        </div>

      </Card>

      {!goal ? (
        <Card className="p-6 gap-2">
          <p className="text-sm font-medium text-foreground">
            {missing.length === 3
              ? 'Fill in the boxes above and the four routes will appear here.'
              : `Still needed: ${missing.join(', ')}.`}
          </p>
          {/* Only when everything is filled in and the answer is still not
              computable, which leaves exactly one thing it can be. */}
          {missing.length === 0 && (
            <p className="text-sm text-muted-foreground text-pretty">
              Set a retirement age later than your age now.
            </p>
          )}
        </Card>
      ) : (
        // Dimmed while the figures are still moving, so a stale answer reads
        // as one that is about to change rather than as the current one.
        <div className={cn('flex flex-col gap-6 transition-opacity', working && 'opacity-60')}>
          <Card className="p-5 gap-3 border-l-4 border-l-primary">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wider text-primary">
                Where you stand
              </p>
              <p className="font-serif text-lg font-medium text-foreground text-pretty">
                You would have{' '}
                <span className="tabular-nums">{money(goal.reached)}</span> by{' '}
                {goal.retirementAge}.
              </p>
              <p className="text-sm text-muted-foreground text-pretty">
                {goal.alreadyThere
                  ? `That clears the ${money(goal.target)} you asked for, with ${money(goal.reached - goal.target)} to spare.`
                  : `That is ${money(goal.target - goal.reached)} short of the ${money(goal.target)} you asked for. Four things could close it, and they are not equally easy.`}
              </p>
            </div>

            <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
              <Row
                label={`${money(settled.saved ?? 0)} you have now, at ${goal.rate}% for ${goal.years} ${goal.years === 1 ? 'year' : 'years'}`}
                value={money(goal.fromPrincipal)}
              />
              <Row
                label={`${money(settled.monthly ?? 0)} a month for ${goal.years} ${goal.years === 1 ? 'year' : 'years'}, at the same rate`}
                value={money(goal.fromContributions)}
              />
              <Row label="Total" value={money(goal.reached)} total />
            </dl>

            <p className="text-xs text-muted-foreground text-pretty">
              Your balance earns {goal.rate}% every year, and each month&apos;s
              saving earns it from the month you put it in. The two lines add to
              the total exactly.
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            {goal.levers.map((l) => (
              <LeverCard key={l.kind} lever={l} target={goal.target} />
            ))}
          </div>

          <Card className="p-6 gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">
              Where the money comes from
            </p>
            <div className="flex h-8 w-full overflow-hidden rounded-lg">
              <div
                className="flex items-center justify-center bg-primary/25 text-[11px] font-medium text-foreground"
                style={{
                  width: `${Math.max(6, (goal.contributed / Math.max(goal.reachedOnPaper, 1)) * 100)}%`,
                }}
              >
                you
              </div>
              <div className="flex flex-1 items-center justify-center bg-primary/60 text-[11px] font-medium text-foreground">
                growth
              </div>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              Saving your way there puts in{' '}
              <span className="font-medium text-foreground">
                {money(goal.contributed)}
              </span>{' '}
              of your own money over {goal.years} years. Growth adds{' '}
              <span className="font-medium text-foreground">
                {money(goal.growth)}
              </span>
              .{' '}
              {/* Both true, both about time. The first is the good news and
                  gets to sound like it; the second is the same fact seen from
                  a shorter runway, and points at the fix rather than the
                  shortfall. */}
              {goal.growth > goal.contributed
                ? 'Compounding is doing more of the work than you are — every year it stays invested, your money earns on the growth it already made, and that snowball is the whole reason starting is worth more than saving harder later.'
                : 'Give it longer and compounding takes over: the growth you have already earned starts earning too. The same plan run a few more years would tip this bar the other way, with the market contributing more than you do.'}
            </p>
          </Card>

          <Card className="p-6 gap-3 border-l-4 border-l-primary">
            <p className="font-serif text-lg font-medium text-foreground text-pretty">
              A number is not a plan.
            </p>
            <p className="text-sm text-muted-foreground text-pretty">
              {money(goal.target)} has to last once you stop working, and it
              gets taxed on the way out — at a rate that depends entirely on
              which account each dollar comes from. A brokerage dollar is taxed
              only on its growth, a 401(k) dollar in full, a Roth dollar not at
              all. This page had to assume a split to grow the money; the
              planner asks you for the real one, along with your spending,
              Social Security and the years after retirement.
            </p>
            <div>
              <Link
                href={handoff}
                onClick={() => record('goal_handoff')}
                className={buttonVariants({
                  size: 'lg',
                  className: 'gap-1.5 px-4 shadow-sm',
                })}
              >
                Build the full plan
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
