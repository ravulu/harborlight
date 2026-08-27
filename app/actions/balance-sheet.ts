'use server'

import { and, asc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { holdings, household, liabilities, retirementPlans } from '@/lib/db/schema'
import type { Holding, HoldingKind } from '@/lib/holdings'
import type { Liability, LiabilityKind } from '@/lib/liabilities'
import {
  EMPTY_HOUSEHOLD,
  type HouseholdFacts,
  type Register,
  isBlankHousehold,
} from '@/lib/balance-sheet'

/**
 * The household and its balance sheet, which belong to the person rather than
 * to any one plan.
 *
 * Age, filing status and state used to sit on every plan and on the register
 * too, so one household could be single in California on one tab and married
 * in Texas on the other. They are asked once now and stored once.
 *
 * Every read and write is scoped by the session's own user id. Nothing here
 * takes an id from the caller, because a caller can say anything.
 */

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getHousehold(): Promise<HouseholdFacts> {
  const userId = await getUserId()
  const [row] = await db.select().from(household).where(eq(household.userId, userId))
  return row
    ? {
        name: row.name,
        currentAge: row.currentAge,
        filingStatus: row.filingStatus === 'married' ? 'married' : 'single',
        taxState: row.taxState,
      }
    : EMPTY_HOUSEHOLD
}

export async function saveHousehold(facts: HouseholdFacts): Promise<void> {
  const userId = await getUserId()
  const values = {
    userId,
    name: facts.name.slice(0, 120),
    // Clamped at the write as well as at the field. A server action is
    // callable by anything, and an age of 3053 sails through every later
    // calculation without once looking wrong enough to stop.
    currentAge: Math.min(
      120,
      Math.max(0, Math.round(Number.isFinite(facts.currentAge) ? facts.currentAge : 0)),
    ),
    filingStatus: facts.filingStatus === 'married' ? 'married' : 'single',
    taxState: facts.taxState.slice(0, 8),
    updatedAt: new Date(),
  }
  /**
   * Never blank a household that is not already blank.
   *
   * This is the only thing that writes the row, and it wrote whatever it was
   * handed. The client saves 800ms after any change, so a single render
   * holding an empty household — a page that has not loaded it yet, a session
   * caught mid-restore — silently destroyed a name, an age and a state, and
   * every later render then saved the blank back over itself.
   *
   * An empty household is never worth storing: there is nothing in it to keep.
   * Refusing it costs a reader who genuinely clears every field the storing of
   * that, which is not a thing anybody wants done.
   */
  if (isBlankHousehold(facts)) {
    const [stored] = await db
      .select()
      .from(household)
      .where(eq(household.userId, userId))
    if (stored && !isBlankHousehold(stored as unknown as HouseholdFacts)) return
  }

  await db
    .insert(household)
    .values(values)
    .onConflictDoUpdate({ target: household.userId, set: values })
}

/** What one plan assumes the household owns and owes. */
export async function getPlanRegister(planId: number): Promise<Register> {
  const userId = await getUserId()
  const hs = await db
    .select()
    .from(holdings)
    .where(and(eq(holdings.userId, userId), eq(holdings.planId, planId)))
    .orderBy(asc(holdings.position))
  const ls = await db
    .select()
    .from(liabilities)
    .where(and(eq(liabilities.userId, userId), eq(liabilities.planId, planId)))
    .orderBy(asc(liabilities.position))

  return {
    holdings: hs.map((h) => ({
      id: h.id,
      kind: h.kind as HoldingKind,
      name: h.name,
      value: h.value,
      basis: h.basis,
      growthPercent: h.growthPercent,
      saleAge: h.saleAge,
      maturityYear: h.maturityYear,
      counted: h.counted,
      ownedYears: h.ownedYears,
      landSharePercent: h.landSharePercent,
      mortgage: h.mortgage,
      mortgageRatePercent: h.mortgageRatePercent,
      monthlyRent: h.monthlyRent,
      propertyTax: h.propertyTax,
      insurance: h.insurance,
      maintenance: h.maintenance,
      primaryResidence: h.primaryResidence,
      interestPercent: h.interestPercent,
      interestPaidOut: h.interestPaidOut,
      qsbs: h.qsbs,
      annualDepreciationShare: h.annualDepreciationShare,
      annualDistribution: h.annualDistribution,
      sponsors: h.sponsors,
      sponsorFees: h.sponsorFees,
      promoteAtExit: h.promoteAtExit,
    })),
    liabilities: ls.map((l) => ({
      id: l.id,
      kind: l.kind as LiabilityKind,
      name: l.name,
      balance: l.balance,
      ratePercent: l.ratePercent,
      monthlyPayment: l.monthlyPayment,
    })),
  }
}

/**
 * Store what a plan assumes, replacing whatever it assumed before.
 *
 * Rewritten rather than diffed: it is a handful of rows, the order on the page
 * is part of what is being saved, and a diff is more code to get subtly wrong
 * than the write it replaces. Called from `savePlan` and `updatePlan` — there
 * is no separate act of saving a register, because a register without a plan
 * is not a scenario.
 */
/** Anything not a finite number is a zero, not a reason to lose the save. */
const clean = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

export async function savePlanRegister(
  planId: number,
  register: Register,
): Promise<void> {
  const userId = await getUserId()
  // Belt and braces: a plan cannot own rows on somebody else's plan, and a
  // planId that is not theirs is not an error to report but a request to
  // ignore.
  const [owned] = await db
    .select({ id: retirementPlans.id })
    .from(retirementPlans)
    .where(and(eq(retirementPlans.id, planId), eq(retirementPlans.userId, userId)))
  if (!owned) throw new Error('That plan could not be found on your account.')
  await db.transaction(async (tx) => {
    await tx
      .delete(holdings)
      .where(and(eq(holdings.userId, userId), eq(holdings.planId, planId)))
    await tx
      .delete(liabilities)
      .where(and(eq(liabilities.userId, userId), eq(liabilities.planId, planId)))

    if (register.holdings.length > 0) {
      await tx.insert(holdings).values(
        register.holdings.map((h, position) => ({
          id: `${planId}-${h.id}`,
          userId,
          planId,
          position,
          kind: h.kind,
          name: h.name.slice(0, 80),
          value: clean(h.value),
          basis: clean(h.basis),
          growthPercent: clean(h.growthPercent),
          saleAge: typeof h.saleAge === 'number' ? h.saleAge : null,
          maturityYear: typeof h.maturityYear === 'number' ? h.maturityYear : null,
          counted: h.counted,
          ownedYears: clean(h.ownedYears, 0),
          landSharePercent: clean(h.landSharePercent, 20),
          mortgage: clean(h.mortgage, 0),
          mortgageRatePercent: clean(h.mortgageRatePercent, 0),
          monthlyRent: clean(h.monthlyRent, 0),
          propertyTax: clean(h.propertyTax, 0),
          insurance: clean(h.insurance, 0),
          maintenance: clean(h.maintenance, 0),
          primaryResidence: h.primaryResidence ?? false,
          interestPercent: clean(h.interestPercent, 0),
          interestPaidOut: h.interestPaidOut ?? true,
          qsbs: h.qsbs ?? false,
          annualDepreciationShare: clean(h.annualDepreciationShare),
          annualDistribution: clean(h.annualDistribution),
          sponsors: h.sponsors ?? false,
          sponsorFees: clean(h.sponsorFees),
          promoteAtExit: clean(h.promoteAtExit),
        })),
      )
    }

    if (register.liabilities.length > 0) {
      await tx.insert(liabilities).values(
        register.liabilities.map((l, position) => ({
          // Prefixed so copying a plan cannot collide with the original's rows.
          id: `${planId}-${l.id}`,
          userId,
          planId,
          position,
          kind: l.kind,
          name: l.name.slice(0, 80),
          balance: Math.max(0, clean(l.balance)),
          ratePercent: Math.max(0, clean(l.ratePercent)),
          monthlyPayment: Math.max(0, clean(l.monthlyPayment)),
        })),
      )
    }
  })
}
