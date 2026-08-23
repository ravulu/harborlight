'use client'

import type { MonteCarloResult } from '@/lib/monte-carlo'
import { cn } from '@/lib/utils'

/**
 * The 70–90% band is the usual target in planning software. Below it a plan
 * leans on luck; far above it usually means underspending rather than safety,
 * since the money is being left behind rather than used.
 */
function level(percent: number) {
  if (percent >= 90) return { word: 'Very high', weak: false }
  if (percent >= 70) return { word: 'Healthy', weak: false }
  if (percent >= 50) return { word: 'Borderline', weak: true }
  return { word: 'Low', weak: true }
}

function Stat({
  value,
  label,
  accent,
}: {
  value: string
  label: string
  accent?: string
}) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          'text-2xl font-semibold leading-none tabular-nums',
          accent ?? 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

export function ConfidenceBadge({
  monteCarlo,
  endAge,
}: {
  monteCarlo: MonteCarloResult
  endAge: number
}) {
  const percent = Math.round(monteCarlo.successRate * 100)
  const { word, weak } = level(percent)
  const survived = Math.round(monteCarlo.successRate * monteCarlo.runs)

  return (
    // Width is pinned: the paragraph below has no natural wrapping point, so
    // an auto-width flex item would stretch to the whole row.
    <div className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 sm:w-[23rem]">
      <div className="flex items-center gap-4">
        <Stat
          value={`${percent}%`}
          label="Confidence"
          accent={weak ? 'text-destructive' : 'text-primary'}
        />
        <span className="h-9 w-px shrink-0 bg-border" />
        <Stat value={monteCarlo.runs.toLocaleString()} label="Simulations" />
        <span
          className={cn(
            'ml-auto rounded-full px-2.5 py-1 text-xs font-medium',
            weak
              ? 'bg-destructive/10 text-destructive'
              : 'bg-primary/10 text-primary',
          )}
        >
          {word}
        </span>
      </div>
      <p className="mt-3 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
        {survived.toLocaleString()} runs still had money at {endAge}. Each draws its
        own sequence of yearly returns around your averages.
      </p>
    </div>
  )
}
