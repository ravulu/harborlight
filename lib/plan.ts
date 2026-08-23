import type { RetirementPlan } from '@/lib/db/schema'
import type { PlanInputs } from '@/lib/retirement'

/**
 * A stored plan as the model wants it.
 *
 * One copy, because there were three and a field added to the schema had to be
 * remembered in all of them — a plan opened through one path and compared
 * through another would otherwise disagree about its own figures.
 */
export function planToInputs(p: RetirementPlan): PlanInputs {
  return {
    currentAge: p.currentAge,
    retirementAge: p.retirementAge,
    endAge: p.endAge,
    brokerageBalance: p.brokerageBalance,
    brokerageGainShare: p.brokerageGainShare,
    balance401k: p.balance401k,
    traditionalIraBalance: p.traditionalIraBalance,
    rothIraBalance: p.rothIraBalance,
    monthlyContribution: p.monthlyContribution,
    preRetirementReturn: p.preRetirementReturn,
    preRetirementVolatility: p.preRetirementVolatility,
    postRetirementReturn: p.postRetirementReturn,
    postRetirementVolatility: p.postRetirementVolatility,
    inflationRate: p.inflationRate,
    monthlyRetirementSpending: p.monthlyRetirementSpending,
    spendingStep1Age: p.spendingStep1Age,
    spendingStep1Monthly: p.spendingStep1Monthly,
    spendingStep2Age: p.spendingStep2Age,
    spendingStep2Monthly: p.spendingStep2Monthly,
    socialSecurityMonthly: p.socialSecurityMonthly,
    socialSecurityAge: p.socialSecurityAge,
    socialSecurityCola: p.socialSecurityCola,
    spouseBenefitMonthly: p.spouseBenefitMonthly,
    spouseClaimAge: p.spouseClaimAge,
    pensionMonthly: p.pensionMonthly,
    pensionStartAge: p.pensionStartAge,
    pensionCola: p.pensionCola,
    otherIncomeMonthly: p.otherIncomeMonthly,
    otherIncomeStartAge: p.otherIncomeStartAge,
    federalTaxRate: p.federalTaxRate,
    stateTaxRate: p.stateTaxRate,
    taxState: p.taxState,
    filingStatus: (p.filingStatus === 'married' ? 'married' : 'single') as
      | 'single'
      | 'married',
  }
}
