'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { retirementPlans, type NewRetirementPlan } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { PlanInputs } from '@/lib/retirement'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getPlans() {
  const userId = await getUserId()
  return db
    .select()
    .from(retirementPlans)
    .where(eq(retirementPlans.userId, userId))
    .orderBy(desc(retirementPlans.updatedAt))
}

export async function savePlan(name: string, personName: string, inputs: PlanInputs) {
  const userId = await getUserId()
  const values: NewRetirementPlan = {
    userId,
    name: name.trim() || 'Untitled plan',
    personName: personName.trim().slice(0, 120),
    currentAge: inputs.currentAge,
    retirementAge: inputs.retirementAge,
    endAge: inputs.endAge,
    brokerageBalance: inputs.brokerageBalance,
    brokerageGainShare: inputs.brokerageGainShare,
    balance401k: inputs.balance401k,
    traditionalIraBalance: inputs.traditionalIraBalance,
    rothIraBalance: inputs.rothIraBalance,
    monthlyContribution: inputs.monthlyContribution,
    preRetirementReturn: inputs.preRetirementReturn,
    preRetirementVolatility: inputs.preRetirementVolatility,
    postRetirementReturn: inputs.postRetirementReturn,
    postRetirementVolatility: inputs.postRetirementVolatility,
    inflationRate: inputs.inflationRate,
    monthlyRetirementSpending: inputs.monthlyRetirementSpending,
    spendingStep1Age: inputs.spendingStep1Age,
    spendingStep1Monthly: inputs.spendingStep1Monthly,
    spendingStep2Age: inputs.spendingStep2Age,
    spendingStep2Monthly: inputs.spendingStep2Monthly,
    socialSecurityMonthly: inputs.socialSecurityMonthly,
    socialSecurityAge: inputs.socialSecurityAge,
    socialSecurityCola: inputs.socialSecurityCola,
    spouseBenefitMonthly: inputs.spouseBenefitMonthly,
    spouseClaimAge: inputs.spouseClaimAge,
    pensionMonthly: inputs.pensionMonthly,
    pensionStartAge: inputs.pensionStartAge,
    pensionCola: inputs.pensionCola,
    otherIncomeMonthly: inputs.otherIncomeMonthly,
    otherIncomeStartAge: inputs.otherIncomeStartAge,
    federalTaxRate: inputs.federalTaxRate,
    stateTaxRate: inputs.stateTaxRate,
    taxState: inputs.taxState,
    filingStatus: inputs.filingStatus,
  }
  const [row] = await db.insert(retirementPlans).values(values).returning()
  revalidatePath('/dashboard')
  return row
}

export async function updatePlan(
  id: number,
  name: string,
  personName: string,
  inputs: PlanInputs,
) {
  const userId = await getUserId()
  await db
    .update(retirementPlans)
    .set({
      name: name.trim() || 'Untitled plan',
      personName: personName.trim().slice(0, 120),
      currentAge: inputs.currentAge,
      retirementAge: inputs.retirementAge,
      endAge: inputs.endAge,
      brokerageBalance: inputs.brokerageBalance,
      brokerageGainShare: inputs.brokerageGainShare,
      balance401k: inputs.balance401k,
      traditionalIraBalance: inputs.traditionalIraBalance,
      rothIraBalance: inputs.rothIraBalance,
      monthlyContribution: inputs.monthlyContribution,
      preRetirementReturn: inputs.preRetirementReturn,
      preRetirementVolatility: inputs.preRetirementVolatility,
      postRetirementReturn: inputs.postRetirementReturn,
      postRetirementVolatility: inputs.postRetirementVolatility,
      inflationRate: inputs.inflationRate,
      monthlyRetirementSpending: inputs.monthlyRetirementSpending,
      spendingStep1Age: inputs.spendingStep1Age,
      spendingStep1Monthly: inputs.spendingStep1Monthly,
      spendingStep2Age: inputs.spendingStep2Age,
      spendingStep2Monthly: inputs.spendingStep2Monthly,
      socialSecurityMonthly: inputs.socialSecurityMonthly,
      socialSecurityAge: inputs.socialSecurityAge,
      socialSecurityCola: inputs.socialSecurityCola,
      spouseBenefitMonthly: inputs.spouseBenefitMonthly,
      spouseClaimAge: inputs.spouseClaimAge,
      pensionMonthly: inputs.pensionMonthly,
      pensionStartAge: inputs.pensionStartAge,
      pensionCola: inputs.pensionCola,
      otherIncomeMonthly: inputs.otherIncomeMonthly,
      otherIncomeStartAge: inputs.otherIncomeStartAge,
      federalTaxRate: inputs.federalTaxRate,
      stateTaxRate: inputs.stateTaxRate,
      taxState: inputs.taxState,
      filingStatus: inputs.filingStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(retirementPlans.id, id), eq(retirementPlans.userId, userId)))
  revalidatePath('/dashboard')
}

export async function deletePlan(id: number) {
  const userId = await getUserId()
  await db
    .delete(retirementPlans)
    .where(and(eq(retirementPlans.id, id), eq(retirementPlans.userId, userId)))
  revalidatePath('/dashboard')
}
