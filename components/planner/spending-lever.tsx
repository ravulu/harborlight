'use client'

import { Card } from '@/components/ui/card'
import { formatCurrency } from '@/lib/retirement'
import type { PlanInputs } from '@/lib/retirement'
import type { SpendingLeverage } from '@/lib/spending-lever'
import { TARGET_CONFIDENCE } from '@/lib/suggestions'

/**
 * The lever that changes how much money the plan needs, rather than where it
 * sits.
 *
 * Kept apart from Suggested actions, which lives in the Tax tab and is about
 * arranging money that already exists. This asks a different question and most
 * people can act on it this month, which is the argument for giving it its own
 * place rather than burying it as a fifth row of somebody else's table.
 */
export function SpendingLever({
  leverage,
  inputs,
}: {
  leverage: SpendingLeverage
  inputs: PlanInputs
}) {
  const money = (v: number) => formatCurrency(v)
  const bar = Math.round(TARGET_CONFIDENCE * 100)
  const best = leverage.cuts[leverage.cuts.length - 1]

  return (
    <Card className="p-6 gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-xl font-medium text-foreground">
          What spending less would buy
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Everything else suggested here rearranges money you already have —
          which account it sits in, which year it comes out, when a benefit
          starts. This is the one that changes how much there has to be.
        </p>
      </div>

      {leverage.noneMove ? (
        <p className="text-sm text-muted-foreground text-justify hyphens-auto">
          Not on this plan. Cutting as much as{' '}
          <span className="font-medium text-foreground">
            {money(best.monthly)} a month
          </span>{' '}
          does not bring the date forward, because what decides it here is not
          how much the plan spends. That is unusual, and worth taking as a sign
          that the levers under Tax are the ones with something to give.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="text-left align-bottom">
                  <th className="py-1.5 pr-3 font-medium">Spend less</th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    So you save
                    <span className="block text-[10px] font-normal normal-case">
                      a month, from now
                    </span>
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    You could stop at
                  </th>
                  <th className="pl-3 py-1.5 font-medium text-right">
                    Against {leverage.baseAge ?? 'now'}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/60 bg-accent/30">
                  <td className="py-2 pr-3 text-muted-foreground">
                    Nothing — the plan as it stands
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {money(inputs.monthlyContribution)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {leverage.baseAge ?? 'no age clears it'}
                  </td>
                  <td className="pl-3 py-2 text-right text-muted-foreground">
                    —
                  </td>
                </tr>
                {leverage.cuts.map((c) => (
                  <tr key={c.monthly} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-medium tabular-nums text-foreground">
                      {money(c.monthly)} a month
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {money(inputs.monthlyContribution + c.monthly)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">
                      {c.age ?? 'no age clears it'}
                    </td>
                    <td className="pl-3 py-2 text-right tabular-nums text-foreground">
                      {c.yearsEarlier > 0
                        ? `${c.yearsEarlier} ${c.yearsEarlier === 1 ? 'year' : 'years'} earlier`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="rounded-md bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground text-justify hyphens-auto">
            <span className="font-medium text-foreground">
              Why a small cut moves the date so far.
            </span>{' '}
            Each row assumes the cut starts now and lasts, so it does two things
            at once: the money goes into savings every month from today, and
            retirement has that much less to fund every year for the rest of the
            plan. They work the same way round and compound together, which is
            why {money(best.monthly)} a month is worth years rather than months.
            If you would only cut it later, or only cut it now, the effect is
            roughly half of what is shown.
          </p>

          <p className="text-xs text-muted-foreground text-pretty">
            Each age is the youngest that still leaves the money lasting in{' '}
            {bar} of a hundred simulated markets — the same bar the rest of the
            plan is held to. Nothing here is a recommendation to spend less;
            what a household is willing to give up is not something a projection
            has a view on.
          </p>
        </>
      )}
    </Card>
  )
}
