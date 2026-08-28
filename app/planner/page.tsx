import { isAdminEmail } from '@/lib/admin'
import { cookies, headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { DRAFT_COOKIE, parseDraftCookie } from '@/lib/planner-draft'
import { PlannerBody } from '@/components/planner/planner-body'
import { firstNameOf, greetingFor } from '@/lib/greeting'
import { isLocal } from '@/lib/persistence'
import { cloudStore } from '@/lib/store/cloud'
import type { PlanSummary, StoredPlan } from '@/lib/store'
import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'Retirement Planner',
  description:
    'Model your savings and spending year by year: contributions, withdrawals, taxes by account, Social Security and inflation, with the odds your money lasts.',
  path: '/planner',
  keywords: [
    'retirement planner',
    'retirement projection tool',
    'savings drawdown calculator',
    'retirement spending calculator',
  ],
})

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; save?: string; tab?: string }>
}) {
  const { plan: planParam, save, tab } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  const isAuthed = !!session?.user
  const firstName = firstNameOf(session?.user ?? undefined)
  const greeting = isAuthed ? greetingFor(firstName, new Date().getHours()) : null

  /**
   * Read on the server, in cloud mode only.
   *
   * The point of reading here is that the first paint already has the figures
   * — no empty-then-filled flash on the numbers people check. Local mode
   * cannot have that: the plans are in the reader's browser and the server has
   * never seen them, so `PlannerBody` fetches them itself and holds a
   * restoring state while it does. Nothing is read here for a local
   * deployment, and the store actions would refuse it anyway: every one of
   * them is scoped by a session there is no longer any way to hold.
   */
  const initialPlans: PlanSummary[] =
    !isLocal && isAuthed ? await cloudStore.list() : []

  const openedId = planParam ? Number(planParam) : NaN
  const initialOpened: StoredPlan | null =
    !isLocal && isAuthed && Number.isInteger(openedId)
      ? await cloudStore.get(openedId)
      : null

  const initialHousehold =
    !isLocal && isAuthed ? await cloudStore.getHousehold() : null

  // Only signed-in users keep a draft, and only when not editing a saved plan.
  const initialDraft =
    isAuthed && initialOpened === null
      ? parseDraftCookie((await cookies()).get(DRAFT_COOKIE)?.value)
      : null

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader isAuthed={isAuthed} isAdmin={isAdminEmail(session?.user?.email)} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          {/* Above the title rather than instead of it: the page still has to
              say what it is. */}
          {greeting && (
            <p className="text-sm font-medium text-primary">{greeting}</p>
          )}
          <h1 className="font-serif text-3xl font-medium text-foreground text-balance">
            Retirement planner
          </h1>
          <p className="text-muted-foreground text-pretty">
            Model your savings and spending to see if you&apos;re on track.
          </p>
        </div>

        <PlannerBody
          isAuthed={isAuthed}
          initialPlans={initialPlans}
          initialHousehold={initialHousehold}
          initialOpened={initialOpened}
          planParam={planParam}
          // Most plans are your own, and a saved plan's own value wins.
          defaultPersonName={session?.user?.name ?? undefined}
          initialDraft={initialDraft}
          initialTab={tab}
          saveOnArrival={save === '1'}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
