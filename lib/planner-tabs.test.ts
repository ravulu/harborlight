import { describe, expect, it } from 'vitest'
import {
  PLANNER_TABS,
  WORKSPACE_TABS,
  isSectionPath,
  sectionPath,
  tabLabel,
  tabPath,
} from '@/lib/planner-tabs'
import { EVENT_NAMES, isEventName } from '@/lib/events'

describe('the planner tabs', () => {
  it('names each tab once', () => {
    const values = PLANNER_TABS.map((t) => t.value)
    const labels = PLANNER_TABS.map((t) => t.label)
    expect(new Set(values).size).toBe(values.length)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('round-trips a tab through the path it is recorded against', () => {
    for (const t of PLANNER_TABS) {
      expect(tabLabel(tabPath(t.value)), t.value).toBe(t.label)
    }
  })

  it('leaves a path it does not recognise alone', () => {
    // A tab could be renamed or removed while its events are still in the
    // table. Showing the raw path is honest; guessing a label is not.
    expect(tabLabel('/planner#gone')).toBe('/planner#gone')
    expect(tabLabel('/planner')).toBe('/planner')
  })

  it('records under a name the action will actually accept', () => {
    // `track` drops anything not in the fixed list, silently. A typo here
    // would lose every tab view without a single error anywhere.
    expect(isEventName('tab_viewed')).toBe(true)
    expect(EVENT_NAMES).toContain('tab_viewed')
  })

  it('keeps each tab distinct in the once-per-visit key', () => {
    // `record(..., once)` de-duplicates on `${name}:${path}`. If two tabs
    // produced the same path, opening one would silence the other for the
    // rest of the visit.
    const paths = PLANNER_TABS.map((t) => tabPath(t.value))
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('survives the query-string trim the action performs', () => {
    // `cleanPath` splits on '?' before storing. A fragment must not be lost
    // to that, or every tab would be recorded as plain "/planner".
    for (const t of PLANNER_TABS) {
      expect(tabPath(t.value).split('?')[0]).toBe(tabPath(t.value))
      expect(tabPath(t.value)).toContain('#')
    }
  })
})

/**
 * Two levels of tab share one event name and are told apart by their path.
 *
 * The top-level register tab was called `balance` for a while, which is also
 * the projection's first tab — recorded against the same fragment they would
 * have been counted as one thing, and the admin would have reported a number
 * that was two numbers added together.
 */
describe('the two levels of tab do not collide', () => {
  it('gives the top-level tabs their own paths', () => {
    for (const t of WORKSPACE_TABS) {
      expect(sectionPath(t.value)).toContain('#section-')
      expect(tabLabel(sectionPath(t.value))).toBe(t.label)
      expect(isSectionPath(sectionPath(t.value))).toBe(true)
    }
  })

  it('shares no path with the projection tabs', () => {
    const sections = WORKSPACE_TABS.map((t) => sectionPath(t.value))
    const tabs = PLANNER_TABS.map((t) => tabPath(t.value))
    expect(new Set([...sections, ...tabs]).size).toBe(sections.length + tabs.length)
  })

  it('keeps the projection tabs out of the section bucket', () => {
    for (const t of PLANNER_TABS) {
      expect(isSectionPath(tabPath(t.value)), t.value).toBe(false)
      expect(tabLabel(tabPath(t.value))).toBe(t.label)
    }
  })

  it('leaves an unrecognised section path alone', () => {
    expect(tabLabel('/planner#section-gone')).toBe('/planner#section-gone')
  })
})
