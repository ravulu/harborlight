import os from 'node:os'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { PASSWORD_MIN, passwordProblem } from '@/lib/password'

import { pool } from '@/lib/db'

/**
 * The endpoints that take a new password.
 *
 * Listed rather than pattern-matched: a path this misses is a path with no
 * rules on it, and a typo in a regular expression fails silently in exactly
 * that direction.
 */
const PASSWORD_PATHS = new Set([
  '/sign-up/email',
  '/change-password',
  '/reset-password',
])

const isDev = process.env.NODE_ENV === 'development'
const port = process.env.PORT ?? 3000
// Set by the dev:https script. The scheme is decided by which script started
// the server, and nothing else in the process reveals it — better-auth reads
// the base URL to decide whether the session cookie may be marked Secure, and
// a cookie marked Secure over plain http is simply dropped by the browser, so
// it has to be told rather than guessed.
const devScheme = process.env.DEV_HTTPS === '1' ? 'https' : 'http'
const devURL = `${devScheme}://localhost:${port}`

/**
 * Every origin the dev server can be reached on, over either scheme.
 *
 * Opening it on its LAN address is a normal thing to do — a phone on the same
 * wifi, another laptop — and running it over TLS is now a normal thing to do
 * too. Both schemes are listed because the server's scheme is decided by which
 * script started it, and this module cannot see that: an https dev server with
 * only http origins trusted rejects every sign-up with "Invalid origin",
 * having already served the page that submitted it.
 */
const devHostnames = [
  'localhost',
  '127.0.0.1',
  ...Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address),
]
const devOrigins = devHostnames.flatMap((host) => [
  `http://${host}:${port}`,
  `https://${host}:${port}`,
])

/**
 * Set BETTER_AUTH_URL to the deployed origin in production. Locally it falls
 * back to the dev server's own URL so the value is never undefined, which
 * would otherwise make better-auth derive the origin from each request.
 *
 * In development the scheme follows the server rather than the file. A stored
 * http://localhost value would otherwise win over the https one this module
 * computed, and better-auth marks the session cookie Secure from this URL
 * alone — so the cookie would travel unprotected on a server that had gone to
 * the trouble of a certificate. Only the scheme is touched, never the host.
 */
/**
 * On Vercel, fall back to the project's stable production domain.
 *
 * BETTER_AUTH_URL is the only trusted origin in production, so a first deploy
 * that cannot yet know its own URL would reject every sign-up. The production
 * host is used rather than VERCEL_URL, which changes with each deployment:
 * trusting that would mean the cookie's origin moved every time anything
 * shipped.
 */
const vercelURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined
const configuredURL = process.env.BETTER_AUTH_URL ?? vercelURL
const baseURL = isDev
  ? configuredURL
    ? configuredURL.replace(/^https?:/, `${devScheme}:`)
    : devURL
  : configuredURL

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: {
    enabled: true,
    // Stated rather than left to the default, which happens to be the same
    // number. The floor is a decision about what this app holds, and a
    // decision that is only written down in somebody else's default is one
    // nobody here made.
    minPasswordLength: PASSWORD_MIN,
    // Signed in by an explicit call after sign-up instead, so both paths go
    // through the same one and get a session cookie that ends with the
    // browser. Sign-up's own auto sign-in takes no say in that.
    autoSignIn: false,
  },
  hooks: {
    /**
     * The password rules, enforced where they cannot be skipped.
     *
     * The sign-up form checks the same rules and says which are unmet, but
     * that is help rather than enforcement: `minLength` is a browser
     * behaviour, the checklist is React, and neither is between a script and
     * this endpoint. Length is the one part better-auth will hold on its own;
     * everything else is held here.
     *
     * Every path that sets a password, not only sign-up. A rule that applies
     * when an account is made and not when its password is changed is a rule
     * anybody can step around by changing it once.
     */
    before: createAuthMiddleware(async (ctx) => {
      if (!PASSWORD_PATHS.has(ctx.path)) return
      const body = ctx.body as { password?: unknown; newPassword?: unknown }
      const password = body?.newPassword ?? body?.password
      // Absent or the wrong type is not this hook's business — better-auth
      // rejects it, and guessing at a message for it here would put two
      // different errors in front of the same mistake.
      if (typeof password !== 'string') return
      const problem = passwordProblem(password)
      if (problem) throw new APIError('BAD_REQUEST', { message: problem })
    }),
  },
  user: {
    additionalFields: {
      // Taken at sign-up rather than derived from `name`, so a greeting uses
      // the name someone gave rather than the first word of it.
      firstName: { type: 'string', required: false, input: true },
      lastName: { type: 'string', required: false, input: true },
    },
  },
  trustedOrigins: [
    ...new Set([
      ...(baseURL ? [baseURL] : []),
      ...(isDev ? devOrigins : []),
    ]),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
})
