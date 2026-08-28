'use client'

import { useMemo } from 'react'
import type { PlanSummary } from '@/lib/store'
import { simulate, formatCurrency, type PlanInputs } from '@/lib/retirement'
import { runMonteCarlo } from '@/lib/monte-carlo'
export type { PlanInputs }
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { X, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const money = (v: number) => formatCurrency(Math.round(v), { compact: true })

/**
 * One row of the comparison.
 *
 * `better` says which direction wins, and only for the measures where a
 * direction exists: a bigger pot is better, a bigger tax bill is not
 * necessarily worse — it usually means more was spent.
 */
interface Measure {
  label: string
  /** the figure to compare on, when there is one */
  value: (c: Computed) => number | null
  /** what the reader sees */
  render: (c: Computed) => string
  better?: 'high' | 'low'
  note?: string
}

export interface Computed {
  /**
   * The stored plan, which is a summary rather than a database row — the
   * compare table has no business knowing whether these came from Postgres or
   * from the reader's own browser. Every figure below reads `inputs`; only the
   * name and the id come off the plan itself.
   */
  plan: PlanSummary
  inputs: PlanInputs
  result: ReturnType<typeof simulate>
  mc: ReturnType<typeof runMonteCarlo>
}

const MEASURES: Measure[] = [
  {
    label: 'Retires at',
    value: () => null,
    render: (c) => String(c.inputs.retirementAge),
    note: 'Not a score: retiring earlier costs confidence, which the row below shows.',
  },
  {
    label: 'Confidence',
    value: (c) => c.mc.successRate,
    render: (c) => `${Math.round(c.mc.successRate * 100)}%`,
    better: 'high',
    note: 'Share of simulated runs whose money lasted the whole plan.',
  },
  {
    label: 'Pot at retirement',
    value: (c) => c.mc.balanceAtRetirement.median,
    render: (c) => money(c.mc.balanceAtRetirement.median),
    better: 'high',
    note: 'The middle outcome, in today’s dollars.',
  },
  {
    label: 'Monthly spending',
    value: () => null,
    render: (c) => formatCurrency(c.inputs.monthlyRetirementSpending),
  },
  {
    label: 'Money lasts',
    // A plan that lasts is scored past the end, so it beats every plan that
    // runs out no matter how late.
    value: (c) =>
      c.result.lastsThroughRetirement ? c.inputs.endAge + 1 : (c.result.depletionAge ?? 0),
    render: (c) =>
      c.result.lastsThroughRetirement
        ? `through ${c.inputs.endAge}`
        : `runs out at ${c.result.depletionAge}`,
    better: 'high',
  },
  {
    label: 'Social Security',
    value: () => null,
    render: (c) =>
      c.inputs.socialSecurityMonthly > 0
        ? `${formatCurrency(c.inputs.socialSecurityMonthly)}/mo from ${c.inputs.socialSecurityAge}`
        : 'none',
  },
  {
    label: 'Saving now',
    value: () => null,
    render: (c) => `${formatCurrency(c.inputs.monthlyContribution)}/mo`,
  },
  {
    label: 'Lifetime tax',
    value: () => null,
    render: (c) => money(c.result.totalTaxes),
    note: 'Not a score: a smaller bill usually means less was spent.',
  },
]

export function PlanCompare({
  computed,
  onRemove,
  onClear,
}: {
  /** Worked out once by the list, so a row and a column cannot disagree. */
  computed: Computed[]
  onRemove: (id: number) => void
  onClear: () => void
}) {
  const plans = computed.map((c) => c.plan)

  // Which column wins each measure, where winning means anything. A row where
  // every plan agrees has no winner to mark.
  const winners = useMemo(() => {
    const map = new Map<string, Set<number>>()
    for (const m of MEASURES) {
      if (!m.better) continue
      const vals = computed.map((c) => m.value(c))
      if (vals.some((v) => v === null)) continue
      const nums = vals as number[]
      const best = m.better === 'high' ? Math.max(...nums) : Math.min(...nums)
      if (nums.every((v) => v === best)) continue
      const won = new Set(
        nums.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0),
      )
      // Two plans can differ underneath and still print the same thing once
      // rounded. Marking one of a pair that both read "$4.1M" as the winner
      // looks like a fault in the table rather than a difference in the plans.
      const shown = computed.map((c) => m.render(c))
      const wonText = new Set([...won].map((i) => shown[i]))
      if (shown.some((t, i) => !won.has(i) && wonText.has(t))) continue
      map.set(m.label, won)
    }
    return map
  }, [computed])

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-serif text-lg font-medium text-foreground">
            Comparing {plans.length} plans
          </h2>
          <p className="text-sm text-muted-foreground">
            Where one plan clearly wins a row, it is marked.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5">
          <X className="size-3.5" /> Clear
        </Button>
      </div>

      {/* Scrolls on its own so the page never does. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="w-40 px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Measure
              </th>
              {computed.map((c) => (
                <th key={c.plan.id} className="px-4 py-3 text-left align-bottom">
                  <div className="flex flex-col items-start gap-1.5">
                    <span className="font-medium text-foreground">
                      {c.plan.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/planner?plan=${c.plan.id}`}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'xs',
                          className: 'gap-1',
                        })}
                      >
                        Open <ArrowRight className="size-3" />
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${c.plan.name} from the comparison`}
                        onClick={() => onRemove(c.plan.id)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEASURES.map((m) => {
              const won = winners.get(m.label)
              return (
                <tr key={m.label} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className="px-5 py-3 text-left align-top font-normal text-muted-foreground"
                  >
                    {m.label}
                    {m.note ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground/70 text-pretty">
                        {m.note}
                      </span>
                    ) : null}
                  </th>
                  {computed.map((c, i) => (
                    <td
                      key={c.plan.id}
                      className={cn(
                        'px-4 py-3 align-top tabular-nums',
                        won?.has(i)
                          ? 'font-medium text-primary'
                          : 'text-foreground/80',
                      )}
                    >
                      {m.render(c)}
                      {won?.has(i) ? (
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-primary/70">
                          best
                        </span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
