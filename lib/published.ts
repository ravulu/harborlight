import { ACA_YEAR, ACA_SOURCE } from '@/lib/aca'
import { HSA_SOURCE, HSA_YEAR } from '@/lib/hsa'
import { IRMAA_SOURCE, IRMAA_YEAR } from '@/lib/irmaa'
import { STATE_TAX_SOURCE, STATE_TAX_YEAR } from '@/lib/state-tax'
import { BRACKET_SOURCE, BRACKET_YEAR } from '@/lib/tax'

/**
 * Every figure in this app that somebody else publishes on a schedule.
 *
 * One list, because there were five and they were only discoverable by
 * knowing to look. Three of them carried a year constant and a failing test;
 * two carried a year in a comment and nothing at all, which is how
 * `lib/state-tax.ts` came within a redeploy of charging 2026 brackets for ever
 * without anybody being told.
 *
 * The list is read by three things, and that is the reason it exists rather
 * than five separate constants:
 *
 * - `lib/published.test.ts` fails the build when the calendar passes any of
 *   them, naming which and where to get the replacement.
 * - `/admin` shows what is overdue, in red, because a build that fails on a
 *   developer's machine is not seen by the person who decides to go and update
 *   a table.
 * - `cron/` watches the sources for a new document and says which entry it
 *   would replace.
 *
 * `docs/tax-data-updates.md` is the design; this is the part of it that other
 * code reads.
 */

export interface PublishedTable {
  /** Stable id, used by the watcher and in issue titles. */
  key: string
  /** What to call it to a person. */
  label: string
  /** The most recent year real, published figures are entered for. */
  year: number
  source: { title: string; url: string }
  /**
   * What the app does with a year later than `year`.
   *
   * `indexed` rolls the last real table forward and marks it estimated — the
   * rates are still the law, only the thresholds have been moved. `held` keeps
   * the last real figures unchanged, because there is no defensible way to
   * project them. Neither is a substitute for the real table; both are ways of
   * being wrong that say so.
   */
  pastItsYear: 'indexed' | 'held'
  /** Roughly when the publisher issues it. Prose, for the watcher's report. */
  publishedAround: string
  /** Where to go and get it, when the guard fires. */
  where: string
}

export const PUBLISHED: PublishedTable[] = [
  {
    key: 'federal-brackets',
    label: 'Federal brackets, standard deduction and capital-gains bands',
    year: BRACKET_YEAR,
    source: BRACKET_SOURCE,
    pastItsYear: 'indexed',
    publishedAround: 'October or November, for the following year',
    where: 'The IRS annual inflation-adjustments Revenue Procedure.',
  },
  {
    key: 'irmaa',
    label: 'Medicare Part B premium and IRMAA tiers',
    year: IRMAA_YEAR,
    source: IRMAA_SOURCE,
    pastItsYear: 'indexed',
    publishedAround: 'November',
    where: 'The CMS premium announcement for the following year.',
  },
  {
    key: 'aca',
    label: 'ACA poverty line, applicable percentages and benchmark premium',
    year: ACA_YEAR,
    source: ACA_SOURCE,
    pastItsYear: 'indexed',
    publishedAround:
      'The percentages in summer; the poverty guidelines in January; the benchmark with open enrolment in October',
    where:
      'IRS Rev. Proc. for the percentages, HHS for the guidelines, CMS or KFF for the benchmark.',
  },
  {
    key: 'state-brackets',
    label: 'State income tax brackets and standard deductions',
    year: STATE_TAX_YEAR,
    source: STATE_TAX_SOURCE,
    // Fifty states on fifty schedules. One assumed rate across all of them
    // would be a worse answer than last year's real figures plus a warning.
    pastItsYear: 'held',
    publishedAround: 'January or February',
    where: "The Tax Foundation's state rates and brackets table.",
  },
  {
    key: 'hsa-limits',
    label: 'HSA contribution limits',
    year: HSA_YEAR,
    source: HSA_SOURCE,
    // A stated figure, not an indexed one. There is nothing to project.
    pastItsYear: 'held',
    publishedAround: 'May, for the following year',
    where: 'The IRS Revenue Procedure setting HSA limits.',
  },
]

/**
 * The tables the calendar has overtaken.
 *
 * `now` is passed rather than read so that a test can ask what happens in 2029
 * without waiting, and so the admin page and the build agree about what "now"
 * means.
 */
export function staleTables(now: Date = new Date()): PublishedTable[] {
  const year = now.getFullYear()
  return PUBLISHED.filter((t) => year > t.year)
}

/** How many years past its figures a table is. Zero when it is current. */
export const yearsBehind = (t: PublishedTable, now: Date = new Date()) =>
  Math.max(0, now.getFullYear() - t.year)
