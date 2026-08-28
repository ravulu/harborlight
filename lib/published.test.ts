import { afterEach, describe, expect, it, vi } from 'vitest'

import { PUBLISHED, staleTables, yearsBehind } from '@/lib/published'

/**
 * One guard for every figure somebody else publishes.
 *
 * `lib/tax.ts`, `lib/irmaa.ts` and `lib/aca.ts` each carried their own version
 * of this and it worked — the three of them have been failing on 1 January by
 * design for a while. What they could not do was cover the two tables nobody
 * had written a guard for: fifty state schedules and the HSA limits, both
 * hand-entered, both annual, both silent.
 *
 * So the list moved into `lib/published.ts` and the guard reads the list. A
 * table added there is guarded the moment it is added, which is the only
 * arrangement where the sixth one does not get forgotten the way the fourth
 * and fifth were.
 */
describe('the published figures', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each(PUBLISHED)('$label has not been overtaken by the calendar', (table) => {
    const currentYear = new Date().getFullYear()
    expect(
      currentYear,
      `\n\n  ${table.label} holds published figures for ${table.year}, and it is now ` +
        `${currentYear}.\n` +
        `  The app has not broken: past its year it ${
          table.pastItsYear === 'indexed'
            ? 'rolls the last real table forward by indexation and marks it estimated'
            : 'holds the last real figures unchanged'
        }.\n` +
        `  Replace the estimate with the real thing:\n` +
        `    where:  ${table.where}\n` +
        `    source: ${table.source.title}\n` +
        `            ${table.source.url}\n` +
        `    then move the year constant for "${table.key}".\n`,
    ).toBeLessThanOrEqual(table.year)
  })

  /**
   * The guard is only worth having if it fires, and it cannot be seen to fire
   * until a year that has not happened. Wind the clock forward instead.
   */
  it('trips as soon as the calendar passes a table', () => {
    const newest = Math.max(...PUBLISHED.map((t) => t.year))
    vi.useFakeTimers()
    // Mid-year, so no timezone can put the faked date back into the old year.
    vi.setSystemTime(new Date(`${newest + 1}-06-15T12:00:00`))
    expect(staleTables()).toHaveLength(PUBLISHED.length)
    expect(staleTables().every((t) => yearsBehind(t) >= 1)).toBe(true)
  })

  it('reports nothing stale while every table is current', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${Math.min(...PUBLISHED.map((t) => t.year))}-06-15T12:00:00`))
    expect(staleTables()).toEqual([])
  })

  it('counts how far behind each table is, not merely that it is', () => {
    const [first] = PUBLISHED
    vi.useFakeTimers()
    vi.setSystemTime(new Date(`${first.year + 3}-06-15T12:00:00`))
    expect(yearsBehind(first)).toBe(3)
  })
})

/**
 * The entries themselves.
 *
 * A registry that other code reads is only as good as its worst row: a missing
 * url or a duplicated key fails somewhere far away from here — in a watcher's
 * report, or on the admin page — where it reads as a bug in that thing rather
 * than a typo in this list.
 */
describe('the registry', () => {
  it('covers every table this app hand-enters', () => {
    expect(PUBLISHED.map((t) => t.key).sort()).toEqual([
      'aca',
      'federal-brackets',
      'hsa-limits',
      'irmaa',
      'state-brackets',
    ])
  })

  it('gives every entry a key of its own', () => {
    expect(new Set(PUBLISHED.map((t) => t.key)).size).toBe(PUBLISHED.length)
  })

  it('says where every figure came from, with somewhere to go', () => {
    for (const t of PUBLISHED) {
      expect(t.source.title, t.key).not.toHaveLength(0)
      expect(t.source.url, t.key).toMatch(/^https:\/\//)
      expect(t.where, t.key).not.toHaveLength(0)
      expect(t.publishedAround, t.key).not.toHaveLength(0)
    }
  })

  it('says what happens past each table year, so nothing degrades silently', () => {
    for (const t of PUBLISHED) {
      expect(['indexed', 'held'], t.key).toContain(t.pastItsYear)
    }
  })

  it('holds a plausible year for each', () => {
    for (const t of PUBLISHED) {
      expect(Number.isInteger(t.year), t.key).toBe(true)
      expect(t.year, t.key).toBeGreaterThan(2020)
    }
  })
})
