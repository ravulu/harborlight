import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getPlans } from '@/app/actions/plans'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { SavedPlans } from '@/components/planner/saved-plans'
import { firstNameOf } from '@/lib/greeting'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'

import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'My plans',
  description:
    'Your saved retirement plans, side by side.',
  path: '/dashboard',
  noindex: true,
})

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  const plans = await getPlans()

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader isAuthed />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-3xl font-medium text-foreground text-balance">
              Welcome back, {firstNameOf(session.user) ?? 'and welcome'}
            </h1>
            <p className="text-muted-foreground">
              {plans.length > 0
                ? `You have ${plans.length} saved ${plans.length === 1 ? 'plan' : 'plans'}.`
                : 'Start planning your retirement below.'}
            </p>
          </div>
          <Link
            href="/planner"
            className={buttonVariants({
              size: 'lg',
              className:
                'gap-2 px-4 shadow-sm transition-transform hover:-translate-y-px',
            })}
          >
            <Plus className="size-4" /> New plan
          </Link>
        </div>

        <SavedPlans plans={plans} />
      </main>
      <SiteFooter />
    </div>
  )
}
