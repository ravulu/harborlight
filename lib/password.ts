/**
 * What this app will accept as a password, in one place.
 *
 * Written once because it is checked twice, and the two checks are not the
 * same kind of thing. The list under the field is a courtesy — it tells
 * somebody what is wrong while they can still fix it easily. The check on the
 * server is the rule: a form is markup, `minLength` is a hint the browser
 * enforces and anything else does not, and a request can be sent without ever
 * loading the page.
 *
 * The bar is here rather than left at a length because of what an account
 * holds. A saved plan carries an age, a household, balances, what somebody
 * expects from Social Security and what they owe — enough, together, to be
 * worth taking.
 */

/** Shortest we will take. Long beats clever, but a floor is still a floor. */
export const PASSWORD_MIN = 8

export interface PasswordRule {
  /** Stable across renders, so a list of these can be keyed by it. */
  id: string
  /** Said as the thing it must have, so the list reads as a checklist. */
  label: string
  met: (password: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN} characters`,
    met: (p) => p.length >= PASSWORD_MIN,
  },
  {
    id: 'upper',
    label: 'An uppercase letter',
    met: (p) => /[A-Z]/.test(p),
  },
  {
    id: 'lower',
    label: 'A lowercase letter',
    met: (p) => /[a-z]/.test(p),
  },
  {
    id: 'number',
    label: 'A number',
    met: (p) => /[0-9]/.test(p),
  },
  {
    id: 'symbol',
    // Anything that is not a letter or a digit counts, including a space.
    // Naming a permitted set is how a rule ends up rejecting the character
    // somebody's password manager just generated.
    label: 'A symbol, such as ! ? # or -',
    met: (p) => /[^A-Za-z0-9]/.test(p),
  },
]

/** Which rules a password fails. Empty means it is acceptable. */
export function failedRules(password: string): PasswordRule[] {
  return PASSWORD_RULES.filter((rule) => !rule.met(password))
}

export const isPasswordAcceptable = (password: string) =>
  failedRules(password).length === 0

/**
 * One sentence naming everything still missing.
 *
 * All of them at once rather than the first: a password rejected four times
 * for four reasons in turn is the same password four times, and the reader
 * learns the rule one humiliation at a time.
 */
export function passwordProblem(password: string): string | null {
  const failed = failedRules(password)
  if (failed.length === 0) return null
  const missing = failed.map((rule) => rule.label.toLowerCase())
  const listed =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}`
  return `Your password needs ${listed}.`
}
