import os from 'node:os'
import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

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
const configuredURL = process.env.BETTER_AUTH_URL
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
    // Signed in by an explicit call after sign-up instead, so both paths go
    // through the same one and get a session cookie that ends with the
    // browser. Sign-up's own auto sign-in takes no say in that.
    autoSignIn: false,
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
