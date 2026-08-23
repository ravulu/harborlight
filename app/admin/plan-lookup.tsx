'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { lookupPlansByEmail, type PlanHit } from '@/app/actions/admin'
import { Card } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/retirement'
import { Search, ArrowRight } from 'lucide-react'

export function PlanLookup() {
  const [email, setEmail] = useState('')
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{
    searched: string
    found: boolean
    owner?: { email: string; name: string }
    plans: PlanHit[]
  } | null>(null)

  const run = () => {
    const term = email.trim()
    if (!term) return
    startTransition(async () => {
      const r = await lookupPlansByEmail(term)
      setResult({ searched: term, ...r })
    })
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex flex-col gap-1 border-b border-border p-5">
        <h2 className="font-serif text-lg font-medium text-foreground">
          Plans by email
        </h2>
        <p className="text-sm text-muted-foreground">
          Every plan saved by one account.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 border-b border-border p-5"
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="lookupEmail" className="text-xs text-muted-foreground">
            Account email
          </Label>
          <Input
            id="lookupEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="someone@example.com"
            className="h-9"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="gap-2 px-4"
          disabled={pending || !email.trim()}
        >
          <Search className="size-4" />
          {pending ? 'Looking…' : 'Find plans'}
        </Button>
      </form>

      {result && (
        <div className="p-5">
          {!result.found ? (
            <p className="text-sm text-muted-foreground">
              No account with that address.{' '}
              <span className="text-muted-foreground/70">
                Searched {result.searched}.
              </span>
            </p>
          ) : result.plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {result.owner?.name || result.owner?.email} has an account but no
              saved plans.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {result.plans.length}{' '}
                {result.plans.length === 1 ? 'plan' : 'plans'} for{' '}
                <span className="font-medium text-foreground">
                  {result.owner?.name}
                </span>{' '}
                ({result.owner?.email})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 text-left font-medium">Plan</th>
                      <th className="py-2 pr-4 text-left font-medium">For</th>
                      <th className="py-2 pr-4 text-right font-medium">Age</th>
                      <th className="py-2 pr-4 text-right font-medium">Retires</th>
                      <th className="py-2 pr-4 text-right font-medium">Spending</th>
                      <th className="py-2 pr-4 text-left font-medium">Updated</th>
                      <th className="py-2 text-right font-medium">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.plans.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-foreground">
                          {p.name}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {p.personName || '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-foreground/80">
                          {p.currentAge}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-foreground/80">
                          {p.retirementAge}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-foreground/80">
                          {formatCurrency(p.monthlyRetirementSpending)}/mo
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">
                          {p.updatedAt.slice(0, 10)}
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            href={`/admin/plan/${p.id}`}
                            className={buttonVariants({
                              variant: 'outline',
                              size: 'xs',
                              className: 'gap-1',
                            })}
                          >
                            View <ArrowRight className="size-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
