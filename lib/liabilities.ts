/**
 * What the household owes that is not secured against anything on the list.
 *
 * A mortgage and a car loan already live with the thing they are attached to,
 * because what they change is that asset's equity. These do not: a student
 * loan, a card balance, a line of credit against a house that has already been
 * counted. They are the other side of the balance sheet, and a net-worth
 * figure without them is an asset list.
 *
 * Kept apart from `Holding` rather than folded in as another kind. A liability
 * has no cost basis, no growth rate, nothing to sell and no tax on the way
 * out — sharing the shape would put a guard in every function that reads it.
 */

export type LiabilityKind = 'student' | 'card' | 'heloc' | 'personal' | 'other'

export const LIABILITY_KINDS: {
  kind: LiabilityKind
  label: string
  hint: string
}[] = [
  { kind: 'student', label: 'Student loan', hint: 'Yours or one you cosigned' },
  { kind: 'card', label: 'Credit card', hint: 'What is carried, not what is spent' },
  { kind: 'heloc', label: 'Line of credit', hint: 'A HELOC or similar' },
  { kind: 'personal', label: 'Personal loan', hint: 'Unsecured borrowing' },
  { kind: 'other', label: 'Something else', hint: 'Tax owed, family, anything' },
]

export interface Liability {
  id: string
  kind: LiabilityKind
  name: string
  /** What is outstanding today. */
  balance: number
  ratePercent: number
  /** What is paid against it each month. Zero means it is not being paid down. */
  monthlyPayment: number
}

/** The interest a year of carrying it costs, at today's balance. */
export const annualInterest = (l: Liability) =>
  l.balance * (l.ratePercent / 100)

export const totalOwed = (ls: Liability[]) =>
  ls.reduce((sum, l) => sum + Math.max(0, l.balance), 0)

export const totalMonthlyPayments = (ls: Liability[]) =>
  ls.reduce((sum, l) => sum + Math.max(0, l.monthlyPayment), 0)

export interface Payoff {
  /** Years until it clears. Null where the payment never gets there. */
  years: number | null
  /** Interest paid over the whole of it, or over a lifetime where it never clears. */
  interest: number | null
}

/**
 * How long it takes, and what carrying it costs on the way.
 *
 * The case worth catching is the one that never ends: a payment at or below
 * the monthly interest clears nothing, because the balance is back where it
 * started by the time the next one is due. Minimum payments on a card sit
 * close to that line by design, and a figure of "never" is a more useful
 * answer than a number in the hundreds.
 */
export function payoff(l: Liability): Payoff {
  const balance = Math.max(0, l.balance)
  const payment = Math.max(0, l.monthlyPayment)
  if (balance === 0) return { years: 0, interest: 0 }
  if (payment === 0) return { years: null, interest: null }

  const monthlyRate = l.ratePercent / 100 / 12
  if (monthlyRate === 0) {
    const months = balance / payment
    return { years: months / 12, interest: 0 }
  }

  const monthlyInterest = balance * monthlyRate
  // Everything the payment can manage is eaten by the interest.
  if (payment <= monthlyInterest) return { years: null, interest: null }

  // The standard amortisation term, solved for the number of payments.
  const months =
    -Math.log(1 - (monthlyRate * balance) / payment) / Math.log(1 + monthlyRate)
  return { years: months / 12, interest: payment * months - balance }
}
