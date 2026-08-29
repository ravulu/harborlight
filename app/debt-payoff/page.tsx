import { headers } from 'next/headers'

import { isAdminEmail } from '@/lib/admin'
import { auth } from '@/lib/auth'
import { DebtPayoffPage } from '@/components/debt/debt-payoff-page'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'Debt Snowball Calculator',
  description:
    'Compare the debt snowball against the debt avalanche on your own balances. Shows when each debt clears, what each method costs in interest, and what the money above your minimum payments actually buys.',
  path: '/debt-payoff',
  keywords: [
    'debt snowball calculator',
    'debt avalanche calculator',
    'debt payoff calculator',
    'how to pay off credit cards',
    'debt free date',
  ],
})

export default async function DebtPayoffRoute() {
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader
        isAuthed={!!session?.user}
        isAdmin={isAdminEmail(session?.user?.email)}
      />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-medium text-foreground text-balance">
            Which debt to pay first?
          </h1>
          <p className="max-w-2xl text-muted-foreground text-pretty">
            There are two ways to do it, and they don&apos;t agree. Pay off
            the smallest debt first and you clear one sooner. Pay off the
            highest interest rate first and you pay less. Add your debts below
            to see both, and to see what it costs if you carry on paying just
            the minimums.
          </p>
        </div>
        <DebtPayoffPage />
      </main>
      <SiteFooter />
    </div>
  )
}
