import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { GoalCalculator } from '@/components/goal/goal-calculator'
import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'Savings Goal Calculator',
  description:
    'Work out what it takes to reach a savings target by a given age — how much to put away each month, how many years it needs, or what a lump sum today would do. Shows the figure that works in nine markets out of ten, not just the lucky one.',
  path: '/goal',
  keywords: [
    'savings goal calculator',
    'how much do I need to save',
    'compound interest calculator',
    'retirement savings target',
  ],
})

export default async function GoalPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <div className="min-h-svh bg-background">
      <SiteHeader isAuthed={!!session?.user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="font-serif text-3xl font-medium text-foreground text-balance">
            What would it take?
          </h1>
          <p className="max-w-2xl text-muted-foreground text-pretty">
            Name a number and a date. There are only four ways to get there —
            save more, wait longer, start with more, or take more risk — and
            this shows you all four at once, because how unequal they are is
            the useful part.
          </p>
        </div>
        <GoalCalculator />
      </main>
      <SiteFooter />
    </div>
  )
}
