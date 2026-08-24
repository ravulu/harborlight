'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

import { record } from '@/lib/usage'

/**
 * Records which pages a visit reached.
 *
 * Mounted once in the layout, so it sees client-side navigations as well as
 * the first load — without it a visit that moved from the homepage to the
 * planner would look like a bounce.
 *
 * Nothing is recorded but the path. Query strings are stripped before the row
 * is written, because the goal page carries figures in its handoff link.
 *
 * The last path is remembered rather than left to the effect's dependencies:
 * in development React invokes effects twice on purpose, which wrote every
 * page view to the table twice and made local numbers worth double what they
 * should be. Comparing against what was last sent is a truer statement of the
 * rule anyway — record a page when it changes, not when an effect runs.
 */
export function UsageTracker() {
  const pathname = usePathname()
  const sent = useRef<string | null>(null)

  useEffect(() => {
    if (sent.current === pathname) return
    sent.current = pathname
    record('page_view', pathname)
  }, [pathname])

  return null
}
