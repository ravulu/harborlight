import {
  EMPTY_HOUSEHOLD,
  EMPTY_REGISTER,
  type HouseholdFacts,
  type Register,
} from '@/lib/balance-sheet'
import { HOLDING_KINDS, type Holding, type HoldingKind } from '@/lib/holdings'
import { LIABILITY_KINDS, type Liability, type LiabilityKind } from '@/lib/liabilities'
import { DEFAULT_INPUTS, type PlanInputs } from '@/lib/retirement'

/**
 * Reading a payload nobody can migrate.
 *
 * A Postgres column is changed with `db:push` and every row moves with it. A
 * payload in somebody else's browser is changed only by code that later reads
 * it — so the reader has to cope with a shape written by any version that ever
 * shipped, including versions written after this one if they roll back.
 *
 * The rule is the one `readExpenses` already uses and this codebase has
 * already relied on: **start from the defaults and take only the keys you
 * recognise, of the type you expect.** A field added later loads at its
 * default rather than as `undefined` leaking into the arithmetic; a field
 * removed later is ignored rather than throwing; a field somebody hand-edited
 * to a string is refused rather than turning a projection into `NaN`.
 *
 * Nothing here trusts the payload. It came off a disk we do not control, and
 * the only thing worse than losing it is loading it into the engine unchecked.
 */

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)

const isStr = (v: unknown): v is string => typeof v === 'string'

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}

/**
 * Every plan input, defaulted from `DEFAULT_INPUTS`.
 *
 * Driven off the defaults rather than a hand-written field list, so a field
 * added to `PlanInputs` is carried here the moment it has a default — which it
 * must, since `DEFAULT_INPUTS` is typed as a complete `PlanInputs`. A list
 * maintained by hand is a list that goes stale, and the way it fails is a
 * saved plan quietly losing a field.
 */
export function normalisePlanInputs(raw: unknown): PlanInputs {
  const from = asRecord(raw)
  const out = { ...DEFAULT_INPUTS } as Record<string, unknown>

  for (const [key, fallback] of Object.entries(DEFAULT_INPUTS)) {
    const value = from[key]
    if (value === undefined) continue

    if (Array.isArray(fallback)) {
      // Only `dependentBirthYears` today, and it is years.
      if (Array.isArray(value)) out[key] = value.filter(isNum)
      continue
    }
    if (typeof fallback === 'number' && isNum(value)) out[key] = value
    else if (typeof fallback === 'string' && isStr(value)) out[key] = value
    else if (typeof fallback === 'boolean' && typeof value === 'boolean')
      out[key] = value
  }

  const inputs = out as unknown as PlanInputs

  // The two unions, coerced rather than trusted. `lib/plan.ts` does exactly
  // this to a stored row for the same reason: a value outside the union type
  // checks as a string and then reaches a switch that has no case for it.
  inputs.filingStatus = inputs.filingStatus === 'married' ? 'married' : 'single'
  inputs.healthCoverBefore65 =
    inputs.healthCoverBefore65 === 'own' || inputs.healthCoverBefore65 === 'none'
      ? inputs.healthCoverBefore65
      : 'marketplace'
  // Two letters or nothing. A long string here reaches `findState` and finds
  // nothing, which is the same answer, but it also reaches the screen.
  inputs.taxState = inputs.taxState.slice(0, 8)

  return inputs
}

const HOLDING_KIND_SET = new Set<string>(HOLDING_KINDS.map((k) => k.kind))
const LIABILITY_KIND_SET = new Set<string>(LIABILITY_KINDS.map((k) => k.kind))

/** Optional numeric fields, taken only when present and finite. */
const HOLDING_NUMBERS = [
  'ownedYears',
  'landSharePercent',
  'mortgage',
  'mortgageRatePercent',
  'monthlyRent',
  'propertyTax',
  'insurance',
  'maintenance',
  'interestPercent',
  'annualDepreciationShare',
  'annualDistribution',
  'sponsorFees',
  'promoteAtExit',
] as const

const HOLDING_FLAGS = [
  'primaryResidence',
  'interestPaidOut',
  'qsbs',
  'sponsors',
] as const

function normaliseHolding(raw: unknown, index: number): Holding | null {
  const from = asRecord(raw)
  const kind = from.kind
  // A kind this build does not know about cannot be priced, drawn or taxed.
  // Dropping the one row is better than failing the plan around it, and the
  // caller reports how many were dropped rather than losing them silently.
  if (!isStr(kind) || !HOLDING_KIND_SET.has(kind)) return null

  const holding: Holding = {
    id: isStr(from.id) && from.id ? from.id : `h${index}`,
    kind: kind as HoldingKind,
    name: isStr(from.name) ? from.name.slice(0, 80) : '',
    value: isNum(from.value) ? from.value : 0,
    basis: isNum(from.basis) ? from.basis : 0,
    growthPercent: isNum(from.growthPercent) ? from.growthPercent : 0,
    // Null is a real answer here — "never sold" — so it is kept rather than
    // defaulted away, and only a non-number becomes null.
    saleAge: isNum(from.saleAge) ? from.saleAge : null,
    counted: from.counted === true,
  }

  if (isNum(from.maturityYear)) holding.maturityYear = from.maturityYear
  for (const key of HOLDING_NUMBERS) {
    const v = from[key]
    if (isNum(v)) holding[key] = v
  }
  for (const key of HOLDING_FLAGS) {
    const v = from[key]
    if (typeof v === 'boolean') holding[key] = v
  }

  return holding
}

function normaliseLiability(raw: unknown, index: number): Liability | null {
  const from = asRecord(raw)
  const kind = from.kind
  if (!isStr(kind) || !LIABILITY_KIND_SET.has(kind)) return null

  return {
    id: isStr(from.id) && from.id ? from.id : `l${index}`,
    kind: kind as LiabilityKind,
    name: isStr(from.name) ? from.name.slice(0, 80) : '',
    // Never negative: a debt owing less than nothing is an asset, and it would
    // be added to net worth by a function that expects it not to be.
    balance: Math.max(0, isNum(from.balance) ? from.balance : 0),
    ratePercent: Math.max(0, isNum(from.ratePercent) ? from.ratePercent : 0),
    monthlyPayment: Math.max(0, isNum(from.monthlyPayment) ? from.monthlyPayment : 0),
  }
}

export function normaliseRegister(raw: unknown): Register {
  const from = asRecord(raw)
  if (!Array.isArray(from.holdings) && !Array.isArray(from.liabilities)) {
    return EMPTY_REGISTER
  }
  return {
    holdings: (Array.isArray(from.holdings) ? from.holdings : [])
      .map(normaliseHolding)
      .filter((h): h is Holding => h !== null),
    liabilities: (Array.isArray(from.liabilities) ? from.liabilities : [])
      .map(normaliseLiability)
      .filter((l): l is Liability => l !== null),
  }
}

export function normaliseHousehold(raw: unknown): HouseholdFacts {
  const from = asRecord(raw)
  return {
    name: isStr(from.name) ? from.name.slice(0, 120) : EMPTY_HOUSEHOLD.name,
    // Clamped at the read as well as the write, exactly as `saveHousehold`
    // clamps it: an age of 3053 sails through every later calculation without
    // once looking wrong enough to stop.
    currentAge: isNum(from.currentAge)
      ? Math.min(120, Math.max(0, Math.round(from.currentAge)))
      : EMPTY_HOUSEHOLD.currentAge,
    filingStatus: from.filingStatus === 'married' ? 'married' : 'single',
    taxState: isStr(from.taxState) ? from.taxState.slice(0, 8) : EMPTY_HOUSEHOLD.taxState,
  }
}
