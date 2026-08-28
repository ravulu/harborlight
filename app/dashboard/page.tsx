import { notFound, redirect } from 'next/navigation'
import { isLocal } from '@/lib/persistence'
import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { deletePlan } from '@/app/actions/plans'
import { cloudStore } from '@/lib/store/cloud'
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
  // Nothing to list in local mode: this page reads plans off an account and
  // local mode keeps them in the browser, where the planner already shows
  // them. An admin signed in here has no plans of their own to see.
  if (isLocal) notFound()

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  // Through the store, so this page and the planner agree about what a
  // stored plan is. Cloud-only by construction: it has already redirected
  // anyone without a session, and local mode has no sessions to have.
  const plans = await cloudStore.list()

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

        {/* A server action passed as a prop, which is how the list stays
            ignorant of where its plans live. */}
        <SavedPlans plans={plans} onDelete={deletePlan} />
      </main>
      <SiteFooter />
    </div>
  )
}
