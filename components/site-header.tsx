'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { clearDraftCookie } from '@/lib/planner-draft'
import { Button, buttonVariants } from '@/components/ui/button'
import { Anchor } from 'lucide-react'
import { FeedbackDialog } from '@/components/feedback-dialog'
import { cn } from '@/lib/utils'

export function SiteHeader({ isAuthed }: { isAuthed: boolean }) {
  const router = useRouter()
  const pathname = usePathname()

  const handleSignOut = async () => {
    await authClient.signOut()
    // The draft belongs to the account that was signed in.
    clearDraftCookie()
    router.push('/')
    router.refresh()
  }

  const navLink = (href: string, label: string, extra?: string) => (
    <Link
      href={href}
      className={cn(
        'text-sm transition-colors hover:text-foreground',
        extra,
        pathname === href ? 'text-foreground font-medium' : 'text-muted-foreground',
      )}
    >
      {label}
    </Link>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Anchor className="size-4" />
          </span>
          <span className="hidden font-serif text-lg font-medium text-foreground sm:inline">
            Harborlight
          </span>
        </Link>

        {/* Tighter on the narrowest screens so every item fits: with the
            gaps at 4 the row ran 3px past a 390px viewport. */}
        <nav className="ml-auto flex shrink-0 items-center gap-3 sm:gap-6">
          {navLink('/planner', 'Planner')}
          {/* Linked site-wide rather than from the footer alone: a page every
              other page points at is one a crawler treats as worth reading,
              and it answers the questions people arrive with. */}
          {/* Below 390px the row runs past the edge — a 360px phone is still
              a phone. Hidden by CSS rather than dropped, so it stays in the
              markup, and every footer carries it anyway. */}
          {navLink('/faq', 'FAQ', 'max-[389px]:hidden')}
          {isAuthed && navLink('/dashboard', 'My plans')}
          <FeedbackDialog />
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {isAuthed ? (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonVariants({ size: 'sm' })}>
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
