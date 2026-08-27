'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/retirement'
import { useWindowReturn } from '@/lib/use-window-return'
import { caretAfter, significantBefore, withThousands } from '@/lib/number-format'
import {
  LIABILITY_KINDS,
  annualInterest,
  payoff,
  totalOwed,
  type Liability,
  type LiabilityKind,
} from '@/lib/liabilities'
import { blankLiability } from '@/lib/holdings-store'

const money = (v: number) => formatCurrency(v)

/**
 * What is owed and not secured against anything above.
 *
 * A mortgage and a car loan are already accounted for where they sit, because
 * what they change is that thing's equity. These have nothing behind them, and
 * a balance sheet without them is a list of assets.
 *
 * Deliberately short. Four figures describe any of these — what is left, what
 * it charges, and what is paid at it — and a longer form would collect detail
 * nobody needs to see the shape of what they owe.
 */
export function LiabilitiesList({
  liabilities,
  onChange,
}: {
  liabilities: Liability[]
  onChange: (next: Liability[]) => void
}) {
  const patch = (id: string, over: Partial<Liability>) =>
    onChange(liabilities.map((l) => (l.id === id ? { ...l, ...over } : l)))

  const add = (kind: LiabilityKind) =>
    onChange([...liabilities, blankLiability(kind)])

  const owed = totalOwed(liabilities)

  return (
    <Card className="p-6 gap-4">
      {/* The heading is back. It shares a tab with the assets again, so it
          needs to say where one list ends and the other begins. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-lg font-medium text-foreground">
            What you owe
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
            Debt with nothing behind it — a student loan, a card balance, a line
            of credit. A mortgage or a car loan belongs with the thing it is
            secured against, above, where it already comes off the equity.
          </p>
        </div>
        {owed > 0 && (
          <span className="flex shrink-0 flex-col items-end">
            <span className="font-serif text-2xl tabular-nums text-foreground">
              {money(owed)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              across {liabilities.length}{' '}
              {liabilities.length === 1 ? 'debt' : 'debts'}
            </span>
          </span>
        )}
      </div>

      {liabilities.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="text-left align-bottom">
                <th className="py-1.5 pr-3 font-medium">What it is</th>
                <th className="px-3 py-1.5 font-medium text-right">Balance</th>
                <th className="px-3 py-1.5 font-medium text-right">Rate</th>
                <th className="px-3 py-1.5 font-medium text-right">
                  Paid
                  <span className="block text-[10px] font-normal normal-case">
                    a month
                  </span>
                </th>
                <th className="px-3 py-1.5 font-medium text-right">
                  Clear in
                  <span className="block text-[10px] font-normal normal-case">
                    at that rate
                  </span>
                </th>
                <th className="pl-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {liabilities.map((l) => {
                const p = payoff(l)
                const kind = LIABILITY_KINDS.find((k) => k.kind === l.kind)!
                return (
                  <tr key={l.id} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <input
                        value={l.name}
                        placeholder={kind.label}
                        onChange={(e) => patch(l.id, { name: e.target.value })}
                        className="w-full bg-transparent font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:outline-none"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {kind.hint}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Cell
                        value={l.balance}
                        onChange={(v) => patch(l.id, { balance: v })}
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Cell
                        value={l.ratePercent}
                        onChange={(v) => patch(l.id, { ratePercent: v })}
                        suffix="%"
                        plain
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Cell
                        value={l.monthlyPayment}
                        onChange={(v) => patch(l.id, { monthlyPayment: v })}
                        prefix="$"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.balance === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : p.years === null ? (
                        /* The case worth catching: a payment at or below the
                           monthly interest clears nothing at all. */
                        <span className="font-medium text-destructive">
                          never
                          <span className="block text-[10px] font-normal">
                            {l.monthlyPayment > 0
                              ? `interest alone is ${money(annualInterest(l) / 12)} a month`
                              : 'nothing being paid at it'}
                          </span>
                        </span>
                      ) : (
                        <span className="text-foreground">
                          {p.years < 1
                            ? 'under a year'
                            : `${Math.round(p.years)} ${Math.round(p.years) === 1 ? 'year' : 'years'}`}
                          {p.interest !== null && p.interest > 0 && (
                            <span className="block text-[10px] font-normal text-muted-foreground">
                              {money(p.interest)} of interest
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="pl-3 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${l.name || kind.label}`}
                        onClick={() =>
                          onChange(liabilities.filter((x) => x.id !== l.id))
                        }
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {LIABILITY_KINDS.map((k) => (
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

      <p className="text-xs text-muted-foreground text-pretty">
        Interest on a student loan is deductible up to a limit and interest on a
        card is not; neither is modelled here, and nothing on this card reaches
        your retirement projection.
      </p>
    </Card>
  )
}

/** A figure edited in place, because a table of boxes is a form in disguise. */
function Cell({
  value,
  onChange,
  prefix,
  suffix,
  plain,
}: {
  value: number
  onChange: (v: number) => void
  prefix?: string
  suffix?: string
  plain?: boolean
}) {
  /**
   * What is being typed, while it is being typed.
   *
   * Without it the box shows a formatted figure straight back — "5,000" for
   * 5000 — and every keystroke has to survive being reformatted underneath the
   * caret. Held as text until the field is left, exactly as the money and
   * number fields on the holdings side already do.
   */
  const [text, setText] = useState<string | null>(null)
  const returning = useWindowReturn()

  return (
    <span className="inline-flex items-baseline justify-end gap-0.5">
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      <input
        inputMode="decimal"
        value={
          text ?? (value === 0 ? '' : plain ? String(value) : value.toLocaleString())
        }
        placeholder="0"
        // Clearing on the way in, like every other numeric box in the app.
        // These did not, so a balance of 5,000 that somebody clicked into and
        // typed 53 in became 500,053 — the same trap that turned an age into
        // 3053 on the household tile.
        onFocus={() => {
          // Coming back from another window is not a fresh edit. Wiping the
          // box then would throw away a figure the reader never touched.
          if (returning()) return
          setText('')
        }}
        onClick={() => setText('')}
        onBlur={() => setText(null)}
        onChange={(e) => {
          const el = e.target
          const typed = el.value.replace(/[^0-9.,]/g, '')
          // Grouped as it is typed, not only once the field is left. Holding
          // the raw digits in state meant a balance lost its commas the moment
          // anybody touched it and got them back on blur — the formatting
          // flickered on exactly the figures it exists to make readable.
          const digits = significantBefore(typed, el.selectionStart ?? typed.length)
          const formatted = plain ? typed.replace(/,/g, '') : withThousands(typed)
          setText(formatted)

          const numeric = formatted.replace(/,/g, '')
          const n = numeric === '' ? 0 : Number(numeric)
          onChange(Number.isFinite(n) ? n : 0)

          // Reformatting rewrites the whole string, which would park the caret
          // at the end after every keystroke. Count back to the same digit.
          if (!plain) {
            requestAnimationFrame(() => {
              const pos = caretAfter(formatted, digits)
              el.setSelectionRange(pos, pos)
            })
          }
        }}
        className="w-20 bg-transparent text-right tabular-nums text-foreground focus:outline-none"
      />
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </span>
  )
}
