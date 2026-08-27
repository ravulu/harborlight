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

/**
 * One figure and what it is, small enough to sit in a row.
 *
 * The list used to say it in a sentence — "Retire at 65 · $1.2M projected ·
 * lasts through 92" — which reads fine for one plan and cannot be scanned down
 * a column for six. Figures in fixed places can be compared without reading.
 */
function Stat({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  return (
    <div className="flex w-20 shrink-0 flex-col leading-tight">
      <span className={cn('text-sm font-medium tabular-nums', className)}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function PlanRow({
  c,
  first,
  selected,
  onToggle,
}: {
  c: Computed
  /** No rule above the first row: the card's own edge is already there. */
  first: boolean
  selected: boolean
  onToggle: (id: number) => void
}) {
  const plan = c.plan
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const lasts = c.result.lastsThroughRetirement
  const confidence = Math.round(c.mc.successRate * 100)
  const money = formatCurrency(c.mc.balanceAtRetirement.median, { compact: true })
  const ends = lasts ? `to ${plan.endAge}` : `out at ${c.result.depletionAge}`

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors',
        !first && 'border-t border-border',
        selected ? 'bg-accent/40' : 'hover:bg-muted/40',
      )}
    >
      {/* Labelled by name, so a screen reader says which plan it is picking. */}
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(plan.id)}
        aria-label={`Compare ${plan.name}`}
        className="size-4 shrink-0 cursor-pointer accent-primary"
      />

      <span className={cn('shrink-0', lasts ? 'text-primary' : 'text-destructive')}>
        {lasts ? (
          <CircleCheck className="size-4" />
        ) : (
          <CircleAlert className="size-4" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate font-medium text-foreground">{plan.name}</span>
        {/* The same figures as a sentence, for a screen too narrow to column
            them. Below `lg` the four stats are hidden rather than wrapped:
            a row that wraps stops being a row. */}
        <span className="truncate text-xs text-muted-foreground lg:hidden">
          {confidence}% · retires {plan.retirementAge} · {money} · lasts {ends}
        </span>
      </div>

      <div className="hidden items-center gap-4 lg:flex">
        <Stat
          value={`${confidence}%`}
          label="Confidence"
          className={confidence >= 90 ? 'text-primary' : undefined}
        />
        <Stat value={String(plan.retirementAge)} label="Retires" />
        {/* "Projected", not "At retirement": thirteen letter-spaced characters
            do not fit the column, and the sentence this replaced called it
            projected too. */}
        <Stat value={money} label="Projected" />
        <Stat
          value={ends}
          label="Lasts"
          className={lasts ? undefined : 'text-destructive'}
        />
      </div>

      <Link
        href={`/planner?plan=${plan.id}`}
        className={buttonVariants({
          size: 'lg',
          variant: 'outline',
          className: 'group shrink-0 gap-1.5',
        })}
      >
        Open
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Two presses, not one. Plans have gone missing from this account before
          and nothing in the code could account for it; a delete that happens on
          the first click of a small icon beside an Open button is at least a
          candidate. Asking costs a second and rules it out. */}
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deletePlan(plan.id)
                router.refresh()
              })
            }
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            No
          </Button>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon-lg"
          className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${plan.name}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
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
      {/* One card, ruled between rows, rather than a card each. Six plans meant
          six borders and six lots of padding for six lines of text, and the
          figures never lined up with each other because every card sized
          itself. */}
      <Card className="gap-0 overflow-hidden p-0">
      {computed.map((c, i) => (
        <PlanRow
          key={c.plan.id}
          c={c}
          first={i === 0}
          selected={picked.includes(c.plan.id)}
          onToggle={(id) => {
            toggle(id)
            // Dropping below two leaves nothing to compare.
            if (showing && picked.includes(id) && picked.length <= 2) setShowing(false)
          }}
        />
      ))}
      </Card>
    </div>
  )
}
