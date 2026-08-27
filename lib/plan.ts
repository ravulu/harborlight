import type { RetirementPlan } from '@/lib/db/schema'
import type { PlanInputs } from '@/lib/retirement'
import type { Register } from '@/lib/balance-sheet'

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
    annualSalary: p.annualSalary,
    employerMatchPercent: p.employerMatchPercent,
    employerMatchLimitPercent: p.employerMatchLimitPercent,
    hsaBalance: p.hsaBalance,
    hsaMonthlyContribution: p.hsaMonthlyContribution,
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
    healthCoverBefore65:
      p.healthCoverBefore65 === 'own' || p.healthCoverBefore65 === 'none'
        ? p.healthCoverBefore65
        : 'marketplace',
    healthPremiumMonthly: p.healthPremiumMonthly,
    dependentBirthYears: p.dependentBirthYears ?? [],
    healthAfter65Monthly: p.healthAfter65Monthly,
    socialSecurityMonthly: p.socialSecurityMonthly,
    socialSecurityAge: p.socialSecurityAge,
    socialSecurityCola: p.socialSecurityCola,
    spouseBenefitMonthly: p.spouseBenefitMonthly,
    spouseClaimAge: p.spouseClaimAge,
    survivorFromAge: p.survivorFromAge,
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

/**
 * The same plan going the other way.
 *
 * The read above was consolidated because there were three copies of it. The
 * write never was, and had two — which had drifted by nine fields: an employer
 * match, an HSA, a survivor age and every health-cover setting were being
 * dropped on save and silently restored to schema defaults on the next open.
 * Anybody who chose marketplace cover, saved, and came back found it gone.
 *
 * Derived from the same field list as `planToInputs`, so a column added to one
 * side cannot go missing from the other.
 */
export function inputsToPlan(inputs: PlanInputs) {
  return {
    currentAge: inputs.currentAge,
    retirementAge: inputs.retirementAge,
    endAge: inputs.endAge,
    brokerageBalance: inputs.brokerageBalance,
    brokerageGainShare: inputs.brokerageGainShare,
    balance401k: inputs.balance401k,
    traditionalIraBalance: inputs.traditionalIraBalance,
    rothIraBalance: inputs.rothIraBalance,
    monthlyContribution: inputs.monthlyContribution,
    annualSalary: inputs.annualSalary,
    employerMatchPercent: inputs.employerMatchPercent,
    employerMatchLimitPercent: inputs.employerMatchLimitPercent,
    hsaBalance: inputs.hsaBalance,
    hsaMonthlyContribution: inputs.hsaMonthlyContribution,
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
    healthCoverBefore65: inputs.healthCoverBefore65,
    healthPremiumMonthly: inputs.healthPremiumMonthly,
    dependentBirthYears: inputs.dependentBirthYears,
    healthAfter65Monthly: inputs.healthAfter65Monthly,
    socialSecurityMonthly: inputs.socialSecurityMonthly,
    socialSecurityAge: inputs.socialSecurityAge,
    socialSecurityCola: inputs.socialSecurityCola,
    spouseBenefitMonthly: inputs.spouseBenefitMonthly,
    spouseClaimAge: inputs.spouseClaimAge,
    survivorFromAge: inputs.survivorFromAge,
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
}

/**
 * Whether what is on screen differs from what was last stored.
 *
 * Compared through `inputsToPlan`, so it asks exactly one question: would
 * pressing Save write anything different? A field the database has no column
 * for cannot make a plan unsaved, which matters for the conversion figures —
 * they are a comparison somebody is exploring, not a setting they chose, and a
 * plan that reported itself unsaved every time a ladder was tried would teach
 * people to ignore the word.
 *
 * Derived from the same mapping the save uses, so a column added later is
 * covered here without anybody remembering to add it.
 */
export function planDiffers(a: PlanInputs | null, b: PlanInputs | null): boolean {
  if (!a || !b) return false
  return JSON.stringify(inputsToPlan(a)) !== JSON.stringify(inputsToPlan(b))
}

/**
 * The same question for the register.
 *
 * Ids are left out of it. A holding gets a fresh one when it is added and a
 * derived one when it is stored, so comparing them would report a register as
 * changed for having been saved — which is the one moment it certainly has not.
 * What is being asked is whether the figures differ, and an id is not a figure.
 */
export function registerDiffers(a: Register, b: Register): boolean {
  // Blanked rather than destructured away: pulling the key out leaves a
  // variable nothing reads, and the point is the comparison, not the omission.
  const strip = (r: Register) =>
    JSON.stringify({
      holdings: r.holdings.map((h) => ({ ...h, id: '' })),
      liabilities: r.liabilities.map((l) => ({ ...l, id: '' })),
    })
  return strip(a) !== strip(b)
}