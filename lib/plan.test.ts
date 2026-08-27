import { describe, expect, it } from 'vitest'
import {
  inputsToPlan,
  planDiffers,
  planToInputs,
  registerDiffers,
} from '@/lib/plan'
import { blankHolding, blankLiability } from '@/lib/holdings-store'
import { isBlankHousehold } from '@/lib/balance-sheet'
import type { RetirementPlan } from '@/lib/db/schema'
import { DEFAULT_INPUTS, type PlanInputs } from '@/lib/retirement'

/**
 * A plan has to come back the way it went in.
 *
 * The read mapping was consolidated long ago; the write mapping was not, and
 * had drifted by nine fields — an employer match, an HSA, a survivor age and
 * every health-cover setting were dropped on save and quietly replaced by
 * schema defaults on the next open. Nothing caught it because each side was
 * correct about the fields it knew about.
 */
describe('saving a plan and opening it again', () => {
  /** Every field set to something that is not its default. */
  const distinctive: PlanInputs = {
    ...DEFAULT_INPUTS,
    currentAge: 53,
    retirementAge: 56,
    endAge: 91,
    annualSalary: 210_000,
    employerMatchPercent: 4,
    employerMatchLimitPercent: 6,
    hsaBalance: 42_000,
    hsaMonthlyContribution: 350,
    healthCoverBefore65: 'own',
    healthPremiumMonthly: 1_450,
    healthAfter65Monthly: 310,
    dependentBirthYears: [2010, 2013],
    survivorFromAge: 84,
    filingStatus: 'married',
    taxState: 'CA',
  }

  it('carries every field the schema holds, in both directions', () => {
    const written = inputsToPlan(distinctive)
    // Round-tripped through the row shape the database hands back.
    const read = planToInputs(written as unknown as RetirementPlan)
    for (const key of Object.keys(written) as (keyof PlanInputs)[]) {
      expect(read[key], key).toEqual(distinctive[key])
    }
  })

  it('stores everything the read side needs, bar what is deliberately not kept', () => {
    // If these two ever drift again this is the test that says so, rather than
    // a reader finding their health cover reset to marketplace.
    //
    // The conversion figures are the one thing deliberately not kept: they are
    // a comparison being explored rather than a setting somebody chose, and
    // they have no column. They are optional on `PlanInputs`, so the read side
    // simply leaves them out rather than inventing a default.
    const written = new Set(Object.keys(inputsToPlan(distinctive)))
    const read = Object.keys(
      planToInputs(inputsToPlan(distinctive) as unknown as RetirementPlan),
    )
    expect(read.filter((k) => !written.has(k))).toEqual([])
    for (const k of written) expect(read, k).toContain(k)
    expect(written.has('conversionAnnual')).toBe(false)
  })

  it('keeps the health settings that used to be dropped', () => {
    const written = inputsToPlan(distinctive)
    expect(written.healthCoverBefore65).toBe('own')
    expect(written.healthPremiumMonthly).toBe(1_450)
    expect(written.healthAfter65Monthly).toBe(310)
    expect(written.hsaBalance).toBe(42_000)
    expect(written.employerMatchPercent).toBe(4)
    expect(written.survivorFromAge).toBe(84)
    expect(written.dependentBirthYears).toEqual([2010, 2013])
  })
})

describe('whether there is anything to save', () => {
  const stored = { ...DEFAULT_INPUTS, currentAge: 53, monthlyRetirementSpending: 4_000 }

  it('says no when nothing has been touched', () => {
    expect(planDiffers(stored, { ...stored })).toBe(false)
  })

  it('says yes for any field the database keeps', () => {
    expect(planDiffers(stored, { ...stored, currentAge: 54 })).toBe(true)
    expect(planDiffers(stored, { ...stored, taxState: 'NY' })).toBe(true)
    expect(planDiffers(stored, { ...stored, dependentBirthYears: [2012] })).toBe(true)
  })

  it('ignores the conversion figures, which are not kept', () => {
    // A ladder is a comparison somebody is trying, not a setting they chose.
    // Reporting the plan unsaved every time one is explored would teach people
    // to ignore the word.
    expect(planDiffers(stored, { ...stored, conversionAnnual: 40_000 })).toBe(false)
    expect(planDiffers(stored, { ...stored, conversionFromAge: 60 })).toBe(false)
  })

  it('says no when there is nothing loaded to compare against', () => {
    expect(planDiffers(null, stored)).toBe(false)
    expect(planDiffers(stored, null)).toBe(false)
  })
})

describe('whether the register has moved', () => {
  const holding = { ...blankHolding('home'), id: 'a', name: 'House', value: 800_000 }
  const base = { holdings: [holding], liabilities: [] }

  it('says no for the same figures', () => {
    expect(registerDiffers(base, { holdings: [{ ...holding }], liabilities: [] })).toBe(false)
  })

  it('says no when only the ids differ', () => {
    // A holding gets a fresh id when added and a derived one when stored, so
    // comparing them would report the register changed for having been saved.
    expect(
      registerDiffers(base, { holdings: [{ ...holding, id: '221-a' }], liabilities: [] }),
    ).toBe(false)
  })

  it('says yes for a figure, a new row, or a removed one', () => {
    expect(
      registerDiffers(base, { holdings: [{ ...holding, value: 900_000 }], liabilities: [] }),
    ).toBe(true)
    expect(registerDiffers(base, { holdings: [], liabilities: [] })).toBe(true)
    expect(
      registerDiffers(base, {
        holdings: [holding, { ...blankHolding('personal'), id: 'b' }],
        liabilities: [],
      }),
    ).toBe(true)
  })

  it('notices a liability as readily as a holding', () => {
    expect(
      registerDiffers(base, {
        holdings: [holding],
        liabilities: [{ ...blankLiability('card'), id: 'x', balance: 5_000 }],
      }),
    ).toBe(true)
  })
})

describe('a household that says nothing', () => {
  const filled = {
    name: 'Ravi',
    currentAge: 53,
    filingStatus: 'single' as const,
    taxState: 'CA',
  }

  it('knows a blank one when it sees it', () => {
    expect(isBlankHousehold({ ...filled, name: '', currentAge: 0, taxState: '' })).toBe(true)
    expect(isBlankHousehold({ ...filled, name: '  ', currentAge: 0, taxState: ' ' })).toBe(true)
  })

  it('counts any one of the three as filled in', () => {
    expect(isBlankHousehold(filled)).toBe(false)
    expect(isBlankHousehold({ ...filled, currentAge: 0, taxState: '' })).toBe(false)
    expect(isBlankHousehold({ ...filled, name: '', taxState: '' })).toBe(false)
    expect(isBlankHousehold({ ...filled, name: '', currentAge: 0 })).toBe(false)
  })

  it('does not treat filing status as something filled in', () => {
    // It has a default rather than a blank, so a household is not "filled in"
    // for having one — and taking it as content would let a wholly empty
    // household pass the guard that exists to stop it being written.
    expect(
      isBlankHousehold({ name: '', currentAge: 0, filingStatus: 'married', taxState: '' }),
    ).toBe(true)
  })
})
