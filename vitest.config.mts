import { defineConfig } from 'vitest/config'

/**
 * The suite covers `lib/` — the projection, the tax engine and the insight
 * prose that quotes it. All of it is plain TypeScript with no DOM behind it,
 * so the node environment is enough; a jsdom environment and React Testing
 * Library only become necessary once components are under test.
 *
 * `resolve.tsconfigPaths` is what teaches Vitest the `@/*` alias the app
 * imports by, so a test can import `@/lib/tax` exactly as the code under it
 * does. Vite reads it from tsconfig.json natively — the vite-tsconfig-paths
 * plugin the Next guide still recommends is deprecated in favour of this.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // `cron-jobs/` too: the extractors are held to the same standard as the
    // engines, and the check that matters most — that a parser reproduces the
    // table somebody already verified by hand — is a unit test against a saved
    // document rather than anything that touches the network.
    include: ['lib/**/*.test.ts', 'cron-jobs/**/*.test.ts'],
  },
})
