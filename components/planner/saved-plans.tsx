'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { RetirementPlan } from '@/lib/db/schema'
import { formatCurrency } from '@/lib/retirement'
import { simulate } from '@/lib/retirement'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { planToInputs } from '@/lib/plan'
import { deletePlan } from '@/app/actions/plans'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Trash2, ArrowRight, CircleCheck, CircleAlert, Plus, Columns3 } from 'lucide-react'
import { PlanCompare, type Computed } from './plan-compare'
import { cn } from '@/lib/utils'

function PlanRow({
  c,
  selected,
  onToggle,
}: {
  c: Computed
  selected: boolean
  onToggle: (id: number) => void
}) {
  const plan = c.plan
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const result = c.result
  const lasts = result.lastsThroughRetirement

  return (
    <Card
      className={cn(
        'p-5 gap-4 transition-colors sm:flex-row sm:items-center sm:justify-between',
        selected && 'border-primary/40 bg-accent/30',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* The control that puts a plan in the comparison. Labelled by name so
            a screen reader says which plan it is picking. */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(plan.id)}
          aria-label={`Compare ${plan.name}`}
          className="size-4 shrink-0 cursor-pointer accent-primary"
        />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={lasts ? 'text-primary' : 'text-destructive'}>
            {lasts ? (
              <CircleCheck className="size-4" />
            ) : (
              <CircleAlert className="size-4" />
            )}
          </span>
          <h3 className="font-medium text-foreground">{plan.name}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Retire at {plan.retirementAge} ·{' '}
          {formatCurrency(c.mc.balanceAtRetirement.median, { compact: true })} projected ·{' '}
          {lasts ? `lasts through ${plan.endAge}` : `runs out at ${result.depletionAge}`}
        </p>
      </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/planner?plan=${plan.id}`}
          className={buttonVariants({
            size: 'lg',
            className:
              'group gap-1.5 px-4 shadow-sm transition-transform hover:-translate-y-px',
          })}
        >
          Open
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${plan.name}`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await deletePlan(plan.id)
              router.refresh()
            })
          }
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </Card>
  )
}

export function SavedPlans({ plans }: { plans: RetirementPlan[] }) {
  // Simulated once here rather than in each row and again in each column: two
  // components working the same plan out separately is how they end up
  // quoting different figures for it.
  const computed = useMemo<Computed[]>(
    () =>
      plans.map((plan) => {
        const inputs = planToInputs(plan)
        return { plan, inputs, result: simulate(inputs), mc: runMonteCarlo(inputs) }
      }),
    [plans],
  )
  const [picked, setPicked] = useState<number[]>([])
  const toggle = (id: number) =>
    setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  // Kept in the order they were picked, so the columns do not reshuffle when
  // one is removed.
  const selected = useMemo(
    () =>
      picked
        .map((id) => computed.find((c) => c.plan.id === id))
        .filter((c): c is Computed => !!c),
    [picked, computed],
  )
  const [showing, setShowing] = useState(false)
  const comparing = showing && selected.length >= 2

  if (plans.length === 0) {
    return (
      <Card className="p-10 items-center text-center gap-3">
        <p className="font-medium text-foreground">No saved plans yet</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Build a projection in the planner and save it to track different retirement
          scenarios side by side.
        </p>
        <Link
          href="/planner"
          className={buttonVariants({
            size: 'lg',
            className: 'mt-2 gap-2 px-4 shadow-sm',
          })}
        >
          <Plus className="size-4" /> Create your first plan
        </Link>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {comparing && (
        <PlanCompare
          computed={selected}
          onRemove={toggle}
          onClear={() => {
            setPicked([])
            setShowing(false)
          }}
        />
      )}
      {/* Only once picking has begun: an empty bar above an untouched list is
          a control asking to be explained. */}
      {picked.length > 0 && !comparing && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-accent/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {selected.length === 1
              ? 'Pick one more plan to compare against.'
              : `${selected.length} plans picked.`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPicked([])}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={selected.length < 2}
              onClick={() => setShowing(true)}
            >
              <Columns3 className="size-3.5" /> Compare
            </Button>
          </div>
        </div>
      )}
      {computed.map((c) => (
        <PlanRow
          key={c.plan.id}
          c={c}
          selected={picked.includes(c.plan.id)}
          onToggle={(id) => {
            toggle(id)
            // Dropping below two leaves nothing to compare.
            if (showing && picked.includes(id) && picked.length <= 2) setShowing(false)
          }}
        />
      ))}
    </div>
  )
}
