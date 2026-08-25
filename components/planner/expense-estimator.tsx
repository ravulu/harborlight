'use client'

import { useRef, useState } from 'react'
import { Calculator, ChevronDown, RotateCcw } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  categoryTotal,
  emptyExpenses,
  readExpenses,
  totalExpenses,
  writeExpenses,
  type ExpenseCategory,
} from '@/lib/expenses'
import { useWindowReturn } from '@/lib/use-window-return'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/retirement'
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
          <div key={item.key} className="flex items-center justify-between gap-3">
            <Label htmlFor={`exp-${item.key}`} className="text-sm text-muted-foreground">
              {item.label}
            </Label>
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
export function ExpenseEstimator({ onApply }: { onApply: (monthly: number) => void }) {
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
            Estimate your monthly spending
          </DialogTitle>
          <DialogDescription>
            Fill in what you know and leave the rest at nothing. The total
            becomes your monthly spending, so it is the sum that matters rather
            than the split.
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
            that pays for it — the planner adds that itself. Housing is usually
            the largest line and the one that moves most in retirement: a
            mortgage paid off before you stop working takes most of it away.
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
            <div className="text-right">
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(total)}
                <span className="text-sm font-normal text-muted-foreground"> a month</span>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatCurrency(total * 12)} a year
              </p>
            </div>
            {/* Nothing entered means nothing to apply, and applying zero would
                wipe a spending figure the user may already have set. */}
            {total > 0 ? (
              <DialogClose
                render={<Button type="button" />}
                onClick={() => onApply(total)}
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
