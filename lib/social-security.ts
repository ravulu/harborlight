/**
 * Full retirement age for anyone born in 1960 or later.
 */
export const FULL_RETIREMENT_AGE = 67

/** Credits stop accruing here, so claiming later than this only loses money. */
export const MAX_CLAIM_AGE = 70
export const MIN_CLAIM_AGE = 62

/**
 * What a benefit is worth at a given claim age, as a multiple of the amount
 * due at full retirement age.
 *
 * Claiming early costs 5/9 of 1% a month for the first 36 months and 5/12 of
 * 1% a month beyond that — 30% at 62. Waiting past full retirement age earns
 * 2/3 of 1% a month, 8% a year, up to 70: 124% there. Nothing accrues after
 * 70.
 *
 * Without this the model would pay the same benefit whenever it was claimed,
 * which would make waiting look like a pure loss instead of a trade.
 */
export function benefitFactor(
  claimAge: number,
  fullRetirementAge: number = FULL_RETIREMENT_AGE,
): number {
  const capped = Math.min(claimAge, MAX_CLAIM_AGE)
  const months = Math.round((capped - fullRetirementAge) * 12)

  if (months === 0) return 1

  if (months < 0) {
    const early = -months
    const first = Math.min(36, early) * (5 / 9 / 100)
    const rest = Math.max(0, early - 36) * (5 / 12 / 100)
    return Math.max(0, 1 - first - rest)
  }

  return 1 + months * (2 / 3 / 100)
}

/** e.g. "70% of your full benefit" / "124% of your full benefit" */
export const benefitFactorLabel = (claimAge: number) =>
  `${Math.round(benefitFactor(claimAge) * 100)}%`

/** A spousal benefit is worth at most half of the worker's full benefit. */
export const SPOUSAL_SHARE = 0.5

/**
 * What a spousal benefit is worth at a given claim age, as a multiple of the
 * full 50% share.
 *
 * A different schedule from a worker's own benefit, and reduced harder: 25/36
 * of 1% a month for the first 36 months early, then 5/12 of 1% — 35% down at
 * 62, so 32.5% of the worker's full benefit rather than half of it.
 *
 * Nothing accrues past full retirement age. Delayed credits do not apply to a
 * spousal benefit at all, which is the asymmetry worth modelling: waiting to
 * 70 lifts a worker's own benefit to 124% and leaves the spousal half exactly
 * where it was.
 */
export function spousalFactor(
  claimAge: number,
  fullRetirementAge: number = FULL_RETIREMENT_AGE,
): number {
  const months = Math.round((Math.min(claimAge, fullRetirementAge) - fullRetirementAge) * 12)
  if (months >= 0) return 1
  const early = -months
  const first = Math.min(36, early) * (25 / 36 / 100)
  const rest = Math.max(0, early - 36) * (5 / 12 / 100)
  return Math.max(0, 1 - first - rest)
}

/**
 * What the spouse actually receives each month, in today's dollars.
 *
 * Deemed filing pays the larger of the two, never both stacked: a spouse whose
 * own record already beats half the worker's full benefit gets nothing from
 * the spousal rules.
 */
export function spouseMonthlyBenefit(
  workerFullMonthly: number,
  spouseOwnFullMonthly: number,
  spouseClaimAge: number,
  spousalStartAge: number,
): { own: number; spousal: number; paid: number } {
  const own = spouseOwnFullMonthly * benefitFactor(spouseClaimAge)
  const spousal = workerFullMonthly * SPOUSAL_SHARE * spousalFactor(spousalStartAge)
  return { own, spousal, paid: Math.max(own, spousal) }
}
