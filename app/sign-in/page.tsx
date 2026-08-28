import { isLocal } from '@/lib/persistence'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'
import {
  REMEMBERED_EMAIL_COOKIE,
  parseRememberedEmail,
} from '@/lib/remembered-email'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/auth-form'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'

import { pageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

export const metadata: Metadata = pageMetadata({
  title: 'Sign in',
  description:
    'Sign in to Fairwater to open your saved retirement plans.',
  path: '/sign-in',
})

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const rememberedEmail = parseRememberedEmail(
    (await cookies()).get(REMEMBERED_EMAIL_COOKIE)?.value,
  )
  if (session?.user) redirect('/')

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader isAuthed={false} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <AuthForm adminOnly={isLocal} mode="sign-in" rememberedEmail={rememberedEmail} />
      </main>
      <SiteFooter />
    </div>
  )
}
