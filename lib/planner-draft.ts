import { EMPTY_DRAFT, MONEY_FIELDS, toPlanInputs, type PlanDraft } from '@/lib/retirement'
import { CUSTOM_RATES, findState, usesDerivedRates } from '@/lib/state-tax'
import { estimateRates } from '@/lib/tax'

/**
 * Rates that follow the chosen state rather than the user are a function of
 * the plan, so they are recomputed rather than trusted: on every edit, and on
 * load, since a stored rate can be older than the brackets or than the plan
 * it was derived from. Rates the user set by hand are left alone.
 */
export function withDerivedRates(draft: PlanDraft): PlanDraft {
  if (!usesDerivedRates(draft.taxState)) return draft
  const complete = toPlanInputs(draft)
  if (!complete) return draft
  const est = estimateRates(complete, draft.taxState, draft.filingStatus)
  return { ...draft, federalTaxRate: est.federal, stateTaxRate: est.state }
}

/**
 * A signed-in user's in-progress plan, kept in a cookie rather than
 * localStorage so the server can read it and render the values on first
 * paint — no empty-then-filled flash, and no state sync in an effect.
 */
export const DRAFT_COOKIE = 'harborlight_draft'
export const DRAFT_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

/**
 * Bumped when a stored field changes meaning rather than shape.
 *
 * Version 2 redefined an empty taxState. It used to mark rates the user had
 * set by hand; it now means no state income tax, with the federal rate
 * derived. Without the marker an older draft would keep its hand-set rates on
 * load and then lose them to the first edit.
 */
export const DRAFT_VERSION = 2

export interface StoredDraft {
  draft: PlanDraft
  name: string
  /** Who the plan is for. Empty is normal — it is never required. */
  personName: string
}

interface StoredEnvelope extends StoredDraft {
  v?: number
}

/** Parses an untrusted cookie value. Returns null rather than throwing. */
export function parseDraftCookie(raw: string | undefined): StoredDraft | null {
  if (!raw) return null
  try {
    const parsed: StoredEnvelope & { draft?: Record<string, unknown> } = JSON.parse(
      decodeURIComponent(raw),
    )
    if (!parsed || typeof parsed !== 'object') return null

    const draft: PlanDraft = { ...EMPTY_DRAFT }
    const source = (parsed.draft ?? {}) as Record<string, unknown>

    for (const key of Object.keys(EMPTY_DRAFT) as (keyof PlanDraft)[]) {
      const value = source[key]

      // The string fields need naming explicitly. An earlier version only
      // copied numbers, which silently dropped the chosen state and filing
      // status — and since the draft is what gets saved, dropped them from
      // the stored plan too.
      if (key === 'taxState') {
        const valid =
          typeof value === 'string' &&
          (value === '' || value === CUSTOM_RATES || findState(value))
        const code = valid ? (value as string) : ''
        // Before version 2 an empty code meant hand-set rates, so honour that
        // rather than deriving over figures the user chose.
        // Pinned to the version that introduced the change rather than to
        // DRAFT_VERSION, so bumping the version for something unrelated
        // cannot silently re-apply this to drafts that already have the new
        // meaning.
        draft.taxState = code === '' && (parsed.v ?? 1) < 2 ? CUSTOM_RATES : code
      } else if (key === 'filingStatus') {
        draft.filingStatus = value === 'married' ? 'married' : 'single'
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        draft[key] = value as never
      } else if (value === null && (MONEY_FIELDS as readonly string[]).includes(key)) {
        draft[key] = null as never
      }
    }

    // Savings used to be a single currentSavings figure before it was split
    // into a brokerage and a tax-deferred balance. Without this the two new
    // fields stay null, and because a null money field means the plan is
    // incomplete, the whole projection disappears — no results, no spending
    // note, and tax rates frozen at whatever was stored rather than derived
    // from the chosen state.
    const legacySavings = source.currentSavings ?? source.retirementAccountBalance
    const balances = [
      'brokerageBalance',
      'balance401k',
      'traditionalIraBalance',
      'rothIraBalance',
    ] as const
    if (
      balances.every((k) => draft[k] === null) &&
      typeof legacySavings === 'number' &&
      Number.isFinite(legacySavings)
    ) {
      // To the tax-deferred pot. Both fields this replaces were taxed as
      // ordinary income on withdrawal, which is what a 401(k) balance means,
      // and guessing a brokerage share would invent a tax treatment the user
      // never described.
      draft.balance401k = legacySavings
    }

    const name = typeof parsed.name === 'string' ? parsed.name.slice(0, 120) : ''
    const personName =
      typeof parsed.personName === 'string' ? parsed.personName.slice(0, 120) : ''
    return { draft: withDerivedRates(draft), name: name || 'My retirement plan', personName }
  } catch {
    return null
  }
}

export function serializeDraftCookie(stored: StoredDraft): string {
  const envelope: StoredEnvelope = { ...stored, v: DRAFT_VERSION }
  return encodeURIComponent(JSON.stringify(envelope))
}

// The draft holds figures about someone's finances, so keep it off the wire
// in the clear wherever the page itself is served over TLS. It cannot be
// HttpOnly: the client writes it as the user types.
const secure = () =>
  typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''

/** Client-side write. The draft is a convenience, so failure is silent. */
export function writeDraftCookie(stored: StoredDraft) {
  try {
    document.cookie = `${DRAFT_COOKIE}=${serializeDraftCookie(stored)}; Path=/; Max-Age=${DRAFT_MAX_AGE}; SameSite=Lax${secure()}`
  } catch {}
}

export function clearDraftCookie() {
  try {
    document.cookie = `${DRAFT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure()}`
  } catch {}
}
