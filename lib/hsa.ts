/**
 * What the IRS lets a household put into an HSA.
 *
 * Pulled out of the insight prose that used to quote them inline. They read as
 * background there, and background is exactly what nobody updates: the figures
 * were hardcoded in a sentence that also hardcoded the year, so the only thing
 * that would ever have caught them going stale was somebody reading the
 * paragraph and remembering what year it was.
 *
 * Published annually by Revenue Procedure, usually in May for the following
 * year — earlier than the brackets, which is its own reason to watch it
 * separately. See `docs/tax-data-updates.md`.
 */

/**
 * The most recent year real, published figures have been entered for.
 *
 * The staleness guard in `lib/hsa.test.ts` fails once the calendar passes it,
 * exactly as `BRACKET_YEAR`, `IRMAA_YEAR` and `ACA_YEAR` do. Unlike those,
 * there is nothing to roll forward to: a contribution limit is a stated figure
 * rather than an indexed one, and inventing next year's would be worse than
 * carrying this year's and saying which year it is.
 */
export const HSA_YEAR = 2026

/** Source: IRS Rev. Proc. 2025-19. */
export const HSA_SOURCE = {
  title: 'Rev. Proc. 2025-19',
  url: 'https://www.irs.gov/pub/irs-drop/rp-25-19.pdf',
} as const

/** Self-only high-deductible cover, a year. */
export const HSA_LIMIT_SELF = 4_400

/** Family cover, a year. */
export const HSA_LIMIT_FAMILY = 8_750

/**
 * The extra allowed from 55, which is not indexed.
 *
 * Fixed at $1,000 by statute since 2009 and never adjusted, so unlike the two
 * limits above it does not move when the Revenue Procedure lands.
 */
export const HSA_CATCH_UP = 1_000

/** The age the catch-up starts. */
export const HSA_CATCH_UP_AGE = 55
