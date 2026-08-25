import { describe, expect, it } from 'vitest'
import { PLANNER_TABS, tabLabel, tabPath } from '@/lib/planner-tabs'
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
