/**
 * What to call someone.
 *
 * Prefers the first name they actually gave. Falls back to the first word of
 * the combined name for anyone who signed up before the two were asked for
 * separately, and to nothing at all rather than a placeholder — a greeting
 * addressed to "there" is worse than a greeting that simply does not name you.
 */
export function firstNameOf(user?: {
  firstName?: string | null
  name?: string | null
}): string | null {
  const given = user?.firstName?.trim()
  if (given) return given
  const first = user?.name?.trim().split(/\s+/)[0]
  return first || null
}

/** e.g. "Good morning, Ravi" — the time of day is the machine's, not theirs. */
export function greetingFor(name: string | null, hour: number): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}
