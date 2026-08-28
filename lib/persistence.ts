/**
 * Where a household's figures live, decided once per deployment.
 *
 * `cloud` keeps plans, the household and the register in Postgres against an
 * account. `local` keeps them in the reader's own browser and the app has no
 * accounts at all — no sign-in, no sign-up, and nothing on our servers that
 * says what anybody owns. `docs/persistence-modes.md` is the design.
 *
 * Read here and nowhere else, so a grep for the mode finds every branch.
 */

export type PersistenceMode = 'cloud' | 'local'

/**
 * Anything unrecognised is `local`, and the direction is the point.
 *
 * A deployment that forgets the variable, or misspells it, stores nothing on
 * the server rather than quietly storing everything — the same way
 * `ADMIN_EMAILS` locks admins out rather than letting anyone in when it is
 * unset. Getting this backwards would be silent: the app would work perfectly
 * and write people's finances to a database nobody meant to fill.
 *
 * Kept as a pure function so the coercion can be tested without reaching for
 * the environment. `MODE` below is the value the app actually runs on.
 */
export function modeFrom(raw: string | undefined): PersistenceMode {
  return raw === 'cloud' ? 'cloud' : 'local'
}

/**
 * Bound at module load, which means bound at build for the client.
 *
 * `NEXT_PUBLIC_*` is inlined by `next build`, so the mode cannot change under a
 * running deployment — changing it is a redeploy. That is the right weight for
 * a decision about where somebody's finances are kept, and it is why this is a
 * constant rather than a function of the request.
 *
 * The literal `process.env.NEXT_PUBLIC_PERSISTENCE` has to appear here rather
 * than be built up from a variable: the inlining is a textual substitution, and
 * a dynamic lookup reaches the browser as `undefined`.
 */
export const MODE: PersistenceMode = modeFrom(process.env.NEXT_PUBLIC_PERSISTENCE)

export const isLocal = MODE === 'local'
export const isCloud = MODE === 'cloud'
