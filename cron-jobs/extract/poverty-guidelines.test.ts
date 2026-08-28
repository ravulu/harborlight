import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { FPL_BASE, FPL_PER_EXTRA_PERSON, ACA_YEAR } from '@/lib/aca'
import {
  extractPovertyGuidelines,
  forCoverageYear,
} from './poverty-guidelines'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (year: number) =>
  readFileSync(join(here, 'fixtures', `poverty-${year}.txt`), 'utf8')

/**
 * The test that makes an extractor worth trusting: it has to reproduce the
 * table somebody already checked by hand.
 *
 * A parser can only be tried against documents that exist, and the one that
 * matters — next year's — does not. So it is pointed at the document the
 * current figures came from and required to produce those figures exactly. If
 * it can read 2025 and get what a person read from 2025, it is likely to read
 * 2027 correctly; if it cannot, nothing it says about 2027 is worth reading.
 *
 * This also fails if somebody edits `lib/aca.ts` by hand and gets it wrong,
 * which is the other direction the same check runs in.
 */
describe('the poverty guidelines extractor', () => {
  it('reproduces the figures this app already holds', () => {
    const got = extractPovertyGuidelines(fixture(2025), 'fixture://2025')
    expect(got.ok).toBe(true)
    if (!got.ok) return

    expect(got.values.fplBase).toBe(FPL_BASE)
    expect(got.values.fplPerExtraPerson).toBe(FPL_PER_EXTRA_PERSON)
    // And the lag: the 2025 notice is what 2026 cover is priced against, which
    // is the year the app says it holds.
    expect(got.year).toBe(ACA_YEAR)
    expect(got.evidence.documentYear).toBe(2025)
  })

  it('reads the following year from the following notice', () => {
    const got = extractPovertyGuidelines(fixture(2026), 'fixture://2026')
    expect(got.ok).toBe(true)
    if (!got.ok) return

    expect(got.values).toEqual({ fplBase: 15_960, fplPerExtraPerson: 5_680 })
    expect(got.year).toBe(2027)
    // The increment is derived from the rows, so this asserts the whole table
    // was read consistently rather than one line of prose.
    expect(got.values.fplPerExtraPerson).toBe(21_640 - 15_960)
  })

  it('quotes what it read, so a reviewer need not take its word', () => {
    const got = extractPovertyGuidelines(fixture(2026), 'fixture://2026')
    if (!got.ok) throw new Error('expected a candidate')
    expect(got.evidence.quoted[0]).toMatch(/2026 Poverty Guidelines/)
    expect(got.evidence.quoted.join(' ')).toMatch(/15,960/)
  })

  it('states the lag rather than leaving it to be inferred', () => {
    expect(forCoverageYear(2026)).toBe(2027)
    const got = extractPovertyGuidelines(fixture(2026), 'fixture://2026')
    if (!got.ok) throw new Error('expected a candidate')
    expect(got.notes.join(' ')).toMatch(/cover for 2027/)
  })
})

/**
 * Refusing, which is the half that keeps this safe.
 *
 * An extractor that returns something plausible from a document it did not
 * understand is worse than no extractor: the number reaches a reviewer with a
 * source URL beside it, which is exactly what makes it convincing.
 */
describe('what it refuses', () => {
  const reasonFor = (text: string) => {
    const got = extractPovertyGuidelines(text, 'fixture://broken')
    expect(got.ok).toBe(false)
    return got.ok ? '' : got.reason
  }

  it('refuses a document that is not the annual update', () => {
    expect(reasonFor('Agency Information Collection Activities: something else')).toMatch(
      /not the annual update|layout has changed/i,
    )
  })

  it('refuses a table it could not read to the end', () => {
    const short = fixture(2026).split('\n').slice(0, 8).join('\n')
    expect(reasonFor(short)).toMatch(/expected 8/)
  })

  /**
   * The guard the derived increment exists for. One digit changed in one row
   * is the most likely real-world misread, and it is invisible to any check
   * that reads the prose line instead.
   */
  it('refuses when one row disagrees with the rest', () => {
    const tampered = fixture(2026).replace('21,640', '21,999')
    expect(reasonFor(tampered)).toMatch(/steps between household sizes are not equal/)
  })

  it('refuses figures outside anything plausible', () => {
    expect(reasonFor(fixture(2026).replace('$15,960', '$1,596'))).toMatch(
      /outside anything plausible|not equal/,
    )
  })

  it('never returns a partial table', () => {
    // Every refusal path returns `ok: false` and nothing else — there is no
    // shape in which some fields are filled and others are not.
    const got = extractPovertyGuidelines('nonsense', 'fixture://broken')
    expect(got).toEqual({ ok: false, reason: expect.any(String) })
  })
})
