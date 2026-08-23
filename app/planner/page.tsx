import { cookies, headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getPlans } from '@/app/actions/plans'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { DRAFT_COOKIE, parseDraftCookie } from '@/lib/planner-draft'
import { RetirementPlanner } from '@/components/planner/retirement-planner'
import { SavedPlans } from '@/components/planner/saved-plans'
import { firstNameOf, greetingFor } from '@/lib/greeting'
import { planToInputs } from '@/lib/plan'
import type { PlanInputs } from '@/lib/retirement'
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
  searchParams: Promise<{ plan?: string; save?: string }>
}) {
  const { plan: planParam, save } = await searchParams
  const session = await auth.api.getSession({ headers: await headers() })
  const isAuthed = !!session?.user
  const firstName = firstNameOf(session?.user ?? undefined)
  const greeting = isAuthed ? greetingFor(firstName, new Date().getHours()) : null

  // Everything they have saved, so the planner is a place to come back to
  // rather than only a place to start from.
  const plans = isAuthed ? await getPlans() : []

  let initialInputs: PlanInputs | undefined
  let initialName: string | undefined
  // Defaults to the account holder: most plans are your own, and a saved
  // plan's stored value replaces it below.
  let initialPersonName: string | undefined = session?.user?.name ?? undefined
  let planId: number | undefined

  if (isAuthed && planParam) {
    const found = plans.find((p) => String(p.id) === planParam)
    if (found) {
      initialInputs = planToInputs(found)
      initialName = found.name
      // Plans saved before this field existed have none; fall back rather
      // than blanking a field the user never had the chance to fill.
      initialPersonName = found.personName || initialPersonName
      planId = found.id
    }
  }

  // Only signed-in users keep a draft, and only when not editing a saved plan.
  const initialDraft =
    isAuthed && planId === undefined
      ? parseDraftCookie((await cookies()).get(DRAFT_COOKIE)?.value)
      : null

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader isAuthed={isAuthed} />
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

        {plans.length > 0 && (
          <div className="mb-8 flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-lg font-medium text-foreground">
                Your saved plans
              </h2>
              <p className="text-sm text-muted-foreground">
                {plans.length} saved. Opening one loads it below.
              </p>
            </div>
            <SavedPlans plans={plans} />
          </div>
        )}
        <RetirementPlanner
          isAuthed={isAuthed}
          initialInputs={initialInputs}
          initialName={initialName}
          initialPersonName={initialPersonName}
          planId={planId}
          initialDraft={initialDraft}
          saveOnArrival={save === '1'}
        />
      </main>
      <SiteFooter />
    </div>
  )
}
