'use server'

import { headers } from 'next/headers'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { events } from '@/lib/db/schema'
import { isEventName } from '@/lib/events'
import { isAdminEmail } from '@/lib/admin'

const MAX_PATH = 200
const MAX_SESSION = 64
const MAX_REFERRER = 300
const MAX_PLACE = 80

/**
 * Whether to record anything at all.
 *
 * Development is not recorded, because development is you. The address list
 * below cannot help there: a request to a local server carries no
 * `x-forwarded-for` at all — that header is set by a proxy, and on localhost
 * there is none — so every local visit looks like an unknown address and is
 * kept. Rather than maintain a list that cannot match, the whole path is off
 * unless the app is running in production.
 *
 * Set ANALYTICS_IN_DEV=1 to record locally while working on the tracking
 * itself, which is the only time it is wanted.
 */
const recording = () =>
  process.env.NODE_ENV === 'production' || process.env.ANALYTICS_IN_DEV === '1'

/**
 * Addresses whose visits are not recorded.
 *
 * Your own, so that browsing the deployed site does not become part of the
 * funnel. Only has an effect in production, where a proxy in front of the app
 * puts the caller's address on the request. Comma-separated; unset means
 * nothing is excluded by address.
 */
const excludedIps = () =>
  (process.env.ANALYTICS_EXCLUDE_IPS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * The caller's address, read only to decide whether to record them.
 *
 * Never stored and never returned to anything that stores. It is personal data
 * under most reading of the law, and the only question this app has for it is
 * "is this me?".
 */
function callerIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for') ?? ''
  return (forwarded.split(',')[0] || h.get('x-real-ip') || '').trim()
}

/** Roughly where, from whatever the edge put on the request. */
function place(h: Headers) {
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = h.get(n)
      if (v) return decodeURIComponent(v).slice(0, MAX_PLACE)
    }
    return ''
  }
  return {
    country: pick('x-vercel-ip-country', 'cf-ipcountry', 'x-country-code'),
    region: pick('x-vercel-ip-country-region', 'x-region-code'),
    city: pick('x-vercel-ip-city', 'x-city'),
  }
}

/** Query strings can carry figures from the goal page; the path alone cannot. */
const cleanPath = (path: string) => path.split('?')[0].slice(0, MAX_PATH)

/**
 * Record that something happened.
 *
 * Deliberately narrow. It takes an event name from a fixed list, the path it
 * happened on, and an opaque id for the browser run — and nothing else. No
 * figure anybody typed reaches this function, which is what keeps the promise
 * the FAQ makes about the projection staying on their own device.
 *
 * Whether they are signed in is read from the session here rather than passed
 * in, for the same reason the feedback action reads it: a caller can say
 * anything.
 *
 * Never throws. Analytics failing is not a reason for a page to fail, and a
 * visitor should never see a worse app because a write to this table did not
 * land.
 */
export async function track(
  name: string,
  path: string,
  session: string,
  referrer = '',
): Promise<void> {
  try {
    if (!recording()) return
    if (!isEventName(name)) return
    const runId = session.trim().slice(0, MAX_SESSION)
    if (!runId) return

    const h = await headers()
    if (excludedIps().includes(callerIp(h))) return

    const signedIn = await auth.api.getSession({ headers: h })
    // Whoever runs the app is not a visitor to it. Their own clicking would
    // otherwise be a large share of a small funnel, and the numbers would
    // flatter or frighten for no reason.
    if (isAdminEmail(signedIn?.user?.email)) return

    await db.insert(events).values({
      session: runId,
      name,
      path: cleanPath(path),
      isAuthed: !!signedIn?.user,
      referrer: referrer.slice(0, MAX_REFERRER),
      ...place(h),
    })
  } catch {
    // Swallowed on purpose. See above.
  }
}
