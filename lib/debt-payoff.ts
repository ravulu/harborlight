import { LIABILITY_KINDS, type Liability } from '@/lib/liabilities'

/**
 * Clearing several debts at once, two ways.
 *
 * `payoff()` in `lib/liabilities.ts` prices one debt on its own, which is the
 * right answer to "how long will this card take" and the wrong answer to "how
 * long will all of this take". The difference is the **rollover**: pay the
 * minimum on everything, put whatever is spare against one target, and when
 * that target clears, its whole payment joins the spare money and goes at the
 * next one. Each debt that falls makes the next fall faster.
 *
 * That is the entire mechanism, and it is what makes either method beat paying
 * minimums. The two methods differ only in which debt is the target:
 *
 * - **Snowball** — the smallest balance first. Clears a debt sooner, which is
 *   the reason people who have tried both give for sticking with it.
 * - **Avalanche** — the highest rate first. Pays less interest, always.
 *
 * Neither is named the winner here. `lib/windows.test.ts` fails the build on
 * "you should", "we recommend" and "the best", and that is the house rule this
 * follows: price both, state the difference, let the reader decide. The
 * conversion and claiming ladders do the same thing.
 *
 * A month-by-month loop rather than a formula, because the order changes as
 * debts clear and there is no closed form for that. `docs/debt-payoff.md` is
 * the design.
 */

export type Method = 'snowball' | 'avalanche'

/** A debt reaching zero, which is the event the whole thing is about. */
export interface Cleared {
  id: string
  name: string
  /** Months from the start. 1 is the end of the first month. */
  month: number
  /** What that debt cost in interest along the way. */
  interest: number
}

export interface Schedule {
  method: Method
  /**
   * Months until the last debt clears, or null where the budget never gets
   * there.
   *
   * Null is a real answer and the one worth having. A payment at or below the
   * monthly interest clears nothing, and minimum payments on a card sit close
   * to that line by design — so "never, on these figures" is more useful than
   * a number in the hundreds, which is the same judgement `payoff()` makes for
   * a single debt.
   */
  months: number | null
  /** Total interest paid across every debt. Null when it never clears. */
  interest: number | null
  /** Each debt as it falls, in the order it fell. */
  cleared: Cleared[]
  /** What is still owed at the end of each month, for a chart. */
  balanceByMonth: number[]
}

export interface Comparison {
  /** Every debt, cleared by paying only the minimums. The baseline. */
  minimumsOnly: Schedule
  snowball: Schedule
  avalanche: Schedule
  /** The sum of the monthly payments already being made. */
  minimums: number
  /** Budget less minimums: what is actually doing the work. */
  surplus: number
  /**
   * Months and interest avalanche saves over snowball. Never negative for
   * interest — avalanche cannot lose on interest — and occasionally negative
   * for months, since ordering by rate can leave a large balance until last.
   */
  avalancheSaves: { months: number; interest: number } | null
  /** How much sooner snowball clears its first debt. Negative if it does not. */
  snowballFirstDebtSooner: number | null
  /**
   * The debt snowball gets rid of first, and how much sooner than the other
   * way clears *that same debt*.
   *
   * Named rather than counted, because "your first debt" is an abstraction and
   * "the Visa" is the thing somebody is actually waiting to be rid of. Measured
   * against the same debt in the other schedule rather than against whatever
   * that schedule happens to clear first — otherwise the name and the number
   * would be about two different debts, which is the kind of nearly-right
   * figure that is worse than none.
   */
  firstWin: { id: string; name: string; monthsSooner: number } | null
  /**
   * The two methods came to the same answer.
   *
   * Ordinary, not exceptional: with one debt there is nothing to order, and
   * with several the smallest balance is often also the highest rate, so the
   * orders coincide. Worth knowing because the page must not then report a
   * difference — "costs $0 less in interest" is what it said before this
   * existed, beside two rows claiming one clears sooner and the other costs
   * less when they were the same figures.
   */
  methodsAgree: boolean
}

/** Why a comparison could not be made. Null when it could. */
export type Refusal =
  | { kind: 'no-debts' }
  | { kind: 'budget-below-minimums'; minimums: number; short: number }

/**
 * A hundred years. Not a real payoff, just a stop.
 *
 * The no-progress check below catches the ordinary never-clears case in a
 * month or two. This is for the pathological one it cannot: a balance falling
 * by a fraction of a cent a month, which technically progresses forever.
 */
const MAX_MONTHS = 1200

/** Under half a cent is paid off. Floats do not land on zero. */
const CLEARED = 0.005

interface Working {
  id: string
  name: string
  balance: number
  monthlyRate: number
  minimum: number
  interest: number
}

/**
 * The order debts are attacked in.
 *
 * Ties are broken deliberately rather than left to sort stability: two cards
 * with the same balance should not swap places because one was typed first.
 * Snowball breaks a balance tie by rate, avalanche breaks a rate tie by
 * balance — each falling back on the other method's rule, which is the least
 * arbitrary answer available.
 */
function order(debts: Working[], method: Method): Working[] {
  return [...debts].sort((a, b) =>
    method === 'snowball'
      ? a.balance - b.balance || b.monthlyRate - a.monthlyRate || a.id.localeCompare(b.id)
      : b.monthlyRate - a.monthlyRate || a.balance - b.balance || a.id.localeCompare(b.id),
  )
}

function run(debts: Liability[], budget: number, method: Method): Schedule {
  const open: Working[] = debts
    .filter((l) => l.balance > 0)
    .map((l) => ({
      id: l.id,
      // Unnamed debts fall back to what kind they are, not to "Debt" — the
      // order a method clears things in is the useful half of the answer, and
      // "Debt → Debt → Debt" throws it away. The register's own list makes the
      // same substitution, as the placeholder in its name box.
      name: l.name.trim() || LIABILITY_KINDS.find((k) => k.kind === l.kind)?.label || 'Debt',
      balance: l.balance,
      monthlyRate: Math.max(0, l.ratePercent) / 100 / 12,
      minimum: Math.max(0, l.monthlyPayment),
      interest: 0,
    }))

  const cleared: Cleared[] = []
  const balanceByMonth: number[] = []
  let month = 0

  while (open.some((d) => d.balance > CLEARED) && month < MAX_MONTHS) {
    month++
    const owedBefore = open.reduce((s, d) => s + d.balance, 0)

    /**
     * The target order, taken before anything happens this month.
     *
     * Computed after interest and minimums it produced an artefact: two debts
     * of equal balance, one at 0% and one at 25%, are no longer equal once the
     * month's interest lands, so the untouched one sorts first and snowball
     * attacks the debt it costs least to leave alone. Recomputing mid-month
     * can also flip the target as balances cross, and "keep going until it
     * clears" is what snowball means.
     *
     * Taken from the balances the reader would see on a statement, once a
     * month, and held for that month.
     */
    const targets = order(open, method)

    // Interest first, on the balance carried into the month, before anything
    // is paid — which is the order a lender applies it.
    for (const d of open) {
      if (d.balance <= CLEARED) continue
      const charge = d.balance * d.monthlyRate
      d.balance += charge
      d.interest += charge
    }

    /**
     * Everything available this month.
     *
     * The budget, not the minimums — so a debt that has cleared frees its
     * payment into the pool automatically rather than needing to be added to
     * anything. That is the rollover, and expressing it as "the budget is the
     * budget" is why there is no separate bookkeeping for it.
     */
    let available = budget

    // Minimums first, on everything still open, so no debt is left to grow
    // while another is targeted.
    for (const d of open) {
      if (d.balance <= CLEARED) continue
      const pay = Math.min(d.minimum, d.balance, available)
      d.balance -= pay
      available -= pay
    }

    // Then the rest, at the target — and past it, since clearing a debt
    // mid-month leaves money that should not sit idle until the next one.
    for (const d of targets) {
      if (available <= 0) break
      if (d.balance <= CLEARED) continue
      const pay = Math.min(available, d.balance)
      d.balance -= pay
      available -= pay
    }

    for (const d of open) {
      if (d.balance <= CLEARED && !cleared.some((c) => c.id === d.id)) {
        d.balance = 0
        cleared.push({ id: d.id, name: d.name, month, interest: d.interest })
      }
    }

    const owedAfter = open.reduce((s, d) => s + d.balance, 0)
    balanceByMonth.push(owedAfter)

    /**
     * Nothing moved, so nothing ever will.
     *
     * Every payment was eaten by interest. Running to the hundred-year stop
     * would answer eventually, but this answers in two months and says the
     * true thing: on these figures the debt does not clear.
     */
    if (owedAfter >= owedBefore - CLEARED && month > 1) {
      return { method, months: null, interest: null, cleared, balanceByMonth }
    }
  }

  if (open.some((d) => d.balance > CLEARED)) {
    return { method, months: null, interest: null, cleared, balanceByMonth }
  }

  return {
    method,
    months: month,
    interest: open.reduce((s, d) => s + d.interest, 0),
    cleared,
    balanceByMonth,
  }
}

/**
 * Both methods, and the baseline they are measured against.
 *
 * Returns a refusal rather than a comparison where one cannot honestly be
 * made. A budget below the minimums is not a slow payoff, it is a household
 * that cannot make its payments, and reporting two identical never-clears
 * would read as a broken calculator rather than as the finding it is.
 */
export function comparePayoff(
  debts: Liability[],
  monthlyBudget: number,
): { ok: true; comparison: Comparison } | { ok: false; refusal: Refusal } {
  const live = debts.filter((l) => l.balance > 0)
  if (live.length === 0) return { ok: false, refusal: { kind: 'no-debts' } }

  const minimums = live.reduce((s, l) => s + Math.max(0, l.monthlyPayment), 0)
  if (monthlyBudget < minimums) {
    return {
      ok: false,
      refusal: {
        kind: 'budget-below-minimums',
        minimums,
        short: minimums - monthlyBudget,
      },
    }
  }

  // The baseline is the same machinery with nothing spare — so it still gets
  // the rollover, which is what somebody paying only minimums actually
  // experiences, rather than the sum of each debt priced alone.
  const minimumsOnly = run(live, minimums, 'avalanche')
  const snowball = run(live, monthlyBudget, 'snowball')
  const avalanche = run(live, monthlyBudget, 'avalanche')

  const saves =
    snowball.months !== null &&
    avalanche.months !== null &&
    snowball.interest !== null &&
    avalanche.interest !== null
      ? {
          months: snowball.months - avalanche.months,
          interest: snowball.interest - avalanche.interest,
        }
      : null

  const firstOf = (s: Schedule) => s.cleared[0]?.month ?? null
  const snowballFirst = firstOf(snowball)
  const avalancheFirst = firstOf(avalanche)

  const firstGone = snowball.cleared[0]
  const sameUnderAvalanche = firstGone
    ? avalanche.cleared.find((c) => c.id === firstGone.id)
    : undefined
  const firstWin =
    firstGone && sameUnderAvalanche
      ? {
          id: firstGone.id,
          name: firstGone.name,
          monthsSooner: sameUnderAvalanche.month - firstGone.month,
        }
      : null

  return {
    ok: true,
    comparison: {
      minimumsOnly,
      snowball,
      avalanche,
      minimums,
      surplus: monthlyBudget - minimums,
      avalancheSaves: saves,
      firstWin,
      methodsAgree:
        snowball.months === avalanche.months &&
        Math.abs((snowball.interest ?? 0) - (avalanche.interest ?? 0)) < 1,
      snowballFirstDebtSooner:
        snowballFirst !== null && avalancheFirst !== null
          ? avalancheFirst - snowballFirst
          : null,
    },
  }
}
