import os from 'node:os'
import type { NextConfig } from 'next'

// Next blocks cross-origin requests to dev-only assets, so opening the dev
// server on its LAN address (the "Network" URL it prints) serves HTML but 403s
// the JS chunks — the page renders, never hydrates, and forms fall back to a
// native GET. Allow this machine's own addresses. Computed rather than
// hardcoded so a new DHCP lease doesn't silently break it again. 127.0.0.1 is
// listed explicitly — it is an internal interface, so the filter skips it.
export const devHosts = [
  '127.0.0.1',
  ...Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address),
]

/**
 * Sent on every response.
 *
 * A plan holds someone's balances and their tax position, so the headers that
 * cost nothing are worth having: nothing may frame the app, the browser may
 * not guess at content types, and a referrer never carries a path to another
 * origin.
 *
 * HSTS is production-only on purpose. It tells a browser to refuse plain HTTP
 * for this host for two years, and a browser that learns it from a dev server
 * on localhost will hold that against every other project on the same port.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  ...(process.env.NODE_ENV === 'production'
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
]

const nextConfig: NextConfig = {
  allowedDevOrigins: devHosts,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
