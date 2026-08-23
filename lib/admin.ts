import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

/**
 * Who may use the admin pages.
 *
 * An allowlist in the environment rather than a column on the user, because a
 * role in the database is one bad UPDATE away from being granted to whoever
 * asks for it, and this list has to be changed on the server by someone with
 * deploy access. Empty by default: a deployment that forgets to set it locks
 * everyone out, which is the safe direction to fail.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const list = adminEmails()
  return list.length > 0 && list.includes(email.trim().toLowerCase())
}

/**
 * The gate. Returns the admin's own session user, or ends the request.
 *
 * Two different refusals, because "you are not signed in" and "you are not an
 * admin" are different situations:
 *
 *   - No session at all: sign in first, and come back here. The app ends its
 *     session when the browser closes, so this is the ordinary state on every
 *     visit, and a 404 there is a dead end with no way forward — the admin
 *     cannot tell it from a page that does not exist. It reveals only that
 *     something at /admin wants a session, which is true of /dashboard too.
 *
 *   - Signed in but not on the list: 404. Telling someone who has already
 *     identified themselves that there is a page here they may not have is
 *     information they can act on. To them /admin was never built.
 *
 * Called by every server action as well as the layout — a layout guards what
 * it renders, and an action is an endpoint anyone can post to regardless of
 * which page it was written for.
 */
export async function requireAdmin(returnTo = '/admin') {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`)
  if (!isAdminEmail(session.user.email)) notFound()
  return session.user
}
