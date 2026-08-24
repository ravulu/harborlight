import Link from 'next/link'
import Image from 'next/image'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LineChart, ShieldCheck, Wallet, TrendingDown, ArrowRight } from 'lucide-react'
import { firstNameOf, greetingFor } from '@/lib/greeting'
import { pageMetadata, appJsonLd } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'Harborlight — Retirement Calculator & Planning',
  description:
    'Free retirement calculator. See when you can retire, how long your savings last, and what taxes and Social Security do to the answer.',
  path: '/',
})


const features = [
  {
    icon: LineChart,
    title: 'A retirement savings projection',
    body: 'A retirement savings calculator that charts year-by-year growth from today through retirement and beyond — contributions, withdrawals and inflation included.',
  },
  {
    icon: TrendingDown,
    title: 'How long will my money last?',
    body: 'Model the spend-down and find your own safe withdrawal rate, rather than assuming the 4% rule fits your retirement.',
  },
  {
    icon: Wallet,
    title: 'Taxes, by account',
    body: 'A 401(k) withdrawal calculator, capital gains on the brokerage and tax-free Roth dollars — plus a Social Security claiming strategy and Roth conversion planning.',
  },
  {
    icon: ShieldCheck,
    title: 'Ten thousand futures',
    body: 'A Monte Carlo retirement simulation runs your plan through thousands of market sequences, so you see the odds it survives rather than one tidy average.',
  },
]

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const isAuthed = !!session?.user
  const greeting = isAuthed
    ? greetingFor(firstNameOf(session?.user ?? undefined), new Date().getHours())
    : null

  return (
    <div className="min-h-svh bg-background">
      {/* Structured data: what this is, stated to a machine rather than
          smuggled into prose for one to infer. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd()) }}
      />
      <SiteHeader isAuthed={isAuthed} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col gap-6">
            <span className="w-fit rounded-full border border-primary/15 bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              Free retirement calculator
            </span>
            {/* Signed in, this is not a pitch any more — they have already
                bought it. The greeting is the headline rather than a pill above
                one, because a pill reads as decoration and gets skipped. */}
            <h1 className="font-serif text-4xl font-medium leading-tight text-foreground text-balance sm:text-5xl lg:text-6xl">
              {/* Not "know exactly": the answer is a probability across ten
                  thousand simulated markets, and a headline that promises
                  certainty is one the product spends the rest of the page
                  walking back. */}
              {greeting ? `${greeting}.` : 'See when you could retire.'}
            </h1>
            <p className="max-w-md text-lg text-muted-foreground text-pretty">
              {isAuthed
                ? 'Pick up where you left off — your plans are saved and waiting. Open one to carry on, or start another and compare the two.'
                : 'A free retirement calculator that turns your savings, contributions and spending into a year-by-year projection — so you can answer when can I retire, and how long will my money last, with arithmetic rather than guesswork.'}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/planner"
                className={buttonVariants({ size: 'lg', className: 'gap-2' })}
              >
                Start planning <ArrowRight className="size-4" />
              </Link>
              <Link
                href={isAuthed ? '/dashboard' : '/sign-up'}
                className={buttonVariants({ variant: 'outline', size: 'lg' })}
              >
                {isAuthed ? 'My plans' : 'Create free account'}
              </Link>
              {/* The lighter way in. Somebody who is not ready to build a
                  whole projection will still answer "what would it take to
                  have a million", and that page hands them across when they
                  are. */}
              <Link
                href="/goal"
                className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Or: what would it take to save $1M?
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
              <Image
                src="/hero-coast.png"
                alt="A lighthouse overlooking a calm ocean at golden hour"
                width={720}
                height={540}
                className="h-full w-full object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
          <div className="mb-10 flex max-w-xl flex-col gap-3">
            <h2 className="font-serif text-3xl font-medium text-foreground text-balance">
              Everything retirement planning asks of you, in one place
            </h2>
            <p className="text-muted-foreground text-pretty">
              Both halves of retirement: building the savings, and making them
              last once the paychecks stop. A retirement planning calculator
              where retirement tax planning, Social Security, pensions and
              required minimum distributions are part of the projection rather
              than a footnote to it.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Card key={f.title} className="p-6 gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </span>
                <h3 className="font-medium text-foreground">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center lg:py-24">
          <h2 className="font-serif text-3xl font-medium text-foreground text-balance sm:text-4xl">
            Your retirement, in focus.
          </h2>
          <p className="max-w-md text-muted-foreground text-pretty">
            Build your first retirement savings projection now. It is free,
            there is nothing to install, and you do not need an account.
          </p>
          <Link
            href="/planner"
            className={buttonVariants({ size: 'lg', className: 'gap-2' })}
          >
            Open the planner <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
