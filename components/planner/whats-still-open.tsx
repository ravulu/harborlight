'use client'

import { useMemo } from 'react'

import { Card } from '@/components/ui/card'
import { openWindows } from '@/lib/windows'
import type { PlanInputs, PlanResult } from '@/lib/retirement'

/**
 * Doors with dates on them.
 *
 * Kept apart from "Worth looking at" because the two make different promises.
 * That card observes — here is something notable about your plan. This one
 * only says a choice exists and when it stops existing, and never what to do
 * with it. Mixing the two would cost the second its whole claim.
 *
 * Self-contained on purpose: one engine file, one component, and four lines in
 * the planner. Removing it is deleting two files and reverting those lines.
 */
export function WhatsStillOpen({
  inputs,
  result,
}: {
  inputs: PlanInputs
  result: PlanResult
}) {
  const windows = useMemo(() => openWindows(inputs, result), [inputs, result])
  if (windows.length === 0) return null

  return (
    <Card className="p-6 gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-medium text-foreground">
          What&apos;s still open
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Choices your plan can still make, and the age each one stops being
          available. These are the rules and their dates — not a view about
          which of them you should take.
        </p>
      </div>

      <ul className="flex flex-col gap-5">
        {windows.map((w) => (
          <li key={w.key} className="flex flex-col gap-1.5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <p className="font-medium text-foreground text-pretty">
                {w.title}
              </p>
              {/* The date, given its own weight. It is the reason the item is
                  on this card rather than any other. */}
              <span className="shrink-0 rounded-full bg-accent/60 px-2.5 py-0.5 text-xs font-medium tabular-nums text-foreground/80">
                {w.window}
              </span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed text-justify hyphens-auto">
              {w.body}
            </p>
            {w.oneWay && (
              <p className="rounded-md border-l-2 border-primary/40 bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground text-justify hyphens-auto">
                <span className="font-medium text-foreground">
                  What you cannot undo.
                </span>{' '}
                {w.oneWay}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground text-pretty">
        Dates and rules as they stand today, applied to the ages in your plan.
        Congress changes all of them from time to time, and nothing here is
        advice about what to do inside any of these windows.
      </p>
    </Card>
  )
}
