'use client'

import type { ClaimComparison } from '@/lib/claiming'
import type { PlanInputs } from '@/lib/retirement'
import { formatCurrency } from '@/lib/retirement'
import { MIN_CLAIM_AGE, MAX_CLAIM_AGE, FULL_RETIREMENT_AGE } from '@/lib/social-security'
import { cn } from '@/lib/utils'

/**
 * Every claim age, priced against this plan.
 *
 * The whole ladder, no row recommended — the same shape as the conversion
 * table beside it, and for the same reason. What makes this one worth showing
 * is that the number everybody quotes is wrong: the published break-even
 * counts benefits alone and ignores the savings the waiting is paid for out
 * of, which on a real plan moves the answer by years in the direction of
 * claiming sooner.
 */
/** One column of the table above, named and then explained. */
function Term({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 font-medium text-foreground sm:w-44">{name}</dt>
      <dd className="flex-1 text-muted-foreground text-justify hyphens-auto">
        {children}
      </dd>
    </div>
  )
}

export function ClaimingLadder({
  c,
  inputs,
}: {
  c: ClaimComparison
  inputs: PlanInputs
}) {
  const money = (v: number) => formatCurrency(v)
  const signed = (v: number) =>
    v === 0 ? '—' : `${v > 0 ? '+' : '−'}${money(Math.abs(v))}`

  const gap =
    c.crossover === null ? null : Math.round(c.crossover - c.textbookCrossover)

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          Start Social Security between {MIN_CLAIM_AGE} and {MAX_CLAIM_AGE}
        </p>
        <p className="text-xs text-muted-foreground text-justify hyphens-auto">
          Starting before full retirement age — {FULL_RETIREMENT_AGE} — permanently
          reduces the monthly amount, and waiting past it raises them by about 8%
          a year until {MAX_CLAIM_AGE}, after which nothing more accrues. Each row
          below is your plan exactly as it stands with only the claim age changed,
          run again to {inputs.endAge}.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="text-left align-bottom">
              <th className="py-1.5 pr-3 font-medium">Start at</th>
              <th className="px-3 py-1.5 font-medium text-right">
                Monthly
                <span className="block text-[10px] font-normal normal-case">
                  today&apos;s $
                </span>
              </th>
              <th className="px-3 py-1.5 font-medium text-right">
                Savings left at {inputs.endAge}
                <span className="block text-[10px] font-normal normal-case">
                  all accounts, today&apos;s $
                </span>
              </th>
              <th className="px-3 py-1.5 font-medium text-right">
                Against your plan
                <span className="block text-[10px] font-normal normal-case">
                  claiming at {c.current}
                </span>
              </th>
              <th className="pl-3 py-1.5 font-medium text-right">
                Total tax
                <span className="block text-[10px] font-normal normal-case">
                  whole plan
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {c.options.map((o) => (
              <tr
                key={o.age}
                className={cn(
                  'border-t border-border/60 align-top',
                  o.current && 'bg-accent/30',
                )}
              >
                <td className="py-2 pr-3">
                  <span className="font-medium tabular-nums text-foreground">
                    {o.age}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {Math.round(o.factor * 100)}% of the full benefit
                    {o.current ? ' · your plan' : ''}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {money(o.monthly)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {money(o.endBalance)}
                  {o.depletionAge !== null && (
                    <span className="block text-[11px] font-medium text-destructive">
                      runs out at {o.depletionAge}
                    </span>
                  )}
                </td>
                <td
                  className={cn(
                    'px-3 py-2 text-right tabular-nums',
                    o.deltaEnd > 0 && 'text-foreground',
                    o.deltaEnd < 0 && 'text-muted-foreground',
                  )}
                >
                  {signed(o.deltaEnd)}
                </td>
                <td className="pl-3 py-2 text-right tabular-nums text-muted-foreground">
                  {money(o.totalTaxes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* A glossary rather than a paragraph, for the same reason the conversion
          table has one: four columns explained in prose have to be held in the
          head at once, and the one being puzzled over cannot be found without
          re-reading the others. */}
      <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3 text-xs">
        <p className="text-muted-foreground text-justify hyphens-auto">
          Every row is your plan exactly as it stands, changed in one way only —
          the age Social Security starts — and then run again to {inputs.endAge}.
          What the columns mean:
        </p>
        <dl className="flex flex-col gap-2">
          <Term name="Start at">
            The age the benefit begins. Everything else on the row follows from
            it.
          </Term>
          <Term name="Monthly">
            What Social Security pays at that starting age, before tax, in
            today&apos;s money. It is the amount you entered for age{' '}
            {FULL_RETIREMENT_AGE}, reduced or increased by what that starting age
            earns.
          </Term>
          <Term name={`Savings left at ${inputs.endAge}`}>
            What is still in your accounts at the end of the plan — brokerage,
            401(k), IRA, Roth and HSA added together — once every year of
            spending in the plan has been paid for, in today&apos;s money. It is
            not a target and not money you are meant to leave behind; it is
            simply where the plan lands. A larger figure means the benefit
            covered more of the spending, so less had to come out of savings.
          </Term>
          <Term name="Against your plan">
            The same figure measured against the row your plan uses now, so the
            size of the choice is visible without doing the subtraction.
          </Term>
          <Term name="Total tax">
            Every dollar of federal and state tax from now until{' '}
            {inputs.endAge}, added up.
          </Term>
        </dl>
        {/* Where the figures come from, named against something the reader can
            actually go and look at. The app runs two bases for a balance — a
            steady run here and in the year-by-year table, medians across ten
            thousand volatile markets in the tiles at the top — and a reader who
            has not been told that reasonably concludes one of them is wrong. */}
        <p className="border-t border-border/60 pt-2 text-muted-foreground text-justify hyphens-auto">
          <span className="font-medium text-foreground">
            Where these figures come from.
          </span>{' '}
          Each row is a single steady run at the returns you entered, with no
          market variation. The row marked as your plan is{' '}
          <span className="font-medium text-foreground">
            the same figure the year-by-year table ends on
          </span>{' '}
          — you can check it against the last line of the Table tab, and it will
          agree to the dollar. It will not agree with the tiles at the top of the
          projection: those are medians across ten thousand volatile markets,
          which is a different question, and neither one is the other&apos;s
          error.
        </p>
        <p className="text-muted-foreground text-justify hyphens-auto">
          Read the rows against each other rather than any one of them as a
          forecast. Holding the market steady is what isolates the claim age as
          the only thing that changed, so the{' '}
          <span className="font-medium text-foreground">difference</span> between
          two rows is the reliable part; the level a single row lands on is one
          path out of many.
        </p>
      </div>

      {/* The finding, phrased as a condition rather than a verdict. Longevity
          is the input that decides this and the reader is the only one who has
          any view on it. */}
      <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">
          The break-even everyone quotes is not your break-even
        </p>
        {c.crossover !== null ? (
          <p className="text-justify hyphens-auto">
            On your figures, waiting until {c.latest} leaves you better off than
            claiming at {c.current}{' '}
            <span className="font-medium text-foreground">
              only if you live past {c.crossover}
            </span>
            . The figure usually published for this comparison is{' '}
            {c.textbookCrossover.toFixed(1)} — it counts the benefit cheques
            alone. It cannot see that the years of waiting are paid for by
            drawing on your savings, and that the money drawn stops compounding
            for the rest of the plan.{' '}
            {gap !== null && gap > 0
              ? `On this plan that is worth ${gap} ${gap === 1 ? 'year' : 'years'} of difference, all of it against waiting.`
              : ''}
          </p>
        ) : (
          <p className="text-justify hyphens-auto">
            On your figures, waiting until {c.latest} does not overtake claiming
            at {c.current} at{' '}
            <span className="font-medium text-foreground">any age up to 100</span>
            . The figure usually published for this comparison is{' '}
            {c.textbookCrossover.toFixed(1)}, but it counts the benefit cheques
            alone — and on a plan this size the savings drawn down while waiting
            matter more than the larger cheque ever recovers.
          </p>
        )}
        <p className="text-justify hyphens-auto">
          Which side of that you are on is a question about your health and your
          family, not your money, and it is not one this projection can answer.
          Nothing above is a recommendation to claim at any particular age.
        </p>
      </div>

      {/* Kept visually distinct, because a couple reading the table at face
          value is missing something that runs one way — but in the ordinary
          accent rather than the destructive style. The omission is worth
          knowing about; it is not an alarm. */}
      {c.survivorUnpriced && (
        <div className="flex flex-col gap-1.5 rounded-md border border-primary/30 bg-accent/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            For a couple, one thing is missing from this table
          </p>
          <p className="text-justify hyphens-auto">
            Whichever of you lives longer keeps the larger of the two benefits,
            and the smaller one stops. Delaying the higher earner&apos;s claim
            therefore raises their income for the rest of their life. For many
            couples that is worth more than everything in the table above, and it
            is the main reason advisers lean towards waiting.
          </p>
          <p className="text-justify hyphens-auto">
            <span className="font-medium text-foreground">
              This projection does not yet model a household becoming one person,
            </span>{' '}
            so none of that is counted here. Every row above therefore understates
            the case for claiming later, by an amount this plan cannot currently
            tell you. Read it as a floor on the value of waiting rather than a
            verdict on it.
          </p>
        </div>
      )}
    </div>
  )
}
