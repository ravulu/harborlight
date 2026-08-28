import { AlertTriangle } from 'lucide-react'

import { PUBLISHED, staleTables, yearsBehind } from '@/lib/published'

/**
 * Which published figures the calendar has overtaken.
 *
 * There is already a guard for this: `lib/published.test.ts` fails the build
 * the moment a table's year passes. That is the right place for it and it is
 * not enough on its own — a failing test is seen by whoever runs the suite,
 * and the person who has to go and read a Revenue Procedure is the person
 * looking at this page. A deployed app can sit for months charging last year's
 * brackets with a red test nobody has run.
 *
 * So this says the same thing where the decision gets made, and says it in
 * red, with the source and the year, so acting on it does not require going to
 * find out what it means. Renders nothing at all while everything is current,
 * which is most of the time and is the point: a banner that is always there is
 * furniture.
 */
export function StaleTables() {
  const stale = staleTables()
  if (stale.length === 0) return null

  return (
    <section
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
      // Announced, not merely coloured: red alone is not a message, and this
      // is the one thing on the page that wants reading before the numbers.
      role="alert"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0 text-destructive" />
        <h2 className="font-serif text-lg font-medium text-destructive">
          {stale.length} of {PUBLISHED.length} published tables{' '}
          {stale.length === 1 ? 'is' : 'are'} out of date
        </h2>
      </div>

      <p className="text-sm text-destructive/90 text-pretty">
        Every projection on the site is being worked out from these. Nothing has
        broken — each table either rolls forward and says it is an estimate, or
        holds its last real figures — but the estimates are only worth what the
        assumption behind them is, and the real numbers have been published.
      </p>

      <ul className="flex flex-col gap-3">
        {stale.map((t) => {
          const behind = yearsBehind(t)
          return (
            <li
              key={t.key}
              className="flex flex-col gap-0.5 border-l-2 border-destructive/40 pl-3"
            >
              <span className="text-sm font-medium text-foreground">
                {t.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Holding {t.year} figures — {behind} year{behind === 1 ? '' : 's'}{' '}
                behind.{' '}
                {t.pastItsYear === 'indexed'
                  ? 'Rolled forward by indexation and marked estimated.'
                  : 'Held unchanged; there is no defensible way to project it.'}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.where} Published {t.publishedAround}.
              </span>
              <a
                href={t.source.url}
                target="_blank"
                rel="noreferrer"
                className="w-fit text-xs font-medium text-destructive underline underline-offset-4"
              >
                {t.source.title}
              </a>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Adding a year is additive: enter the new table beside the old one and
        move its year constant. Nothing already stored changes, so a plan run
        last year still agrees with itself. See{' '}
        <span className="font-medium text-foreground">
          docs/tax-data-updates.md
        </span>
        .
      </p>
    </section>
  )
}
