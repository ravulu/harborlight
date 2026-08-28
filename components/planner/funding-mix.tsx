'use client'

import { useMemo } from 'react'
import { Area, AreaChart, ReferenceLine, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatCurrency, type PlanResult, type YearRow } from '@/lib/retirement'

/**
 * Where each retirement year's money comes from, one source at a time.
 *
 * The engine has always worked this out — `fromBrokerage`, `fromDeferred`,
 * `fromRoth` and `fromHsa` are on every row — and nothing showed it. The
 * question it answers is not "how much do I spend", which the plan already
 * asks, but "what is paying for it", which changes every few years on its own
 * and is the whole shape of an early retirement: the taxable money carries the
 * first stretch, then the 401(k) takes over, and the year that switch happens
 * is the year the tax and the health premium move.
 *
 * Small multiples rather than one stacked chart, and the reason is measurable
 * rather than aesthetic. Five bands stacked in the brand's single green family
 * fail an adjacent-pair separation check outright — the worst neighbouring
 * pair lands at ΔE 10.3 for normal vision, below the 15 floor, so a reader
 * with no colour vision deficiency at all cannot reliably tell them apart. One
 * panel per source needs no categorical palette: each is a single series, its
 * identity carried by the heading above it, and colour stops encoding anything.
 *
 * Each panel plots a *share* of the year rather than an amount, and that was
 * a correction rather than a first instinct. Drawn in dollars on one shared
 * scale — the honest way to compare magnitudes — a household with a large
 * 401(k) gets a single panel spiking to seven figures once distributions
 * start, and Social Security, the pension and the brokerage are all crushed
 * into flat slivers along the bottom. Every panel was truthful and three of
 * them were unreadable.
 *
 * A share puts every panel on the same 0–100% scale, which is genuinely shared
 * rather than nominally shared, and it happens to be the question people ask
 * out loud: "about half of it comes from cash". The amounts do not disappear —
 * the lifetime total is on the panel and the year's own dollars are in the
 * tooltip.
 */

const config = {
  share: { label: 'Share of the year', color: 'var(--chart-1)' },
} satisfies ChartConfig

/**
 * The sources, in the order a year actually reaches for them.
 *
 * Roth and HSA are one panel because the engine draws them as one pot and
 * splits the result afterwards — showing them apart would imply a choice
 * between them that nothing in the plan makes. Cash sits with the brokerage
 * for a blunter reason: today there is one taxable pot, and a household
 * holding cash enters it here with a gain share of nothing.
 */
const SOURCES: {
  key: string
  label: string
  of: (r: YearRow) => number
}[] = [
  { key: 'ss', label: 'Social Security', of: (r) => r.socialSecurity },
  { key: 'other', label: 'Pension and other income', of: (r) => r.otherIncome },
  { key: 'taxable', label: 'Cash and brokerage', of: (r) => r.fromBrokerage },
  { key: 'deferred', label: '401(k) and IRA', of: (r) => r.fromDeferred },
  { key: 'free', label: 'Roth and HSA', of: (r) => r.fromRoth + r.fromHsa },
]

export function FundingMix({ result }: { result: PlanResult }) {
  const panels = useMemo(() => {
    const rows = result.rows.filter((r) => r.phase === 'retirement')
    // What the year had, which is what a share is a share of. The three
    // withdrawal figures sum to `withdrawals` by construction, so this counts
    // every dollar once.
    const totals = rows.map((r) => r.socialSecurity + r.otherIncome + r.withdrawals)

    return (
      SOURCES.map((s) => {
        const data = rows.map((r, i) => {
          const amount = Math.max(0, s.of(r))
          return {
            age: r.age,
            amount,
            // A year that funds itself out of nothing has no shares to
            // report, rather than a division by zero to render.
            share: totals[i] > 0 ? amount / totals[i] : 0,
          }
        })
        return { ...s, data, total: data.reduce((sum, d) => sum + d.amount, 0) }
      })
        // A source this household does not have is not an empty chart worth
        // drawing. Nobody needs to be shown a flat line labelled "pension" to
        // learn they have no pension.
        .filter((p) => p.total >= 1)
    )
  }, [result])

  if (panels.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-base font-medium text-foreground">
          Where it comes from
        </h3>
        <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
          Every retirement year, split by what paid for it. Each panel is that
          source&rsquo;s share of the year, on the same nought-to-all scale, so
          the year the work passes from one source to the next is the year the
          shapes cross over. Shares are of the money the year had before tax
          and premiums, which come out of these figures rather than sit on top
          of them. The dashed line across each panel is half the year. Hover
          for the dollars, or read the Yearly detail tab, which has the same
          figures as a table.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {panels.map((p) => (
          <div
            key={p.key}
            className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card/40 p-3"
          >
            {/* Labelled rather than legended. One series per panel means the
                heading is the identity, and a legend would be a box repeating
                what is already written above the chart it describes. */}
            <div className="flex flex-col">
              <span className="truncate text-xs font-medium text-foreground">
                {p.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatCurrency(p.total, { compact: true })} over the plan
              </span>
            </div>

            <ChartContainer config={config} className="aspect-auto h-[88px] w-full">
              <AreaChart data={p.data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                <XAxis
                  dataKey="age"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  minTickGap={28}
                  tick={{ fontSize: 10 }}
                />
                {/* Hidden, but pinned to the whole of the year — the axis is
                    off because five of them repeated across a grid is noise,
                    not because each panel may pick its own scale. */}
                <YAxis hide domain={[0, 1]} />
                {/* The one gridline worth drawing. Without it a band filling
                    two thirds of the panel and one filling half look alike,
                    and "about half of it" is the sentence this answers. */}
                <ReferenceLine y={0.5} stroke="var(--border)" strokeDasharray="3 3" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      // The age comes off the row rather than `label`, which
                      // the tooltip only trusts when it is a string — the same
                      // trap the income chart documents.
                      labelFormatter={(_, payload) =>
                        `Age ${payload?.[0]?.payload?.age ?? ''}`.trim()
                      }
                      formatter={(value, _name, item) => (
                        <div className="flex w-full items-center justify-between gap-4">
                          <span className="text-muted-foreground">{p.label}</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {Math.round(Number(value) * 100)}% ·{' '}
                            {formatCurrency(Number(item?.payload?.amount ?? 0))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="share"
                  stroke="var(--color-share)"
                  fill="var(--color-share)"
                  fillOpacity={0.7}
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ))}
      </div>
    </div>
  )
}
