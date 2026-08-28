import { isAdminEmail } from '@/lib/admin'
import Link from 'next/link'
import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { buttonVariants } from '@/components/ui/button'
import { pageMetadata, faqJsonLd } from '@/lib/seo'
import { FAQ } from '@/lib/faq'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = pageMetadata({
  title: 'Retirement planning questions, answered',
  description:
    'How long your money lasts, when to claim Social Security, how 401(k) withdrawals are taxed, what a safe withdrawal rate is, and how Monte Carlo simulation works.',
  path: '/faq',
  keywords: [
    'retirement planning questions',
    'retirement calculator FAQ',
    'how long will my money last',
    'safe withdrawal rate',
    'Social Security claiming strategy',
  ],
})

export default async function FaqPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <div className="min-h-svh bg-background">
      {/* The structured data belongs here, on the page whose own text is the
          answer. Marking up questions a reader cannot see is against Google's
          guidelines and earns nothing — the markup describes this page, it
          does not stand in for it. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />
      <SiteHeader isAuthed={!!session?.user} isAdmin={isAdminEmail(session?.user?.email)} />

      <main className="mx-auto max-w-3xl px-4 py-16 lg:py-20">
        <div className="mb-10 flex flex-col gap-3">
          <span className="w-fit rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            Retirement planning, answered
          </span>
          <h1 className="font-serif text-4xl font-medium leading-tight text-foreground text-balance">
            Questions about retirement planning
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            How long your money lasts, when to claim Social Security, how 401(k)
            and IRA withdrawals are taxed, and what the retirement calculator
            does with all of it.
          </p>
        </div>

        {/* On the page, in the markup, and in the sitemap: one set of words,
            not a summary for readers and a different one for crawlers. */}
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {FAQ.map((item) => (
            <section key={item.q} className="flex flex-col gap-2 py-6">
              <h2 className="font-serif text-xl font-medium text-foreground text-balance">
                {item.q}
              </h2>
              <p className="leading-relaxed text-muted-foreground text-pretty">
                {item.a}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start gap-4 rounded-xl border border-border bg-card/40 p-6">
          <h2 className="font-serif text-2xl font-medium text-foreground text-balance">
            See the answer for your own numbers
          </h2>
          <p className="text-muted-foreground text-pretty">
            The retirement calculator is free and needs no account. Enter what
            you have and what you plan to spend, and it will tell you how long
            it lasts.
          </p>
          <Link
            href="/planner"
            className={buttonVariants({ size: 'lg', className: 'gap-2 px-4' })}
          >
            Open the planner <ArrowRight className="size-4" />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
