import type { Metadata } from 'next'

/**
 * Everything a search engine is told about this app, in one place.
 *
 * A word on `keywords`: Google has ignored the meta keywords tag since 2009
 * and says so publicly. It is emitted below because it costs a line and a few
 * other engines still glance at it, but nothing you put there will move a
 * Google ranking. What moves rankings is the title, the description, and the
 * words that actually appear in the page's own copy and headings — so the
 * phrases in KEYWORDS are used to write those too, not just the tag.
 */

function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return 'http://localhost:3000'
}

export const SITE = {
  name: 'Harborlight',
  /**
   * The public origin, used for canonical links, the sitemap and share cards.
   *
   * Set NEXT_PUBLIC_SITE_URL to the deployed domain; a wrong value here makes
   * every canonical point at a host that does not serve the page, which is
   * worse than having none.
   *
   * On Vercel it falls back to the project's own production domain, so a first
   * deploy is not stuck choosing a URL it cannot know yet. That variable is
   * the stable production host rather than VERCEL_URL, which is unique to each
   * deployment and would make every preview claim to be canonical.
   */
  url: siteUrl(),
  /** Shown as the site name on share cards. */
  publisher: 'Harborlight',
  locale: 'en_US',
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  YOUR PHRASES GO HERE. Replace this list with the ones you have in mind.
 *  Put the most important first; the ones near the top are the ones worth
 *  working into headings and body copy as well.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const KEYWORDS = [
  'retirement calculator',
  'retirement planning',
  'when can I retire',
  'retirement savings projection',
  'how long will my money last',
  '401(k) withdrawal calculator',
  'Social Security claiming strategy',
  'Roth conversion planning',
  'safe withdrawal rate',
  'Monte Carlo retirement simulation',
  'retirement tax planning',
  'required minimum distribution calculator',
  'retirement planning',
  'retirement calculator',
  'retirement calculators',
  'calculator for retirement',
  'pension retirement planning',
  'retirement savings calculator',
  'retirement planning 401k',
  'retirement planning calculator',
  'retirement investment calculator',
  'best retirement calculator'
]

/**
 * Phrases kept out of the visible copy on purpose.
 *
 * They stay in the list above and go into the tag; they are simply not worth
 * writing into sentences. Search engines already match plurals, word order and
 * stemming, so repeating a phrase you have effectively said is keyword
 * stuffing — which Google penalises rather than rewards. Move one out of here
 * if you want it worked into the copy.
 */
export const TAG_ONLY = [
  // Already said as "retirement calculator"; engines handle the plural.
  'retirement calculators',
  // Word-order variant of the same phrase, and it reads badly in a sentence.
  'calculator for retirement',
  // Both halves are all over the copy; the phrase itself is not English.
  'retirement planning 401k',
  // A superlative about our own product. Not something to state as fact in
  // body copy, and self-declared "best" carries no weight with a search
  // engine either. Move it out of here if you want the claim made.
  'best retirement calculator',
  // The planner models returns and volatility, not the choosing of
  // investments — writing this would promise something it does not do.
  'retirement investment calculator',
]

/** The phrases the copy is expected to actually say. */
export const COPY_PHRASES = KEYWORDS.filter(
  (k) => !TAG_ONLY.some((t) => t.toLowerCase() === k.toLowerCase()),
)

/**
 * The list as it goes into the tag: unique, order preserved.
 *
 * Deduped here rather than trusted, because the same phrase written twice is
 * easy to do by hand and emits a tag that repeats itself.
 */
export const KEYWORDS_UNIQUE = [
  ...new Map(KEYWORDS.map((k) => [k.toLowerCase(), k])).values(),
]

/** Phrases for one page, ahead of the site-wide list. */
export type PageSeo = {
  title: string
  description: string
  /** Path from the site root, e.g. '/planner'. */
  path: string
  /** Page-specific phrases, placed before the shared ones. */
  keywords?: string[]
  /** Private pages: in the app, but not for the index. */
  noindex?: boolean
}

/**
 * Builds a page's metadata: its own title and description, a canonical URL so
 * two paths never compete for the same words, and the share card.
 */
export function pageMetadata({
  title,
  description,
  path,
  keywords = [],
  noindex = false,
}: PageSeo): Metadata {
  const url = `${SITE.url}${path === '/' ? '' : path}`
  const merged = [
    ...new Map(
      [...keywords, ...KEYWORDS].map((k) => [k.toLowerCase(), k]),
    ).values(),
  ]

  return {
    title,
    description,
    keywords: merged,
    alternates: { canonical: url },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      locale: SITE.locale,
      url,
      title,
      description,
      images: [{ url: `${SITE.url}/hero-coast.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE.url}/hero-coast.png`],
    },
  }
}

/**
 * The structured data a search engine reads instead of guessing.
 *
 * Rendered as JSON-LD in a script tag: it is the one place where saying "this
 * is a free retirement planning application" is a statement to a machine
 * rather than a phrase stuffed into prose for one to find.
 */
export function appJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE.name,
    url: SITE.url,
    applicationCategory: 'FinanceApplication',
    operatingSystem: 'Any',
    description:
      'Free retirement planning calculator. Project your savings, model your spending, and see how long your money lasts — with taxes, Social Security and inflation included.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Year-by-year retirement projection',
      'Monte Carlo simulation of thousands of market outcomes',
      'Federal and state tax modelling by account type',
      'Social Security claiming and spousal benefits',
      'Roth conversion and required minimum distribution planning',
    ],
    keywords: KEYWORDS_UNIQUE.join(', '),
  }
}

/** Questions worth answering where a search engine can see the answer. */
export function faqJsonLd(qa: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}
