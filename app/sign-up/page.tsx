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
  title: 'Create a free account',
  description:
    'Save your retirement plans and come back to them. Free, no card, and the planner works without an account too.',
  path: '/sign-up',
})

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const rememberedEmail = parseRememberedEmail(
    (await cookies()).get(REMEMBERED_EMAIL_COOKIE)?.value,
  )
  if (session?.user) redirect('/')

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader isAuthed={false} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <AuthForm mode="sign-up" rememberedEmail={rememberedEmail} />
      </main>
      <SiteFooter />
    </div>
  )
}
