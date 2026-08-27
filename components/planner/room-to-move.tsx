'use client'

import { formatCurrency } from '@/lib/retirement'
import { segmentsFor, type Ceiling, type RoomWindow, type WindowYear } from '@/lib/room'
import { cn } from '@/lib/utils'

const money = (v: number) => formatCurrency(Math.round(v))

/**
 * What each limit is called, in the words somebody would use for it.
 *
 * Not the name of the rule. Nobody thinks "the 400% federal poverty line
 * threshold for the premium tax credit", and a reader meeting this table for
 * the first time should not have to learn four pieces of vocabulary before the
 * table means anything.
 */
const CEILING_NAMES: Record<Ceiling['kind'], string> = {
  // Named the way the rest of the app names it, so a reader moving between
  // this table and the ACA premiums column beside it knows they are the same
  // thing. "Help paying for health cover" described it without identifying it.
  aca: 'ACA subsidy',
  irmaa: 'Medicare premiums',
  gains: 'Tax-free investment gains',
  bracket: 'Income tax rate',
}

/**
 * The low-income years, what limits them, and what is already spoken for.
 *
 * The years between stopping work and the first required distribution are the
 * only stretch of a retirement where income is low enough to be worth
 * managing, and they do not come back. Several things want them at once. This
 * shows how much there is and what is nearest, and stops there — which of them
 * deserves the room is not a question a projection can answer.
 *
 * Removable in one line: delete the `<RoomToMove>` element from `TaxPhases`.
 */
export function RoomToMove({ window: w }: { window: RoomWindow | null }) {
  // Nothing to show rather than an empty frame. Somebody already past the
  // required age has no window, and saying so at length would be worse than
  // not raising it.
  if (!w || w.years.length === 0) return null

  const years = w.toAge - w.fromAge + 1
  const over = w.years.filter((y) => y.claimed > y.room).length

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">
          How much extra income each year can take
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          Once you stop working, and until withdrawals from your 401(k) become
          compulsory at {w.closesAt}, your taxable income is usually the lowest
          it will ever be. That makes these the cheapest years to take extra
          income <em>on purpose</em> — moving money into a Roth, or selling
          something at a profit — because there is space underneath the
          thresholds that would otherwise cost you.
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
          This plan has room for about{' '}
          <span className="font-medium text-foreground">
            {money(w.totalRoom)}
          </span>{' '}
          of extra income across those {years} year{years === 1 ? '' : 's'},
          from {w.fromAge} to {w.toAge}. It does not roll over: a year you do
          not use is simply gone, and from {w.closesAt} the compulsory
          withdrawals fill the space whether you wanted them to or not.
        </p>
        {w.claimedBy.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
            {w.claimedBy.map((c) => (
              <span key={c.kind}>
                This plan already uses{' '}
                <span className="font-medium text-foreground">
                  {money(c.total)}
                </span>{' '}
                of it on {c.label}.
              </span>
            ))}{' '}
            {over > 0 && (
              <span className="text-destructive">
                In {over} of those years that is more than the year had space
                for, so it spills past a threshold — the rows in red below.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Wide on a narrow screen, so it scrolls rather than the page. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">
              <th className="pb-2 pr-3 font-medium">Year</th>
              <th className="pb-2 pr-3 font-medium">Age</th>
              <th className="pb-2 pr-3 font-medium">How full the year is</th>
              <th className="pb-2 pr-3 text-right font-medium tabular-nums">
                Extra income
                <br />
                it can take
              </th>
              <th className="pb-2 font-medium">What runs out first, and what that costs</th>
            </tr>
          </thead>
          <tbody>
            {w.years.map((y) => (
              <Row key={y.age} year={y} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
        <Key className="bg-muted-foreground/25">
          income this year already has
        </Key>
        <Key className="bg-chart-1">what this plan already does with the space</Key>
        <Key className="bg-chart-1/20">space still free</Key>
        <Key className="bg-destructive">past the threshold</Key>
      </div>

      <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">
          Why some of these thresholds matter far more than others
        </p>
        <p className="text-justify hyphens-auto">
          <span className="font-medium text-foreground">
            Some cost a little to cross.
          </span>{' '}
          Tax rates work in bands: go a thousand dollars over and only that
          thousand pays the higher rate, so crossing costs tens or low
          hundreds. The table says which two rates, so you can see the size of
          it.
        </p>
        <p className="text-justify hyphens-auto">
          <span className="font-medium text-foreground">
            Others cost a great deal, all at once.
          </span>{' '}
          The help paying for marketplace health cover stops completely once
          income passes a line — not gradually, completely — so a single dollar
          over can cost thousands. Medicare premiums work the same way, in
          steps, and are set by your income from two years earlier, so the bill
          arrives long after the decision. Where a threshold behaves like that,
          the table gives the amount you would lose rather than a rate.
        </p>
        <p className="text-justify hyphens-auto">
          That is why the nearest threshold is named rather than just measured.
          Four thousand dollars from a rate change and four thousand from
          losing a subsidy are not the same warning.
        </p>
        <p className="text-justify hyphens-auto">
          Small rate changes are left out. The step from 10% to 12% would
          otherwise be the nearest threshold in almost every year and would
          hide a subsidy worth thousands sitting behind it. Each threshold is
          also measured against the particular income <em>it</em> counts, which
          is not the same figure in each case. Nothing here changes your plan —
          it describes the space the plan is working in.
        </p>
      </div>
    </section>
  )
}

/**
 * One year, drawn against its own limit rather than a scale shared with the
 * others.
 *
 * The bar answers "how full is this year", and the amount is in the column
 * beside it. A single scale across the window seemed more honest and was not:
 * a later year bound by a Medicare tier three times the height of an earlier
 * year's subsidy cliff squashed the early years to a third of the width, and
 * those are the years with the least room and the most at stake. The reader
 * lost the years that mattered to keep a comparison the numbers already make.
 */
function Row({ year: y }: { year: WindowYear }) {
  const at = y.binding?.at ?? 0
  const { floor, fits, spare, over, scale } = segmentsFor(y)
  const pct = (v: number) => `${(v / scale) * 100}%`

  return (
    <tr className="border-t border-border/50">
      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{y.year}</td>
      <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">{y.age}</td>
      <td className="py-1.5 pr-3">
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
          title={`This year counts ${money(floor)} of income already. ${money(
            at,
          )} is where the next threshold sits.`}
        >
          <div className="bg-muted-foreground/25" style={{ width: pct(floor) }} />
          <div className="bg-chart-1" style={{ width: pct(fits) }} />
          <div className="bg-chart-1/20" style={{ width: pct(spare) }} />
          <div className="bg-destructive" style={{ width: pct(over) }} />
        </div>
      </td>
      <td className="py-1.5 pr-3 text-right tabular-nums">
        {/* What the year held before any choice, so the column adds up to the
            total quoted above it. What the choices then took is the bar. */}
        <span className={cn(y.room === 0 && 'text-destructive')}>
          {y.room === 0 ? 'none' : money(y.room)}
        </span>
        {over > 0 && (
          <span className="block text-[10px] text-destructive">
            {money(over)} over
          </span>
        )}
      </td>
      <td className="py-1.5 text-muted-foreground">
        {y.binding ? <Consequence ceiling={y.binding} spent={y.room === 0} /> : 'nothing close enough to matter'}
      </td>
    </tr>
  )
}

function Key({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn('inline-block h-2 w-4 shrink-0 rounded-sm', className)}
      />
      {children}
    </span>
  )
}

/**
 * What this year runs into, and what running into it would cost.
 *
 * The naming alone was not enough. "Before the help paying for cover stops"
 * tells a reader who already knows the rule what they already knew, and tells
 * everybody else nothing — not what the help is, not how much of it there is,
 * not whether four thousand dollars of space is comfortable or tight. The
 * amount is what makes it a decision rather than a term.
 */
function Consequence({
  ceiling: c,
  spent,
}: {
  ceiling: Ceiling
  spent: boolean
}) {
  return (
    <span className="flex items-start gap-1.5">
      <span
        aria-hidden
        className={cn(
          'mt-1 inline-block size-1.5 shrink-0 rounded-full',
          c.edge === 'cliff' ? 'bg-destructive' : 'bg-chart-1',
        )}
      />
      <span>
        <span className="text-foreground">{CEILING_NAMES[c.kind]}</span>
        {' — '}
        {c.edge === 'slope' ? (
          <>
            above {money(c.at)}, the extra is taxed at {c.to}% instead of{' '}
            {c.from}%
          </>
        ) : spent ? (
          // Already over it, so there is nothing left to protect and warning
          // about losing it would be describing a loss that has happened. It
          // still has to say what was lost: a bare "already past $84,600"
          // names a number and no consequence, which is the reading this whole
          // cell exists to avoid.
          <span className="text-destructive">
            this year is already past {money(c.at)}
            {c.kind === 'aca' &&
              ', so this plan gets no help with marketplace premiums this year'}
            {c.kind === 'irmaa' && ', so the higher premium is already coming'}
          </span>
        ) : c.cost > 0 ? (
          <>
            crossing {money(c.at)} costs{' '}
            <span className="text-destructive">{money(c.cost)} a year</span>
            {c.kind === 'aca'
              ? ' of help with marketplace premiums, all of it at once'
              : ', starting two years later'}
          </>
        ) : (
          <>
            this plan gets no subsidy in this year anyway, so crossing{' '}
            {money(c.at)} costs nothing
          </>
        )}
      </span>
    </span>
  )
}
