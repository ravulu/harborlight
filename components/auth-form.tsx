'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { forgetEmail, rememberEmail } from '@/lib/remembered-email'
import { markSignedIn } from '@/components/session-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'

export function AuthForm({
  mode,
  rememberedEmail = '',
}: {
  mode: 'sign-in' | 'sign-up'
  /** Read from the cookie while rendering, so the box is filled on first paint. */
  rememberedEmail?: string
}) {
  const router = useRouter()
  // Only ever a path on this site. A next= pointing anywhere else would turn
  // the sign-in page into an open redirect.
  const nextParam = useSearchParams().get('next')
  const next =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/'
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState(rememberedEmail)
  const [remember, setRemember] = useState(rememberedEmail !== '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === 'sign-up'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isSignUp) {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        // Better Auth wants one name; the halves are kept as well so a
        // greeting never has to guess where the first one ends.
        name: [firstName.trim(), lastName.trim()].filter(Boolean).join(' '),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      if (signUpError) {
        setLoading(false)
        setError(signUpError.message ?? 'Something went wrong')
        return
      }
    }

    // Both paths sign in here, so both get the same cookie. rememberMe: false
    // is not a preference — it leaves the cookie without an expiry of its own,
    // which is what makes the browser drop it on close.
    const { error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: false,
    })

    setLoading(false)

    if (error) {
      setError(error.message ?? 'Something went wrong')
      return
    }

    // This browser run is the one that signed in, so vouch for it before the
    // guard on the next page gets a chance to disown the session.
    markSignedIn()

    // Only once the credentials were accepted, so a typo is never kept.
    if (remember) rememberEmail(email)
    else forgetEmail()

    router.push(next)
    router.refresh()
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isSignUp ? 'Create an account' : 'Welcome back'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isSignUp
            ? 'Sign up to get started'
            : 'Sign in to your account to continue'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isSignUp && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                autoComplete="family-name"
              />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 cursor-pointer rounded border-border accent-primary"
          />
          Remember my email on this device
        </label>
        <p className="-mt-2 text-xs text-muted-foreground text-pretty">
          Only the address, to save typing it. You are signed out when you close
          the browser either way.
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading
            ? 'Please wait...'
            : isSignUp
              ? 'Create account'
              : 'Sign in'}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground text-center mt-6">
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        {/* Carries the return path across: someone sent here to save a plan
            who chooses to create an account instead must still come back to
            it, or the work is dropped by the one link that looked harmless. */}
        <Link
          href={`${isSignUp ? '/sign-in' : '/sign-up'}${
            next !== '/' ? `?next=${encodeURIComponent(next)}` : ''
          }`}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {isSignUp ? 'Sign in' : 'Sign up'}
        </Link>
      </p>
    </Card>
  )
}
