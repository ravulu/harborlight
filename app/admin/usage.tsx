'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Activity } from 'lucide-react'

import { getUsage, type UsageSummary } from '@/app/actions/admin'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDay(d)
}

const RANGES = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 6 },
  { label: 'Last 30 days', days: 29 },
  { label: 'Last 90 days', days: 89 },
]

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * Where visits get to, and where they stop.
 *
 * Counted in visits rather than rows, because someone who opened the planner
 * six times is one person deciding rather than six. The drop between any two
 * steps is the number worth looking at — the totals matter far less than where
 * the cliff is.
 */
export function Usage() {
  const [days, setDays] = useState(6)
  const [data, setData] = useState<UsageSummary | null>(null)
  const [pending, startTransition] = useTransition()

  const load = useCallback((n: number) => {
    startTransition(async () => {
      setData(await getUsage(daysAgo(n), daysAgo(0)))
    })
  }, [])

  useEffect(() => {
    load(days)
  }, [days, load])

  return (
    <Card className="p-6 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h2 className="font-serif text-lg font-medium text-foreground">Usage</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.label}
              size="sm"
              variant={days === r.days ? 'default' : 'outline'}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {pending && !data ? (
        <p className="text-sm text-muted-foreground">Counting…</p>
      ) : !data || data.visits === 0 ? (
        <p className="text-sm text-muted-foreground text-pretty">
          Nothing recorded in this window yet. Visits appear here as people use
          the app — no figure anybody types is ever stored.
        </p>
      ) : (
        <div className={cn('flex flex-col gap-5', pending && 'opacity-60')}>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {data.visits.toLocaleString()} visits
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {data.steps.map((s, i) => {
                const prev = i > 0 ? data.steps[i - 1] : null
                const dropped = prev ? prev.visits - s.visits : 0
                return (
                  <li key={s.name} className="flex flex-col gap-0.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-foreground">{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {s.visits.toLocaleString()}{' '}
                        <span className="text-xs">({pct(s.share)})</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.max(1, s.share * 100)}%` }}
                      />
                    </div>
                    {prev && dropped > 0 && (
                      <p className="text-[11px] text-destructive">
                        {dropped.toLocaleString()} stopped here
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Bounced
              </p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {pct(data.bounceRate)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                one page, nothing after
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Never signed in
              </p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {data.anonymousVisits.toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {data.anonymousCompleted.toLocaleString()} of them saw a
                projection
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Reached the end
              </p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {pct(data.steps.at(-1)?.share ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">saved a plan</p>
            </div>
          </div>

          {data.places.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Where from
              </p>
              <ul className="mt-1.5 grid gap-1 text-sm sm:grid-cols-2">
                {data.places.map((p) => (
                  <li
                    key={`${p.country}-${p.region}-${p.city}`}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="truncate text-foreground">
                      {[p.city, p.region, p.country].filter(Boolean).join(', ')}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.visits.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                From the edge headers on the request. No address is stored.
              </p>
            </div>
          )}

          {(data.pages.length > 0 || data.referrers.length > 0) && (
            <div className="grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Pages
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                  {data.pages.map((p) => (
                    <li
                      key={p.path}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate text-foreground">{p.path}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {p.visits.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Came from
                </p>
                {data.referrers.length === 0 ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Everyone arrived directly.
                  </p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                    {data.referrers.map((r) => (
                      <li
                        key={r.source}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="truncate text-foreground">
                          {r.source}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {r.visits.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
