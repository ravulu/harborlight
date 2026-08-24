/**
 * Required minimum distributions.
 *
 * The rule that eventually empties a tax-deferred account whether or not its
 * owner wants the money: from a certain age a slice of last year's closing
 * balance has to come out each year and be taxed as ordinary income. It is the
 * reason the years before it are worth planning around, and a projection that
 * leaves it out reports a household drawing only what it spends — paying less
 * tax than it will, and keeping a balance it is not allowed to keep.
 *
 * Roth IRAs are not subject to it during the owner's lifetime, which is why
 * only the deferred pot is forced.
 */

/**
 * The age distributions begin, which SECURE 2.0 sets by birth year rather than
 * by a single number: 73 for 1951 to 1959, 75 for 1960 on. Most people
 * planning a retirement today are in the second group, so quoting 73 at
 * everyone would be wrong for the majority of them.
 */
export function rmdAge(currentAge: number, thisYear: number): number {
  const birthYear = thisYear - currentAge
  return birthYear >= 1960 ? 75 : 73
}

/**
 * The IRS Uniform Lifetime Table, as it has stood since 2022.
 *
 * The divisor is a life expectancy in years, so the distribution is a rising
 * share of the balance: a twenty-seventh at 72, a twentieth at 80, an eighth
 * at 95. That acceleration is the part people are surprised by — the tax
 * grows even on a balance that is shrinking.
 *
 * This is the table for an owner whose spouse is either not the sole
 * beneficiary or not more than ten years younger. The Joint Life table that
 * covers the exception gives smaller distributions, so using this one is the
 * conservative reading where it is wrong.
 */
export const UNIFORM_LIFETIME: Record<number, number> = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
  116: 2.8,
  117: 2.7,
  118: 2.5,
  119: 2.3,
  120: 2.0,
}

/** The youngest and oldest ages the table names. */
const FIRST_AGE = 72
const LAST_AGE = 120

/**
 * The divisor for an age, holding at the ends of the table.
 *
 * Below 72 the table does not apply at all, but a divisor is still returned
 * rather than zero so callers never divide by it accidentally; whether a
 * distribution is due is `rmdAge`'s question, not this one's. Above 120 the
 * table stops and the last row applies to every year after.
 */
export function rmdDivisor(age: number): number {
  const clamped = Math.min(Math.max(Math.floor(age), FIRST_AGE), LAST_AGE)
  return UNIFORM_LIFETIME[clamped]
}

/**
 * What must come out of a tax-deferred balance this year.
 *
 * `balance` is the closing balance of the previous year, which is the figure
 * the rule is written against — not the balance at the moment of withdrawal.
 * Returns zero before the start age, so a caller can apply it unconditionally.
 */
export function requiredDistribution(
  balance: number,
  age: number,
  startAge: number,
): number {
  if (age < startAge || balance <= 0) return 0
  return balance / rmdDivisor(age)
}
