'use client'

import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import type { PlanInputs, PlanResult } from '@/lib/retirement'
import { formatCurrency } from '@/lib/retirement'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

// The brand palette is all one green family, which stacked bands cannot be
// told apart in without being chosen carefully. These four were checked rather
// than judged: every adjacent pair clears the normal-vision and colour-vision
// separation floors in both themes, which the obvious assignment — the two
// mid-greens next to each other — does not. Keep the slots if a colour here
// ever changes, and re-check the neighbours.
//
// Greens separated by lightness for money that reaches you, and a neutral for
// the tax, which is not yours to spend — so reading differently is the point.
// The darkest band sits under 3:1 against the surface, which is why the legend
// labels it and the Yearly detail tab carries the same figures as a table.
const config = {
  socialSecurity: { label: 'Social Security', color: 'var(--chart-4)' },
  otherIncome: { label: 'Pension and other income', color: 'var(--chart-1)' },
  kept: { label: 'Withdrawal kept', color: 'var(--chart-5)' },
  taxes: { label: 'Tax', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

/**
 * Where each retirement year's money comes from, and what tax takes off the
 * top. Stacked so the bands sum to the gross income for that year: the
 * balance chart cannot show any of this.
 *
 * Pension and other income is a band of its own. It funds a year exactly as
 * the benefit does, and for a while it was on no band at all — so a household
 * with a pension or a rental was shown a chart that understated its own income
 * and gave no hint which part was missing.
 *
 * This splits the year by *character*: money that arrives, money drawn from
 * savings, and tax. `FundingMix` below splits the same year by *account*,
 * which is the other question and needs a different form to answer.
 */
export function IncomeChart({
  result,
  inputs,
}: {
  result: PlanResult
  inputs: PlanInputs
}) {
  const data = useMemo(
    () =>
      result.rows
        .filter((r) => r.phase === 'retirement')
        .map((r) => ({
          age: r.age,
          socialSecurity: Math.round(r.socialSecurity),
          otherIncome: Math.round(r.otherIncome),
          kept: Math.round(Math.max(0, r.withdrawals - r.taxes)),
          taxes: Math.round(r.taxes),
        })),
    [result],
  )

  if (data.length === 0) {
    return (
      <p className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        This plan has no retirement years to show.
      </p>
    )
  }

  const benefitStarts = Math.max(inputs.socialSecurityAge, inputs.retirementAge)
  const showsBenefit =
    inputs.socialSecurityMonthly > 0 && benefitStarts <= inputs.endAge

  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="age"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => formatCurrency(v, { compact: true })}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              // The age, taken from the row rather than from `label`: the
              // tooltip only trusts `label` when it is a string, and an age is
              // a number — so it was falling through to the series name and
              // rendering "Age Range of outcomes".
              labelFormatter={(_, payload) =>
                `Age ${payload?.[0]?.payload?.age ?? ''}`.trim()
              }
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        {showsBenefit && (
          <ReferenceLine
            x={benefitStarts}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{
              value: 'Benefits start',
              position: 'insideTopRight',
              fill: 'var(--muted-foreground)',
              fontSize: 11,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="socialSecurity"
          stackId="income"
          stroke="var(--color-socialSecurity)"
          fill="var(--color-socialSecurity)"
          fillOpacity={0.8}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="otherIncome"
          stackId="income"
          stroke="var(--color-otherIncome)"
          fill="var(--color-otherIncome)"
          fillOpacity={0.8}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="kept"
          stackId="income"
          stroke="var(--color-kept)"
          fill="var(--color-kept)"
          fillOpacity={0.75}
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="taxes"
          stackId="income"
          stroke="var(--color-taxes)"
          fill="var(--color-taxes)"
          fillOpacity={0.35}
          strokeWidth={1.5}
        />
      </AreaChart>
    </ChartContainer>
  )
}
