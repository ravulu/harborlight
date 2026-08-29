'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { comparePayoff, type Schedule } from '@/lib/debt-payoff'
import { caretAfter, significantBefore, withThousands } from '@/lib/number-format'
import { useWindowReturn } from '@/lib/use-window-return'
import { LIABILITY_KINDS, type Liability, type LiabilityKind } from '@/lib/liabilities'
import { formatCurrency } from '@/lib/retirement'

/**
 * Snowball and avalanche, side by side.
 *
 * One component, two surfaces. Standalone it owns its own list of debts and
 * stores nothing; on Assets & liabilities it is handed `register.liabilities`
 * and only asks for the budget, because the debts are already entered a few
 * inches above it. `onChange` is what tells the two apart: given one, the list
 * is editable; without one, it reports the debts it was handed.
 *
 * That is the whole reason the second surface costs half a day rather than
 * two: the alternative — a link to the standalone page — would send somebody
 * who has already typed every debt to a blank form. `docs/debt-payoff.md`.
 *
 * **It names no winner.** Avalanche always pays less interest; snowball
 * usually clears the first debt sooner, which is the reason people who have
 * tried both give for sticking with it. Both are reported and the difference
 * is stated, the way the conversion and claiming ladders do it, because
 * `lib/windows.test.ts` fails the build on "the best" and it is right to.
 */

const money = (v: number) => formatCurrency(Math.round(v))

/** "3 years 2 months", because 38 is not how anybody thinks about this. */
function duration(months: number | null): string {
  if (months === null) return 'never, at this rate'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const y = Math.floor(months / 12)
  const m = months % 12
  return `${y} year${y === 1 ? '' : 's'}${m ? ` ${m} month${m === 1 ? '' : 's'}` : ''}`
}

let nextId = 0
const blankDebt = (): Liability => ({
  id: `d${++nextId}`,
  kind: 'card',
  name: '',
  balance: 0,
  ratePercent: 0,
  monthlyPayment: 0,
})

/**
 * A number box that groups as it is typed.
 *
 * The first version of this took `value={d.balance}` straight onto an input
 * and stripped anything that was not a digit on the way back. Two things
 * followed: a balance of 14800 rendered as `14800`, and a comma typed or
 * pasted from a statement — `9,500` — was silently dropped rather than
 * understood. Every other numeric field in this app already solves that with
 * the same three helpers, and not reusing them was the mistake.
 *
 * `text` holds what is being typed while it is being typed. Without it the box
 * shows a reformatted figure back on every keystroke and the caret jumps to
 * the end; `significantBefore` and `caretAfter` count the caret back to the
 * same digit after the string is regrouped.
 */
function NumberBox({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  plain,
  placeholder = '0',
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  /** No thousands separators — for a rate, where they would be nonsense. */
  plain?: boolean
  placeholder?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const returning = useWindowReturn()
  const shown =
    text ?? (value === 0 ? '' : plain ? String(value) : withThousands(String(value)))

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          inputMode="decimal"
          value={shown}
          placeholder={placeholder}
          className={cn('tabular-nums', prefix && 'pl-6', suffix && 'pr-7')}
          // Cleared on the way in, like every other money box here: a balance
          // of 5,000 clicked into and typed 53 in would otherwise become
          // 500,053.
          onFocus={() => {
            // Coming back from another window is not a fresh edit.
            if (returning()) return
            setText('')
          }}
          onClick={() => setText('')}
          onBlur={() => setText(null)}
          onChange={(e) => {
            const el = e.target
            const typed = el.value.replace(/[^0-9.,]/g, '')
            const digits = significantBefore(typed, el.selectionStart ?? typed.length)
            const formatted = plain ? typed.replace(/,/g, '') : withThousands(typed)
            setText(formatted)

            const numeric = formatted.replace(/,/g, '')
            const n = numeric === '' ? 0 : Number(numeric)
            onChange(Number.isFinite(n) ? n : 0)

            if (!plain) {
              requestAnimationFrame(() => {
                const pos = caretAfter(formatted, digits)
                el.setSelectionRange(pos, pos)
              })
            }
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function Row({
  schedule,
  label,
  hint,
  emphasis,
  badge,
  totalDebts,
}: {
  schedule: Schedule
  label: string
  hint: string
  emphasis?: boolean
  /** How many debts there are, so a partial payoff can say what is left. */
  totalDebts?: number
  /**
   * A word for what this row wins on, when it wins something.
   *
   * Same treatment the Roth conversion ladder gives its cheapest row — accent
   * behind it, the word in the primary colour — because it is the same kind of
   * claim: a fact about cost, not advice about what to do. And like that one
   * it is only shown when there is a difference worth marking.
   */
  badge?: string
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex flex-col gap-0.5 rounded-lg bg-accent/40 px-4 py-3'
          : 'flex flex-col gap-0.5 px-4 py-3'
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
              {badge}
            </span>
          )}
        </span>
        <span className="text-sm tabular-nums text-foreground">
          {duration(schedule.months)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-xs text-muted-foreground">{hint}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {schedule.interest === null
            ? 'interest never stops'
            : `${money(schedule.interest)} interest`}
        </span>
      </div>
      {schedule.cleared.length > 0 && (
        /**
         * When each debt goes, not merely in what order.
         *
         * This was "Visa → Loan" and nothing said what the arrow meant — a
         * reader could as easily have read it as money moving from one debt to
         * another. The order is the point of the two methods, and the month
         * each one falls is the point of the order: snowball's whole argument
         * is that something disappears early, which a bare list cannot show.
         */
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          <span className="text-foreground">Gone in this order:</span>{' '}
          {schedule.cleared.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ', then '}
              {c.name} after {c.month} month{c.month === 1 ? '' : 's'}
            </span>
          ))}
          {totalDebts !== undefined && schedule.cleared.length < totalDebts && (
            <>
              . The {totalDebts - schedule.cleared.length === 1 ? 'other' : 'others'}{' '}
              never clear at this rate.
            </>
          )}
        </p>
      )}
    </div>
  )
}

export function DebtPayoffCalculator({
  debts,
  onChange,
  /** Rendered under the answer — the handoff on the standalone page. */
  footer,
}: {
  debts: Liability[]
  /** Given, the list is editable. Absent, the debts came from somewhere else. */
  onChange?: (next: Liability[]) => void
  footer?: React.ReactNode
}) {
  const minimums = debts.reduce((s, d) => s + Math.max(0, d.monthlyPayment), 0)
  /**
   * Empty until somebody types, then their own figure.
   *
   * Not defaulted to the minimums: a budget box pre-filled with the number
   * that produces "both methods are identical" answers a question nobody
   * asked, and reads as the calculator being broken.
   */
  /**
   * Nothing typed yet means "what I already pay", not "nothing".
   *
   * Before this, entering a loan and its payment showed no answer at all until
   * the same monthly figure was typed a second time into the box below — and
   * in the meantime a red line asked for it. The payment is already on the
   * page; the budget box is for the *other* question, which is what paying
   * more would do.
   */
  const [typedBudget, setTypedBudget] = useState(0)
  const monthlyBudget = typedBudget > 0 ? typedBudget : minimums

  const result = useMemo(
    () => comparePayoff(debts, monthlyBudget),
    [debts, monthlyBudget],
  )

  const edit = (id: string, over: Partial<Liability>) =>
    onChange?.(debts.map((d) => (d.id === id ? { ...d, ...over } : d)))

  const owed = debts.reduce((s, d) => s + Math.max(0, d.balance), 0)
  const liveDebts = debts.filter((d) => d.balance > 0).length
  /**
   * Months snowball gets the first debt gone by, over avalanche.
   *
   * Badged beside the cheapest row rather than left out, because avalanche
   * winning on interest is not the same as avalanche winning. Marking only
   * cost would make one row look strictly better than the other and quietly
   * delete the reason the other method exists.
   */
  const firstWin = result.ok ? result.comparison.firstWin : null
  const sooner = firstWin?.monthsSooner ?? 0
  /** Long enough to read, short enough for a badge. */
  const badgeName =
    firstWin && firstWin.name.length > 22
      ? `${firstWin.name.slice(0, 21)}…`
      : (firstWin?.name ?? '')

  /**
   * Why the two methods came out the same, when they did.
   *
   * There are three honest reasons and a reader cannot tell them apart from
   * two identical rows. The first is much the commonest and is really a
   * missing input: with no rate on anything, "highest rate first" has nothing
   * to sort by and falls back to balance — which is the other method. Saying
   * so turns "this calculator is broken" into "I have not filled in the
   * rates".
   */
  const rated = debts.filter((d) => d.balance > 0)
  const noRates = rated.length > 0 && rated.every((d) => d.ratePercent <= 0)
  const oneRate =
    !noRates && rated.length > 1 && rated.every((d) => d.ratePercent === rated[0].ratePercent)

  return (
    <div className="flex flex-col gap-4">
      {onChange && (
        <div className="flex flex-col gap-2">
          {debts.map((d) => (
            <div
              key={d.id}
              className="grid gap-2 rounded-lg border border-border/60 p-3 @lg:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto]"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${d.id}-name`} className="text-xs">
                  What it is
                </Label>
                <Input
                  id={`${d.id}-name`}
                  value={d.name}
                  placeholder="Visa, car loan…"
                  onChange={(e) => edit(d.id, { name: e.target.value })}
                />
              </div>
              <NumberBox
                id={`${d.id}-balance`}
                label="Owed"
                prefix="$"
                value={d.balance}
                onChange={(balance) => edit(d.id, { balance })}
              />
              <NumberBox
                id={`${d.id}-rate`}
                label="Rate"
                suffix="%"
                plain
                // Not "0". A zero placeholder reads as a filled-in field, so
                // the rate gets skipped — and with no rates anywhere the two
                // methods have nothing to tell them apart and come out
                // identical, which looks like the calculator being broken.
                placeholder="19.9"
                value={d.ratePercent}
                onChange={(ratePercent) => edit(d.id, { ratePercent })}
              />
              <NumberBox
                id={`${d.id}-min`}
                label="Paying now"
                prefix="$"
                value={d.monthlyPayment}
                onChange={(monthlyPayment) => edit(d.id, { monthlyPayment })}
              />
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${d.name || 'this debt'}`}
                  onClick={() => onChange(debts.filter((x) => x.id !== d.id))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="w-fit"
            onClick={() => onChange([...debts, blankDebt()])}
          >
            <Plus className="size-3.5" /> Add a debt
          </Button>
        </div>
      )}

      {!onChange && debts.length > 0 && (
        <p className="text-sm text-muted-foreground text-pretty">
          {debts.length} debt{debts.length === 1 ? '' : 's'} from your plan. You
          owe {money(owed)} and pay {money(minimums)} a month right now. Edit
          them above and this updates.
        </p>
      )}

      <div className="flex max-w-xs flex-col gap-1.5">
        <NumberBox
          id="debt-budget"
          label="How much can you put toward debt each month?"
          prefix="$"
          value={typedBudget}
          onChange={setTypedBudget}
          placeholder={minimums > 0 ? String(Math.round(minimums)) : '1,200'}
        />
        {minimums > 0 && (
          <p className="text-xs text-muted-foreground">
            {money(minimums)} of that is what you already pay each month.
            Anything more than that is what speeds things up.
          </p>
        )}
      </div>

      {!result.ok && result.refusal.kind === 'no-debts' && (
        <p className="text-sm text-muted-foreground">
          Start by adding a debt. You need what you owe on it, its interest
          rate, and what you pay each month.
        </p>
      )}

      {/* Red is for a figure somebody actually entered that cannot work — not
          for a box they have not reached yet. The prompt used to be styled as
          an error and appeared the moment a debt was typed, so filling in the
          rate produced a red line about the budget. */}
      {!result.ok && result.refusal.kind === 'budget-below-minimums' && (
        <p
          className={
            typedBudget > 0
              ? 'text-sm text-destructive text-pretty'
              : 'text-sm text-muted-foreground text-pretty'
          }
        >
          {typedBudget > 0
            ? `That is ${money(result.refusal.short)} less than the ${money(result.refusal.minimums)} you already pay each month. There is nothing left over to put anywhere, so neither way can help until you can cover the payments themselves.`
            : `Add what you pay each month on the debts above, or enter an amount here, and this will work out how long they take.`}
        </p>
      )}

      {result.ok && (
        <>
          {/* Three rows only when there are three answers.
              With one debt there is nothing to order, and with several the
              smallest balance is often also the highest rate — so the two
              methods frequently agree. Printing them as separate rows then,
              one hinted "you clear a debt sooner" and the other "you pay less
              interest", claims a difference that is not there. */}
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            <Row
              schedule={result.comparison.minimumsOnly}
              totalDebts={liveDebts}
              label={
                result.comparison.surplus > 0
                  ? 'Paying only the minimums'
                  : 'Paying what you pay now'
              }
              hint={
                result.comparison.surplus > 0
                  ? 'What happens if nothing changes'
                  : `${money(result.comparison.minimums)} a month, as things stand`
              }
              emphasis={result.comparison.surplus <= 0}
            />
            {result.comparison.surplus <= 0 ? null : liveDebts === 1 ? (
              // One debt has no order to choose. "Smallest balance first"
              // against "highest rate first" on a single debt is two names for
              // the same arithmetic.
              <Row
                schedule={result.comparison.avalanche}
                totalDebts={liveDebts}
                label="Paying it off"
                hint="What the extra buys"
                emphasis
              />
            ) : (
              <>
                <Row
                  schedule={result.comparison.snowball}
                  totalDebts={liveDebts}
                  label="Smallest debt first (snowball)"
                  hint={
                    result.comparison.methodsAgree
                      ? 'Comes out the same here'
                      : sooner > 0
                        ? `${sooner} month${sooner === 1 ? '' : 's'} sooner than the other way`
                        : 'You clear a debt sooner'
                  }
                  emphasis={!result.comparison.methodsAgree && sooner > 0}
                  badge={
                    !result.comparison.methodsAgree && sooner > 0
                      ? `${badgeName} gone sooner`
                      : undefined
                  }
                />
                <Row
                  schedule={result.comparison.avalanche}
                  totalDebts={liveDebts}
                  label="Highest interest rate first (avalanche)"
                  hint={
                    result.comparison.methodsAgree
                      ? 'Comes out the same here'
                      : `${money(result.comparison.avalancheSaves?.interest ?? 0)} less interest`
                  }
                  emphasis={!result.comparison.methodsAgree}
                  badge={!result.comparison.methodsAgree ? 'cheapest' : undefined}
                />
              </>
            )}
          </div>

          {/* The difference, stated. No winner named: which of these matters
              is a question about the reader, not about the arithmetic. */}
          {result.comparison.surplus <= 0 ? (
            <p className="text-sm text-foreground text-pretty">
              That is what your payments come to as they stand. Put in more than{' '}
              {money(result.comparison.minimums)} a month above and you will see
              what the extra buys
              {debts.filter((d) => d.balance > 0).length > 1
                ? ', and which order to pay them in.'
                : '.'}
            </p>
          ) : (
            result.comparison.methodsAgree && (
              <p className="text-sm text-foreground text-pretty">
                {liveDebts === 1
                  ? 'With one debt there is nothing to choose between the two methods — they are the same thing.'
                  : noRates
                    ? 'These come out the same because no interest rates have been entered. Add the rate on each debt and the two methods will part company — paying the highest rate first is what saves the interest.'
                    : oneRate
                      ? 'These come out the same because every debt is at the same rate. With nothing to choose on rate, paying the highest rate first is just paying the smallest first.'
                      : 'Both methods clear these debts in the same order here — the smallest balance happens to carry the highest rate — so the two come to exactly the same figures.'}
              </p>
            )
          )}

          {!result.comparison.methodsAgree && result.comparison.avalancheSaves && (
            <p className="text-sm text-foreground text-pretty">
              Paying the highest rate first costs{' '}
              <span className="font-medium">
                {money(result.comparison.avalancheSaves.interest)}
              </span>{' '}
              less in interest
              {result.comparison.avalancheSaves.months > 0 &&
                ` and finishes ${result.comparison.avalancheSaves.months} month${
                  result.comparison.avalancheSaves.months === 1 ? '' : 's'
                } sooner`}
              .{' '}
              {sooner > 0 && (
                  <>
                    Paying the smallest first gets rid of your{' '}
                    <span className="font-medium">{firstWin?.name}</span>{' '}
                    <span className="font-medium">
                      {sooner} month{sooner === 1 ? '' : 's'}
                    </span>{' '}
                    sooner. Some people find that easier to keep going with.
                  </>
                )}
            </p>
          )}

          {/* Why, not just by how much.
              The badges say which row wins what; a reader who does not already
              know the mechanism has no way to tell whether that is a rule or a
              coincidence of their own figures. Two sentences settle it, and
              they are the same two whatever the numbers say. */}
          {!result.comparison.methodsAgree && liveDebts > 1 && (
            <p className="text-xs text-muted-foreground text-pretty">
              Why: interest is charged on what you still owe, so putting the
              spare money where the rate is highest stops the most of it
              building up — that is always the cheaper of the two. Going at the
              smallest balance first costs a bit more, but one debt disappears
              sooner and its payment then joins the rest.
            </p>
          )}

          {result.comparison.surplus > 0 &&
            result.comparison.minimumsOnly.interest !== null &&
            result.comparison.avalanche.interest !== null && (
              <p className="text-xs text-muted-foreground text-pretty">
                The extra {money(result.comparison.surplus)} a month is what
                makes the difference. It saves up to{' '}
                {money(
                  result.comparison.minimumsOnly.interest -
                    result.comparison.avalanche.interest,
                )}{' '}
                in interest compared with paying just the minimums.
              </p>
            )}

          {footer}
        </>
      )}
    </div>
  )
}

export { blankDebt, LIABILITY_KINDS }
export type { LiabilityKind }
