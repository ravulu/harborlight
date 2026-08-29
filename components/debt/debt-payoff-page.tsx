'use client'

import { useState } from 'react'
import Link from 'next/link'

import { DebtPayoffCalculator, blankDebt } from '@/components/debt/debt-payoff-calculator'
import { buttonVariants } from '@/components/ui/button'
import type { Liability } from '@/lib/liabilities'
import { record } from '@/lib/usage'

/**
 * The standalone calculator: somebody who arrived from a search.
 *
 * Owns its own debts and **stores nothing**. Figures live in the page and a
 * refresh clears them — the rule `lib/holdings-store.ts` already states for a
 * signed-out balance sheet, and for the same reason: a browser that remembers
 * somebody's debts shows them to whoever opens it next.
 *
 * A mortgage can go in here as an ordinary row. Nothing on this page touches
 * the register, so it costs nothing to allow, and it is the debt people
 * arriving from a search most want to include.
 *
 * The handoff goes one way, into the plan, mirroring what the savings goal
 * page already does. The reverse would be a second copy of the same debts.
 */
export function DebtPayoffPage() {
  const [debts, setDebts] = useState<Liability[]>([blankDebt()])
  const usable = debts.filter((d) => d.balance > 0).length

  return (
    <DebtPayoffCalculator
      debts={debts}
      onChange={(next) => {
        setDebts(next)
        // Once per visit, on the first debt worth calculating — the same
        // contract `goal_answered` keeps. A milestone, never a figure.
        if (next.some((d) => d.balance > 0)) {
          record('debt_answered', undefined, true)
        }
      }}
      footer={
        usable > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-4">
            <p className="text-sm text-foreground text-pretty">
              Debt is only half the picture. The planner covers the other
              half: what you own, what it earns, and whether it lasts.
            </p>
            <p className="text-xs text-muted-foreground text-pretty">
              Nothing on this page is saved, so your debts will not come
              with you. Add them again in the planner under Assets &amp;
              liabilities, and you will find this same calculator there.
            </p>
            <Link
              href="/planner?tab=assets"
              onClick={() => record('debt_handoff')}
              className={buttonVariants({ size: 'sm', className: 'w-fit gap-2' })}
            >
              Open the planner
            </Link>
          </div>
        ) : null
      }
    />
  )
}
