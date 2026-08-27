'use client'

import { useRef, useState } from 'react'
import { Calculator, ChevronDown, RotateCcw } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  categoryTotal,
  emptyExpenses,
  readExpenses,
  splitExpenses,
  totalExpenses,
  writeExpenses,
  type ExpenseCategory,
} from '@/lib/expenses'
import { useWindowReturn } from '@/lib/use-window-return'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/retirement'
import { MEDICARE_AGE } from '@/lib/aca'
import {
  caretAfter,
  significantBefore,
  withThousands,
} from '@/lib/number-format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * One category's amount.
 *
 * Focusing clears it, the same contract the slider boxes use. A field sitting
 * at 0 and aligned right puts the caret in front of that 0 when clicked
 * anywhere left of it, so typing 2200 would land 22,000 — the zero pushed to
 * the end rather than replaced. Blurring an untouched box puts the value back.
 */
function AmountInput({
  id,
  value,
  onChange,
  label,
}: {
  id: string
  value: number
  onChange: (next: number) => void
  label: string
}) {
  const [text, setText] = useState<string | null>(null)
  // Skips the emptying when the browser is handing the window back rather
  // than someone choosing the field — otherwise a part-typed figure vanishes
  // on returning from another app.
  const returning = useWindowReturn()

  return (
    <div className="relative w-28 shrink-0">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        $
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        value={text ?? withThousands(String(value))}
        onChange={(e) => {
          const el = e.target
          const typed = el.value
          const digits = significantBefore(typed, el.selectionStart ?? typed.length)
          const formatted = withThousands(typed)
          setText(formatted)

          const numeric = formatted.replace(/,/g, '')
          // An empty box counts as nothing rather than reverting, so a
          // category can be cleared on the way to typing a new figure.
          const n = numeric === '' ? 0 : Number(numeric)
          if (Number.isFinite(n)) onChange(Math.min(n, 1_000_000))

          requestAnimationFrame(() => {
            const pos = caretAfter(formatted, digits)
            el.setSelectionRange(pos, pos)
          })
        }}
        onFocus={() => {
            if (returning()) return
            setText('')
          }}
        onClick={() => setText('')}
        onBlur={() => setText(null)}
        className="h-9 pl-6 text-right tabular-nums"
      />
    </div>
  )
}

/**
 * One group of lines and the figure they add up to.
 *
 * Collapsed by default so the dialog stays a list of eleven things rather than
 * thirty-eight, with the group's own total on the row — enough to see what a
 * closed group is contributing without opening it.
 */
function Group({
  category,
  values,
  open,
  onOpenChange,
  onChange,
}: {
  category: ExpenseCategory
  values: Record<string, number>
  open: boolean
  onOpenChange: (next: boolean) => void
  onChange: (key: string, value: number) => void
}) {
  const sum = categoryTotal(category, values)

  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className="group rounded-lg border border-border px-3 [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex list-none items-center justify-between gap-3 py-2.5 text-left">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">{category.label}</span>
          <span className="text-xs text-muted-foreground text-pretty">
            {category.hint}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'text-sm tabular-nums',
              sum > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {formatCurrency(sum)}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-border py-3">
        {category.items?.map((item) => (
          <div key={item.key} className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col gap-0.5 py-1">
              <Label
                htmlFor={`exp-${item.key}`}
                className="text-sm text-muted-foreground"
              >
                {item.label}
              </Label>
              {/* At the box rather than in the footnote at the bottom, which
                  is read after the figures have already been typed. */}
              {item.note && (
                <span className="text-xs text-muted-foreground/80 text-pretty">
                  {item.note}
                </span>
              )}
            </span>
            <AmountInput
              id={`exp-${item.key}`}
              label={`${item.label} per month`}
              value={values[item.key] ?? 0}
              onChange={(n) => onChange(item.key, n)}
            />
          </div>
        ))}
      </div>
    </details>
  )
}

/**
 * Builds a spending figure from its parts, for anyone who knows what their
 * life costs but not what it adds up to.
 *
 * It hands back a monthly total in today's money and net of tax, which is what
 * the spending field takes — the planner grosses it up for the tax on the
 * withdrawal that funds it.
 */
export function ExpenseEstimator({
  onApply,
}: {
  onApply: (spending: number, healthFrom65: number) => void
}) {
  const [open, setOpen] = useState(false)
  // Focus the heading, not the first box. Base UI would otherwise focus
  // Housing, and a focused box clears itself — so the dialog would open with
  // its first figure blank while the other ten read 0.
  const heading = useRef<HTMLHeadingElement>(null)
  // Read lazily rather than in an effect: the fields are not rendered until
  // the dialog opens, so there is nothing for the server and the client to
  // disagree about.
  const [values, setValues] = useState<Record<string, number>>(
    () => readExpenses() ?? emptyExpenses(),
  )
  // Open the groups that already hold something, so figures from earlier in
  // the tab are visible rather than hidden behind a closed row.
  const [expanded, setExpanded] = useState<string[]>(() =>
    EXPENSE_CATEGORIES.filter((c) => c.items && categoryTotal(c, values) > 0).map(
      (c) => c.key,
    ),
  )
  const total = totalExpenses(values)
  // Health leaves the spending figure: it does not start until Medicare does,
  // and the projection charges cover before then for itself.
  const split = splitExpenses(values)

  // Kept for the tab, so closing the dialog and coming back does not cost
  // someone the figures they just worked out.
  const update = (next: Record<string, number>) => {
    setValues(next)
    writeExpenses(next)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          // A link rather than a button. It sits over the box it fills in,
          // where its position says what it is for, so it does not need the
          // weight of a control competing with the box itself.
          <button
            type="button"
            className="inline-flex w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        }
      >
        <Calculator className="size-3.5" />
        Estimate my monthly expenses
      </DialogTrigger>

      <DialogContent initialFocus={heading}>
        <DialogHeader>
          <DialogTitle ref={heading} tabIndex={-1} className="outline-none">
            What will a month cost once you have stopped working?
          </DialogTitle>
          <DialogDescription>
            Retirement costs, not today&apos;s — the mortgage may be gone, the
            commute certainly is, and health cover becomes something you buy
            rather than something an employer arranges. Fill in what you know
            and leave the rest at nothing.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-2">
            {EXPENSE_CATEGORIES.map((c) =>
              c.items ? (
                <Group
                  key={c.key}
                  category={c}
                  values={values}
                  open={expanded.includes(c.key)}
                  onOpenChange={(next) =>
                    setExpanded((keys) =>
                      next ? [...keys, c.key] : keys.filter((k) => k !== c.key),
                    )
                  }
                  onChange={(key, n) => update({ ...values, [key]: n })}
                />
              ) : (
                <div
                  key={c.key}
                  className="flex items-center justify-between gap-4 px-3 py-1"
                >
                  <div className="flex min-w-0 flex-col">
                    <Label htmlFor={`exp-${c.key}`} className="text-sm text-foreground">
                      {c.label}
                    </Label>
                    <span className="text-xs text-muted-foreground text-pretty">
                      {c.hint}
                    </span>
                  </div>
                  <AmountInput
                    id={`exp-${c.key}`}
                    label={`${c.label} per month`}
                    value={values[c.key] ?? 0}
                    onChange={(n) => update({ ...values, [c.key]: n })}
                  />
                </div>
              ),
            )}
          </div>

          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground text-pretty">
            Enter what leaves your account, before any tax on the withdrawal
            that pays for it — the planner adds that itself. If a figure is one
            you pay today, ask whether you will still be paying it then: housing
            and transport are usually the two that move most, and health care is
            the one that moves the other way.
          </p>
          {/* Asked for once, and taken back out. Nobody can price marketplace
              cover from memory, and the plan already knows everything needed to
              work it out — income, age, household size. A box here would be a
              guess standing in for a calculation. */}
          <p className="mt-3 rounded-md border border-primary/20 bg-accent/40 px-3 py-2 text-xs text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">
              Health care is handled apart from the monthly total.
            </span>{' '}
            The health lines above are what you pay from {MEDICARE_AGE}, and
            they are carried separately so they are charged from {MEDICARE_AGE}{' '}
            rather than from the day you stop working. Cover before then is
            worked out for you each year from your own income, subsidy included
            — change that under{' '}
            <span className="font-medium text-foreground">Saving</span> if your
            cover comes from somewhere else.
          </p>
        </DialogBody>

        <DialogFooter className="justify-between">
          <button
            type="button"
            onClick={() => {
              update(emptyExpenses())
              setExpanded([])
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            Start over
          </button>
          <div className="flex items-center gap-3">
            {/* The two figures shown apart, because they are applied apart and
                start at different times. Showing only the sum would leave the
                reader wondering why the spending field took a smaller number
                than the one they had been looking at. */}
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(split.spending)}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  a month
                </span>
              </p>
              {split.fromSixtyFive > 0 ? (
                <p className="text-xs text-muted-foreground text-pretty">
                  plus{' '}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(split.fromSixtyFive)}
                  </span>{' '}
                  a month of health care, carried separately and charged from{' '}
                  {MEDICARE_AGE}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(split.spending * 12)} a year
                </p>
              )}
            </div>
            {/* Nothing entered means nothing to apply, and applying zero would
                wipe a spending figure the user may already have set. */}
            {total > 0 ? (
              <DialogClose
                render={<Button type="button" />}
                onClick={() => onApply(split.spending, split.fromSixtyFive)}
              >
                Use this
              </DialogClose>
            ) : (
              <Button type="button" disabled>
                Use this
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
