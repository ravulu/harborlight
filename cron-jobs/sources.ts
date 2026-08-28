/**
 * Where to look for each published table, and how.
 *
 * One entry per key in `lib/published.ts`. Kept beside the watcher rather than
 * in `lib/` because nothing the app serves reads it: this is operations, and
 * putting a list of scraping targets in the bundle would ship it to every
 * visitor for no reason.
 *
 * **Nothing here parses a number.** Every check answers one question — *does a
 * document exist that this build has no table for* — and the answer is a
 * prompt for a person, never a patch. `docs/tax-data-updates.md` sets out why
 * that line is where it is: a scraper that misreads one bracket boundary
 * changes every projection this app produces and nothing on the screen looks
 * wrong.
 */

export type Check =
  | {
      /**
       * The Federal Register's own API — free, JSON, and the only genuinely
       * structured source among these. Covers HHS notices and some of CMS.
       */
      kind: 'federal-register'
      term: string
      /** Agency slugs as the API spells them. */
      agencies: string[]
      /**
       * What the document's *title* has to say, as a regular expression.
       *
       * Added after the first run reported an unrelated
       * "Agency Information Collection Activities: ... Loan Repayment
       * Programs" notice as a new poverty-guidelines publication. The API's
       * `term` searches the full text, and 472 HHS documents mention the
       * poverty guidelines in passing — so a term match alone reports noise
       * with an authoritative-looking document number beside it, which is
       * worse than reporting nothing.
       *
       * The title is the part that says what a document *is*.
       */
      titlePattern: string
    }
  | {
      /**
       * Fetch a page and hash it.
       *
       * A changed hash is not proof of a new Revenue Procedure — a footer
       * date or an unrelated edit moves it too. It is a reliable prompt to go
       * and look, which is all this layer is for. False positives are cheap;
       * a missed publication is the failure this exists to prevent.
       */
      kind: 'page'
      url: string
    }

export const SOURCES: Record<string, Check> = {
  /**
   * IRS Revenue Procedures are not in the Federal Register, so a page the IRS
   * keeps current is the best signal available.
   *
   * The first address tried here was the newsroom announcement for the 2026
   * adjustments — which has the year in the URL, and so becomes a 404 the
   * moment it is the thing worth watching for. A watcher whose target expires
   * exactly when it matters is worse than none, because it reports "could not
   * be checked" and looks like a network problem. This page has no year in it.
   */
  'federal-brackets': {
    kind: 'page',
    url: 'https://www.irs.gov/filing/federal-income-tax-rates-and-brackets',
  },
  irmaa: {
    kind: 'federal-register',
    term: '"Medicare Program" premium',
    agencies: ['centers-for-medicare-medicaid-services'],
    titlePattern: 'part (a|b).*premium|premium.*part (a|b)|inpatient hospital deductible',
  },
  // The poverty guidelines are an HHS notice and land in the Register every
  // January, which makes this the one check that is genuinely precise.
  aca: {
    kind: 'federal-register',
    term: '"poverty guidelines"',
    agencies: ['health-and-human-services-department'],
    titlePattern: 'poverty guidelines',
  },
  'state-brackets': {
    kind: 'page',
    url: 'https://taxfoundation.org/data/all/state/state-income-tax-rates/',
  },
  'hsa-limits': {
    kind: 'page',
    url: 'https://www.irs.gov/publications/p969',
  },
}
