'use client'

import { isLocal } from '@/lib/persistence'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { clearDraftCookie } from '@/lib/planner-draft'
import { Button, buttonVariants } from '@/components/ui/button'
import { Menu as MenuIcon } from 'lucide-react'
import { FeedbackDialog } from '@/components/feedback-dialog'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { cn } from '@/lib/utils'


/**
 * Everything the wide header shows in a row, for screens that have no room
 * for one.
 *
 * The alternative the header used to run was hiding items by breakpoint until
 * the line fitted — which meant the narrowest phones lost the pages most worth
 * finding. A menu costs one tap and loses nothing.
 */
function NavMenu({
  isAuthed,
  showsAccount,
  pathname,
  onSignOut,
}: {
  isAuthed: boolean
  showsAccount: boolean
  pathname: string
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)

  const item = (href: string, label: string) => (
    <MenuItem
      key={href}
      render={<Link href={href} />}
      className={cn(
        pathname === href && 'font-medium text-foreground',
        pathname !== href && 'text-muted-foreground',
      )}
      onClick={() => setOpen(false)}
    >
      {label}
    </MenuItem>
  )

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        aria-label="Menu"
        className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
      >
        <MenuIcon className="size-5" />
      </MenuTrigger>
      <MenuContent>
        {item('/planner', 'Retirement Planner')}
        {item('/goal', 'Savings Estimator')}
        {item('/faq', 'FAQ')}
        {isAuthed && !isLocal && item('/dashboard', 'My plans')}
        <MenuSeparator />
        {/* Closed first: the dialog and the menu both want the focus, and a
            menu still open behind a modal traps it. */}
        <MenuItem onClick={() => setOpen(false)} className="p-0">
          <FeedbackDialog className="w-full justify-start px-3 py-2" />
        </MenuItem>
        {showsAccount && (
          <MenuItem
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="text-muted-foreground"
          >
            Sign out
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  )
}

export function SiteHeader({
  isAuthed,
  isAdmin = false,
}: {
  isAuthed: boolean
  /**
   * Whether the signed-in account is on the `ADMIN_EMAILS` allowlist.
   *
   * Only consulted in local mode, and only to decide whether the chrome
   * mentions accounts at all. There, being signed in is an administrative fact
   * rather than a reader-facing one: plans are kept in the browser, no account
   * holds anything, and the single reason to have a session is `/admin`. A
   * reader should not meet the word "account" anywhere, and an admin still
   * needs the way back out.
   */
  isAdmin?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  /**
   * Whether the chrome says anything about accounts at all.
   *
   * Cloud mode: signed in means an account holds your plans, so Sign out
   * belongs there. Local mode: nothing is held by an account, and the only
   * person with a reason to have a session is an admin — so everyone else
   * sees a page that never mentions one.
   */
  const showsAccount = isAuthed && (!isLocal || isAdmin)

  const handleSignOut = async () => {
    await authClient.signOut()
    // The draft belongs to the account that was signed in.
    clearDraftCookie()
    router.push('/')
    router.refresh()
  }

  const navLink = (href: string, label: React.ReactNode, extra?: string) => (
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
          {/* A fairway: two arcs with clear water between them, which is what
              the name means to anybody navigating. The anchor that was here
              said the opposite — an anchor is for stopping, and this is a plan
              about passage. `currentColor` so it takes the tile's own
              foreground and needs no second asset for dark. */}
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="M2 3 C5 5.5 5 10.5 2 13" />
              <path d="M14 3 C11 5.5 11 10.5 14 13" />
            </svg>
          </span>
          <span className="hidden font-serif text-lg font-medium text-foreground sm:inline">
            Fairwater
          </span>
        </Link>

        {/* The full row, once there is room for it. Below `lg` every item
            moves into the menu instead, where each can have its whole name and
            nothing has to be shortened or dropped to make the line fit. */}
        <nav className="ml-auto hidden shrink-0 items-center gap-6 lg:flex">
          {navLink('/planner', 'Retirement Planner')}
          {/* Linked site-wide rather than from the footer alone: a page every
              other page points at is one a crawler treats as worth reading,
              and it answers the questions people arrive with. */}
          {navLink('/goal', 'Savings Estimator')}
          {navLink('/faq', 'FAQ')}
          {isAuthed && !isLocal && navLink('/dashboard', 'My plans')}
          <FeedbackDialog />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-0">
          <NavMenu
            isAuthed={isAuthed}
            showsAccount={showsAccount}
            pathname={pathname}
            onSignOut={handleSignOut}
          />
          {showsAccount ? (
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          ) : (
            /**
             * Nothing about accounts in local mode.
             *
             * There is nothing to sign in *for*: plans live in this browser
             * and no account would keep them. `/sign-in` still exists and
             * still works — it is how an admin reaches `/admin`, where the
             * analytics and the feedback still live — but it is not offered
             * to a reader who has no use for it. `/sign-up` is gone
             * altogether; see its page.
             *
             * Sign out above is deliberately not gated: an admin who signed
             * in has to be able to sign out again.
             */
            !isLocal && (
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
            )
          )}
        </div>
      </div>
    </header>
  )
}
