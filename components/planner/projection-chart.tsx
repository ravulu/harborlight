'use client'

import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '@/lib/retirement'
import type { MonteCarloResult } from '@/lib/monte-carlo'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'

const config = {
  band: { label: 'Range of outcomes', color: 'var(--chart-2)' },
  median: { label: 'Median outcome', color: 'var(--chart-1)' },
} satisfies ChartConfig

/** One labelled outcome in the tooltip. */
function Outcome({
  label,
  value,
  strong,
}: {
  label: string
  value: number
  strong?: boolean
}) {
  return (
    <div className="flex w-full items-baseline justify-between gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular-nums',
          strong ? 'font-medium text-foreground' : 'text-foreground/80',
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  )
}

/**
 * What a year came out as, named rather than described.
 *
 * The band was one row reading "$645,259 – $1,527,822", which asks the reader
 * to work out which end is which, and the return was repeated in braces on
 * every line where it is the same figure twice. Three labelled rows and one
 * sentence underneath say the same thing without either.
 */
function ProjectionTooltip({
  active,
  payload,
  retirementAge,
  returns,
}: {
  active?: boolean
  payload?: { payload: { age: number; band: [number, number]; median: number } }[]
  retirementAge: number
  returns: {
    saving: number
    savingVolatility: number
    retired: number
    retiredVolatility: number
  }
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null

  // The assumptions in force at this age, not the plan's averages: they change
  // at retirement, which is why the band changes shape there.
  const saving = row.age < retirementAge
  const rate = saving ? returns.saving : returns.retired
  const swing = saving ? returns.savingVolatility : returns.retiredVolatility

  return (
    <div className="grid min-w-[15rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground">Age {row.age}</p>
      <Outcome label="Best 10%" value={row.band[1]} />
      <Outcome label="Middle" value={row.median} strong />
      <Outcome label="Worst 10%" value={row.band[0]} />
      <p className="mt-0.5 border-t border-border pt-1.5 text-muted-foreground text-pretty">
        {saving ? 'While saving' : 'In retirement'}, this assumes {rate}% a year
        on average, with the good and bad years about {swing}% either side of it.
      </p>
    </div>
  )
}

/**
 * The spread of outcomes across every simulated run: the shaded band holds the
 * middle 80%, the line is the median. A single line would imply the future is
 * known, which is the thing a simulation exists to deny.
 */
/**
 * Chart geometry, named because the retirement label needs it too.
 *
 * The label is centred on the marker, and the marker clamps to the first year
 * on the chart when a plan is already retired — so without knowing where the
 * plot starts, the pill would hang off the left edge over the y-axis figures.
 */
const CHART_MARGIN = { left: 4, right: 8, top: 16, bottom: 0 }
const Y_AXIS_WIDTH = 48
const PLOT_LEFT = CHART_MARGIN.left + Y_AXIS_WIDTH

/**
 * The marker that says where saving stops and drawing down starts.
 *
 * A filled pill carrying both the event and the age, sat on top of the line
 * rather than floating at the top of the plot. It used to be the bare word
 * "Retire" positioned `insideTopRight`, which put it level with the highest
 * y-axis figure while its dashes began well below — so it read as part of the
 * axis, and never said which age it meant. Every other label on this chart is
 * a quantity; this makes the marker one too.
 */
function RetireMarker({
  viewBox,
  age,
}: {
  viewBox?: { x?: number; y?: number }
  age: number
}) {
  if (!viewBox || viewBox.x === undefined || viewBox.y === undefined) return null
  const text = `Retire at ${age}`
  // Estimated rather than measured: the string is always "Retire at" plus two
  // digits, so one constant per character is stable enough and avoids a
  // layout pass just to size a pill.
  const width = text.length * 6.1 + 18
  const cx = Math.max(viewBox.x, PLOT_LEFT + width / 2)

  return (
    <g aria-hidden>
      <rect
        x={cx - width / 2}
        y={viewBox.y - 9}
        width={width}
        height={19}
        rx={9.5}
        fill="var(--primary)"
      />
      <text
        x={cx}
        y={viewBox.y + 4.5}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill="var(--primary-foreground)"
      >
        {text}
      </text>
    </g>
  )
}

export function ProjectionChart({
  monteCarlo,
  retirementAge,
  returns,
}: {
  monteCarlo: MonteCarloResult
  retirementAge: number
  /**
   * The assumptions the fan was drawn from. Shown beside each figure, because
   * the spread is a consequence of them rather than a property of the plan —
   * and because they change at retirement, which is why the band changes shape
   * there.
   */
  returns: {
    saving: number
    savingVolatility: number
    retired: number
    retiredVolatility: number
  }
}) {
  const data = useMemo(
    () =>
      monteCarlo.years.map((y) => ({
        age: y.age,
        // A two-element value draws a band between the bounds.
        band: [Math.round(y.low), Math.round(y.high)] as [number, number],
        median: Math.round(y.median),
      })),
    [monteCarlo],
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
      <AreaChart data={data} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="fillBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-band)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-band)" stopOpacity={0.12} />
          </linearGradient>
        </defs>
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
          width={Y_AXIS_WIDTH}
          tickFormatter={(v) => formatCurrency(v, { compact: true })}
        />
        <ChartTooltip
          content={
            <ProjectionTooltip retirementAge={retirementAge} returns={returns} />
          }
        />
        <ReferenceLine
          x={retirementAge}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={<RetireMarker age={retirementAge} />}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="var(--color-band)"
          strokeOpacity={0.4}
          strokeWidth={1}
          fill="url(#fillBand)"
        />
        <Area
          type="monotone"
          dataKey="median"
          stroke="var(--color-median)"
          strokeWidth={2}
          fill="none"
        />
      </AreaChart>
    </ChartContainer>
  )
}
