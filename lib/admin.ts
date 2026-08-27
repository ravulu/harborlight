import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
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
 * One refusal, not two. Signed out, signed in as someone else, on the list but
 * with the wrong address — every one of them gets the same 404. To anyone who
 * is not a signed-in admin, /admin was never built.
 *
 * An earlier version redirected the signed-out case to /sign-in?next=/admin,
 * reasoning that a 404 leaves a real admin at a dead end with no way forward.
 * That is true, and it is also the one thing on these pages that still
 * answered a stranger's question: a redirect confirms that something lives at
 * this path and wants a session, where a 404 says nothing at all.
 *
 * Giving it up costs the admin close to nothing here. Sessions end with the
 * browser by design, so an admin is signed out on essentially every visit and
 * goes through /sign-in either way; the redirect saved one step, once per
 * session, for the handful of people on the list. Bookmarking
 * /sign-in?next=/admin gets that step back without putting the path in front
 * of anyone else.
 *
 * Called by every server action as well as the layout — a layout guards what
 * it renders, and an action is an endpoint anyone can post to regardless of
 * which page it was written for.
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user || !isAdminEmail(session.user.email)) notFound()
  return session.user
}
