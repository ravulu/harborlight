import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlanForAdmin } from '@/app/actions/admin'
import { planToInputs } from '@/lib/plan'
import { simulate, formatCurrency, type PlanInputs } from '@/lib/retirement'
import { runMonteCarlo } from '@/lib/monte-carlo'
import { Card } from '@/components/ui/card'
import { ProjectionChart } from '@/components/planner/projection-chart'
import { ArrowLeft, Eye } from 'lucide-react'
import { FILING_STATUSES } from '@/lib/state-tax'

const money = (v: number) => formatCurrency(Math.round(v))
const compact = (v: number) => formatCurrency(Math.round(v), { compact: true })

/** The inputs as fields a human reads, grouped the way the planner groups them. */
function groups(i: PlanInputs): { title: string; rows: [string, string][] }[] {
  const status =
    FILING_STATUSES.find((f) => f.value === i.filingStatus)?.label ?? i.filingStatus
  return [
    {
      title: 'Timeline',
      rows: [
        ['Current age', String(i.currentAge)],
        ['Retirement age', String(i.retirementAge)],
        ['Plan through', String(i.endAge)],
      ],
    },
    {
      title: 'Accounts',
      rows: [
        ['Brokerage', money(i.brokerageBalance)],
        ['— of which gain', `${i.brokerageGainShare}%`],
        ['401(k)', money(i.balance401k)],
        ['Traditional IRA', money(i.traditionalIraBalance)],
        ['Roth IRA', money(i.rothIraBalance)],
        ['Monthly contribution', `${money(i.monthlyContribution)}/mo`],
      ],
    },
    {
      title: 'Spending',
      rows: [
        ['At retirement', `${money(i.monthlyRetirementSpending)}/mo`],
        [
          'Changes at',
          i.spendingStep1Monthly > 0
            ? `${i.spendingStep1Age} → ${money(i.spendingStep1Monthly)}/mo`
            : 'no change',
        ],
        [
          'Changes again at',
          i.spendingStep2Monthly > 0
            ? `${i.spendingStep2Age} → ${money(i.spendingStep2Monthly)}/mo`
            : 'no change',
        ],
      ],
    },
    {
      title: 'Income',
      rows: [
        [
          'Social Security',
          i.socialSecurityMonthly > 0
            ? `${money(i.socialSecurityMonthly)}/mo from ${i.socialSecurityAge}`
            : 'none',
        ],
        ['Its COLA', `${i.socialSecurityCola}%`],
        [
          "Spouse's",
          i.spouseBenefitMonthly > 0
            ? `${money(i.spouseBenefitMonthly)}/mo from ${i.spouseClaimAge}`
            : 'none',
        ],
        [
          'Pension',
          i.pensionMonthly > 0
            ? `${money(i.pensionMonthly)}/mo from ${i.pensionStartAge} (COLA ${i.pensionCola}%)`
            : 'none',
        ],
        [
          'Other income',
          i.otherIncomeMonthly > 0
            ? `${money(i.otherIncomeMonthly)}/mo from ${i.otherIncomeStartAge}`
            : 'none',
        ],
      ],
    },
    {
      title: 'Assumptions',
      rows: [
        ['Return while saving', `${i.preRetirementReturn}% ± ${i.preRetirementVolatility}%`],
        ['Return in retirement', `${i.postRetirementReturn}% ± ${i.postRetirementVolatility}%`],
        ['Inflation', `${i.inflationRate}%`],
      ],
    },
    {
      title: 'Tax',
      rows: [
        ['Filing status', status],
        ['State', i.taxState || 'rates entered by hand'],
        ['Federal rate', i.taxState ? 'derived' : `${i.federalTaxRate}%`],
        ['State rate', i.taxState ? 'derived' : `${i.stateTaxRate}%`],
      ],
    },
  ]
}

export default async function AdminPlanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numeric = Number(id)
  if (!Number.isInteger(numeric)) notFound()

  const found = await getPlanForAdmin(numeric)
  if (!found) notFound()

  const { plan, owner } = found
  const inputs = planToInputs(plan)
  const result = simulate(inputs)
  const mc = runMonteCarlo(inputs)

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to support tools
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-2xl font-medium text-foreground">
              {plan.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {plan.personName ? `${plan.personName} · ` : ''}
              {owner.name} ({owner.email}) · plan #{plan.id} · updated{' '}
              {plan.updatedAt.toISOString().slice(0, 10)}
            </p>
          </div>
          {/* Said once, plainly: nothing here writes. */}
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
            <Eye className="size-3.5" /> Read-only
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Confidence" value={`${Math.round(mc.successRate * 100)}%`} />
        <Stat label="Pot at retirement" value={compact(mc.balanceAtRetirement.median)} note="middle outcome" />
        <Stat
          label="Money lasts"
          value={
            result.lastsThroughRetirement
              ? `through ${plan.endAge}`
              : `runs out at ${result.depletionAge}`
          }
        />
        <Stat label="Lifetime tax" value={compact(result.totalTaxes)} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-serif text-lg font-medium text-foreground">
          Projection
        </h2>
        <ProjectionChart
          monteCarlo={mc}
          retirementAge={inputs.retirementAge}
          returns={{
            saving: inputs.preRetirementReturn,
            savingVolatility: inputs.preRetirementVolatility,
            retired: inputs.postRetirementReturn,
            retiredVolatility: inputs.postRetirementVolatility,
          }}
        />
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <div className="border-b border-border p-5">
          <h2 className="font-serif text-lg font-medium text-foreground">
            Everything they entered
          </h2>
        </div>
        <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {groups(inputs).map((g) => (
            <div key={g.title} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {g.title}
              </h3>
              <dl className="flex flex-col gap-1 text-sm">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="tabular-nums text-foreground/85">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-serif text-2xl font-medium tabular-nums text-foreground">
        {value}
      </span>
      {note && <span className="text-xs text-muted-foreground/70">{note}</span>}
    </Card>
  )
}
