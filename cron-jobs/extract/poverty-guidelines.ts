import { firstFailure, must, refuse, type Extraction } from './types'

/**
 * The HHS poverty guidelines, from the annual Federal Register notice.
 *
 * The easiest of the five and therefore the first: it is a plain-text table of
 * eight rows in a document the Federal Register serves as JSON and text, with
 * no PDF between the numbers and the reader.
 *
 * ## The lag, which is the part worth getting right
 *
 * Marketplace cover for year N is tested against the guidelines published in
 * **January of year N−1**. `lib/aca.ts` holds $15,650 for `ACA_YEAR = 2026`,
 * and $15,650 is the *2025* figure — the 2026 notice says $15,960, and that is
 * what 2027 cover will be priced against.
 *
 * So an extractor that read the newest document and offered it for the current
 * year would be a year early, every year, and the error would look exactly
 * like a correct update. `forCoverageYear` is the whole reason this file has a
 * comment this long.
 *
 * ## Why the increment is derived rather than read
 *
 * The notice states it in prose — "add $5,500 for each additional person" —
 * and also implies it in the table, where every step between consecutive rows
 * is that same figure. Deriving it from the rows and **requiring all seven
 * steps to agree** turns a single number into a check on the whole table: a
 * misread row cannot survive it, where a misread prose line would.
 */

export interface PovertyGuidelines {
  fplBase: number
  fplPerExtraPerson: number
}

/** Cover for year N is priced on the guidelines published in N−1. */
export const forCoverageYear = (documentYear: number) => documentYear + 1

const HEADING = /(\d{4})\s+Poverty Guidelines for the 48 Contiguous States/i
/** `1......  $15,650` and `2......   21,150` — the dollar sign only on the first. */
const ROW = /^\s*(\d)\s*\.{3,}\s*\$?([\d,]+)\s*$/

export function extractPovertyGuidelines(
  text: string,
  url: string,
): Extraction<PovertyGuidelines> {
  const heading = text.match(HEADING)
  if (!heading) {
    return refuse(
      'No "NNNN Poverty Guidelines for the 48 Contiguous States" heading. Either the document is not the annual update, or its layout has changed.',
    )
  }
  const documentYear = Number(heading[1])

  // Only the 48-contiguous table. Alaska and Hawaii have their own, higher
  // figures directly beneath it, and reading past the first table would pick
  // them up and quietly price the whole country as Alaska.
  const after = text.slice(heading.index! + heading[0].length)
  const rows: { persons: number; amount: number; line: string }[] = []
  for (const line of after.split('\n')) {
    const m = line.match(ROW)
    if (!m) {
      // The table is contiguous; the first non-row after it ends it.
      if (rows.length > 0 && line.includes('---')) break
      continue
    }
    rows.push({
      persons: Number(m[1]),
      amount: Number(m[2].replace(/,/g, '')),
      line: line.trim(),
    })
    if (rows.length === 8) break
  }

  const failure = firstFailure(
    must(rows.length === 8, `Found ${rows.length} household-size rows, expected 8.`),
    must(
      rows.every((r, i) => r.persons === i + 1),
      'The rows are not 1 to 8 in order.',
    ),
    must(
      documentYear >= 2020 && documentYear <= 2100,
      `The heading says ${documentYear}, which is not a plausible year.`,
    ),
  )
  if (failure) return failure

  const base = rows[0].amount
  const steps = rows.slice(1).map((r, i) => r.amount - rows[i].amount)
  const perExtra = steps[0]

  const second = firstFailure(
    must(
      steps.every((s) => s === perExtra),
      `The steps between household sizes are not equal (${steps.join(', ')}), so at least one row was misread.`,
    ),
    // Sane bands. Wide on purpose: they are here to catch a parse that has
    // gone badly wrong, not to second-guess HHS.
    must(base > 10_000 && base < 40_000, `A one-person guideline of ${base} is outside anything plausible.`),
    must(
      perExtra > 3_000 && perExtra < 12_000,
      `An increment of ${perExtra} per additional person is outside anything plausible.`,
    ),
    must(perExtra < base, 'Each additional person costs more than the first, which cannot be right.'),
  )
  if (second) return second

  return {
    ok: true,
    year: forCoverageYear(documentYear),
    values: { fplBase: base, fplPerExtraPerson: perExtra },
    evidence: {
      url,
      documentYear,
      quoted: [heading[0].trim(), ...rows.slice(0, 2).map((r) => r.line)],
    },
    notes: [
      `Published for ${documentYear}; marketplace cover for ${forCoverageYear(documentYear)} is priced against it.`,
    ],
  }
}
