/**
 * What an extractor is allowed to return.
 *
 * Layer 2 of `docs/tax-data-updates.md`. An extractor reads one published
 * document and offers figures for a person to check. It has exactly two
 * honest outcomes and **a partial table is not one of them**: half a parse is
 * how a plausible-looking wrong number reaches a tax engine.
 *
 * Nothing here writes to `lib/`. The runner prints a candidate and a diff; a
 * person types the table.
 */

export interface Candidate<T> {
  ok: true
  /** The year the figures are *for*, which is not always the year on the document. */
  year: number
  values: T
  /** Where it came from, for the patch and for the reviewer. */
  evidence: {
    url: string
    documentYear: number
    /** The lines the numbers were read from, so a reviewer can see the source. */
    quoted: string[]
  }
  /** Things that parsed but look worth a second glance. Never fatal. */
  notes: string[]
}

export interface Refusal {
  ok: false
  /** Why, in a sentence somebody can act on. */
  reason: string
}

export type Extraction<T> = Candidate<T> | Refusal

export const refuse = (reason: string): Refusal => ({ ok: false, reason })

/**
 * A guard that reads as a sentence at the call site.
 *
 * `must(base > 10_000, 'the base is implausibly small')` rather than an if
 * with a return: the checks are the substance of an extractor and they should
 * be able to be read in a list.
 */
export function must(condition: boolean, reason: string): Refusal | null {
  return condition ? null : refuse(reason)
}

/** The first guard that failed, or null. */
export const firstFailure = (...checks: (Refusal | null)[]): Refusal | null =>
  checks.find((c): c is Refusal => c !== null) ?? null
