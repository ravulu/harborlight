'use client'

import { isInterestBearing, type Holding, type HoldingKind } from '@/lib/holdings'
import type { Liability, LiabilityKind } from '@/lib/liabilities'
import type { FilingStatus } from '@/lib/state-tax'

/**
 * Nowhere, for a signed-out visitor.
 *
 * The rule: signed in, a refresh keeps everything, because it is rows against
 * an account. Signed out, a refresh clears it. A browser that remembers
 * somebody's house, their debts and their income shows all of it to whoever
 * opens it next — a shared machine, a family laptop, a library — and neither
 * localStorage nor sessionStorage is worth that for figures nobody asked us to
 * keep.
 *
 * So a signed-out balance sheet lives in the page and nowhere else. Keeping it
 * means signing in, and then it is not on the machine at all.
 *
 * Both keys this used to write to are cleared on sight: changing where writes
 * go does not remove what is already there, and the local one outlives the
 * browser closing.
 */
const RETIRED_KEY = 'harborlight_holdings'

/**
 * The one moment a signed-out balance sheet is written down.
 *
 * Not while it is typed — somebody signed out has asked for nothing until they
 * press Save. Pressing it sends them to sign in, and a redirect is a new page:
 * the plan travels in its cookie, and without this the register travelled in
 * nothing and arrived empty.
 *
 * sessionStorage because it has to survive that redirect and nothing more. The
 * tab closing takes it, so somebody who signs up somewhere else, or wanders
 * off instead, leaves nothing on the machine.
 */
const STASH_KEY = 'harborlight_register_pending'

/**
 * Everything typed while signed out, in one payload.
 *
 * Who you are travels with what you own. It used to be only the register, and
 * a household that had just been filled in arrived blank — worse, blank enough
 * to overwrite the age the plan's own cookie had carried across.
 */
export function stashPending(pending: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STASH_KEY, JSON.stringify(pending))
  } catch {
    // Storage blocked. They arrive signed in with an empty register, which is
    // the behaviour this replaces rather than something worse.
  }
}

/** Read once and removed, so a later reload cannot adopt the same figures again. */
export function takeStashedPending(): unknown | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY)
    window.sessionStorage.removeItem(STASH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function forgetBrowserCopies() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(RETIRED_KEY)
    window.sessionStorage.removeItem(RETIRED_KEY)
  } catch {
    // Storage blocked, so nothing was written to it either.
  }
}

const num = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback

/** Anything unrecognised is dropped: a user can edit their own storage. */
/**
 * A deposit or a loan entered before maturity became a year.
 *
 * Its end was stored as an age. Converted here rather than left for the screen
 * to puzzle over, using the age the household was when the record was read —
 * which is the only reference point either figure ever had.
 */
function withMaturityYear(h: Holding, currentAge: number, thisYear: number): Holding {
  if (!isInterestBearing(h) || h.maturityYear) return h
  if (h.saleAge === null) return h
  return { ...h, maturityYear: thisYear + (h.saleAge - currentAge) }
}

function cleanHolding(raw: unknown): Holding | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const kinds: HoldingKind[] = [
    'home',
    'realEstate',
    'syndication',
    'personal',
    'crypto',
    'fund',
    'business',
    'deposit',
    'note',
  ]
  if (typeof h.kind !== 'string' || !kinds.includes(h.kind as HoldingKind)) return null
  // A home entered before it had a kind of its own was a rental with a flag.
  // Promoted here so the tax rules follow the kind rather than the flag.
  const kind =
    h.kind === 'realEstate' && h.primaryResidence === true
      ? ('home' as HoldingKind)
      : (h.kind as HoldingKind)

  return {
    id: typeof h.id === 'string' ? h.id : newId(),
    kind,
    name: typeof h.name === 'string' ? h.name.slice(0, 80) : '',
    value: num(h.value, 0),
    basis: num(h.basis, 0),
    growthPercent: typeof h.growthPercent === 'number' ? h.growthPercent : 3,
    saleAge: typeof h.saleAge === 'number' ? h.saleAge : null,
    maturityYear: typeof h.maturityYear === 'number' ? h.maturityYear : null,
    counted: h.counted === true,
    ownedYears: num(h.ownedYears, 0),
    landSharePercent: num(h.landSharePercent, 20),
    mortgage: num(h.mortgage, 0),
    mortgageRatePercent: num(h.mortgageRatePercent, 0),
    // Rent used to be stored by the year. An older record is divided back
    // down rather than read as a monthly figure, which would multiply
    // somebody's rent by twelve on the first load after this changed.
    monthlyRent: num(h.monthlyRent, num(h.annualRent, 0) / 12),
    // An older record kept one "costs" figure. Carried into maintenance
    // rather than dropped, since that is the line it most likely stood for.
    propertyTax: num(h.propertyTax, 0),
    insurance: num(h.insurance, 0),
    maintenance: num(h.maintenance, num(h.annualExpenses, 0)),
    primaryResidence: h.primaryResidence === true,
    interestPercent: num(h.interestPercent, 0),
    interestPaidOut: h.interestPaidOut !== false,
    sponsors: h.sponsors === true,
    sponsorFees: num(h.sponsorFees, 0),
    promoteAtExit: num(h.promoteAtExit, 0),
    annualDepreciationShare: num(h.annualDepreciationShare, 0),
    annualDistribution: num(h.annualDistribution, 0),
    qsbs: h.qsbs === true,
  }
}

function cleanLiability(raw: unknown): Liability | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  const kinds: LiabilityKind[] = ['student', 'card', 'heloc', 'personal', 'other']
  if (typeof l.kind !== 'string' || !kinds.includes(l.kind as LiabilityKind)) return null
  return {
    id: typeof l.id === 'string' ? l.id : newId(),
    kind: l.kind as LiabilityKind,
    name: typeof l.name === 'string' ? l.name.slice(0, 80) : '',
    balance: num(l.balance, 0),
    ratePercent: num(l.ratePercent, 0),
    monthlyPayment: num(l.monthlyPayment, 0),
  }
}

export function blankLiability(kind: LiabilityKind): Liability {
  return {
    id: newId(),
    kind,
    name: '',
    balance: 0,
    // Rates that describe the instrument rather than the household. A card is
    // expensive and a student loan is not, and both are overwritten the moment
    // a real figure is typed.
    ratePercent: kind === 'card' ? 22 : kind === 'student' ? 6 : 8,
    monthlyPayment: 0,
  }
}

export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // Falls through to the clock.
  }
  return `h-${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

export function blankHolding(kind: HoldingKind): Holding {
  return {
    id: newId(),
    kind,
    name: '',
    value: 0,
    basis: 0,
    // A car is the one thing here that is worth less every year, so it starts
    // pointing the other way rather than making somebody type a minus sign.
    growthPercent: kind === 'crypto' ? 8 : kind === 'personal' ? -10 : 3,
    saleAge: null,
    counted: false,
    ...(kind === 'realEstate'
      ? {
          ownedYears: 0,
          landSharePercent: 20,
          mortgage: 0,
          mortgageRatePercent: 0,
          monthlyRent: 0,
          propertyTax: 0,
          insurance: 0,
          maintenance: 0,
          primaryResidence: false,
        }
      : {}),
    ...(kind === 'home'
      ? {
          mortgage: 0,
          mortgageRatePercent: 0,
          propertyTax: 0,
          insurance: 0,
          maintenance: 0,
          primaryResidence: true,
        }
      : {}),
    ...(kind === 'personal'
      ? { mortgage: 0, mortgageRatePercent: 0, insurance: 0, maintenance: 0 }
      : {}),
    ...(kind === 'syndication'
      ? {
          ownedYears: 0,
          annualDistribution: 0,
          annualDepreciationShare: 0,
          sponsors: false,
          sponsorFees: 0,
          promoteAtExit: 0,
        }
      : {}),
    ...(kind === 'deposit' || kind === 'note'
      ? {
          interestPercent: kind === 'deposit' ? 4 : 8,
          interestPaidOut: true,
          maturityYear: null,
        }
      : {}),
  }
}
