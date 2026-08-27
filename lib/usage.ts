'use client'

import { track } from '@/app/actions/events'
import type { EventName } from '@/lib/events'

/**
 * The id for one browser run.
 *
 * sessionStorage, not a cookie and not localStorage: it lives as long as the
 * tab and no longer, so it identifies a visit rather than a person. Nobody can
 * be followed across days or sites with it, which is why none of this needs a
 * consent banner — and why a returning visitor is simply a new visit, which is
 * the right unit for asking where people give up anyway.
 *
 * The same reasoning the session guard already uses for deciding whether a
 * browser run has been vouched for.
 */
const KEY = 'fairwater_visit'

function runId(): string {
  try {
    const existing = window.sessionStorage.getItem(KEY)
    if (existing) return existing
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    // Storage blocked. Nothing is recorded rather than a new id being minted
    // on every call, which would turn one visit into a crowd.
    return ''
  }
}

/** Only the first event of a run carries it, so it is the visit's source. */
const REFERRER_SENT = 'fairwater_visit_ref'

function referrerOnce(): string {
  try {
    if (window.sessionStorage.getItem(REFERRER_SENT)) return ''
    window.sessionStorage.setItem(REFERRER_SENT, '1')
    const ref = document.referrer
    // Our own pages are not a source; they are the visit continuing.
    if (!ref || ref.startsWith(window.location.origin)) return ''
    return ref
  } catch {
    return ''
  }
}

/** Fire once per run for milestones that would otherwise repeat on re-render. */
const fired = new Set<string>()

/**
 * Record a milestone.
 *
 * Never awaited by the caller and never allowed to throw: the app should
 * behave identically whether or not this lands.
 */
export function record(name: EventName, path?: string, once = false): void {
  try {
    const id = runId()
    if (!id) return
    const where = path ?? window.location.pathname
    if (once) {
      const key = `${name}:${where}`
      if (fired.has(key)) return
      fired.add(key)
    }
    void track(name, where, id, referrerOnce())
  } catch {
    // As above.
  }
}
