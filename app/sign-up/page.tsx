import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'
import {
  REMEMBERED_EMAIL_COOKIE,
  parseRememberedEmail,
} from '@/lib/remembered-email'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { isLocal } from '@/lib/persistence'
import { AuthForm } from '@/components/auth-form'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'Create a free account',
  description:
    'Save your retirement plans and come back to them. Free, no card, and the planner works without an account too.',
  path: '/sign-up',
})

export default async function SignUpPage() {
  /**
   * Reachable in local mode, and useless to almost everybody.
   *
   * It was a 404 for a day, which closed the only route to making the one
   * account local mode has any use for — the administrator's. An allowlisted
   * address that has never set a password had no way to set one, and `/admin`
   * needs a session.
   *
   * So the page stands and the *endpoint* decides: `/sign-up/email` refuses
   * any address that is not in `ADMIN_EMAILS` (see `lib/auth.ts`). A stranger
   * who finds this page can fill it in and will be told no, which is the same
   * answer they would get anywhere else here.
   */
  const session = await auth.api.getSession({ headers: await headers() })
  const rememberedEmail = parseRememberedEmail(
    (await cookies()).get(REMEMBERED_EMAIL_COOKIE)?.value,
  )
  if (session?.user) redirect('/')

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader isAuthed={false} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <AuthForm mode="sign-up" rememberedEmail={rememberedEmail} adminOnly={isLocal} />
      </main>
      <SiteFooter />
    </div>
  )
}
