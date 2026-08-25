/**
 * Admin timestamps, shown in one zone on purpose.
 *
 * The rows these format record an instant — `timestamptz` — so rendering them
 * is a choice about who is reading rather than a calculation that can be
 * wrong. The reader is whoever runs the site, and they are in Central, so that
 * is what they get, named, wherever the browser or the server happens to be.
 *
 * Named, and not optional. An admin comparing a row against their own clock
 * needs to know which clock it is in: the same figures were once read five
 * hours out because the display followed whichever machine rendered it, and
 * an unlabelled time invites exactly that mistake again.
 */

/** Where the people reading the admin pages are. */
export const ADMIN_TIME_ZONE = 'America/Chicago'

/** What to call it, without hard-coding a DST offset that is wrong half the year. */
export function adminZoneLabel(at: Date = new Date()): string {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: ADMIN_TIME_ZONE,
    timeZoneName: 'short',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? 'CT'
}

const FULL = new Intl.DateTimeFormat('en-US', {
  timeZone: ADMIN_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
})

const TIME_ONLY = new Intl.DateTimeFormat('en-US', {
  timeZone: ADMIN_TIME_ZONE,
  timeStyle: 'medium',
})

const DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: ADMIN_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const asDate = (v: Date | string | number) => (v instanceof Date ? v : new Date(v))

/** e.g. "Aug 25, 2026, 11:07 AM CDT" */
export const adminTime = (v: Date | string | number) => {
  const d = asDate(v)
  return `${FULL.format(d)} ${adminZoneLabel(d)}`
}

/** e.g. "11:07:59 AM" — for a list already grouped under its day. */
export const adminTimeOnly = (v: Date | string | number) => TIME_ONLY.format(asDate(v))

/** e.g. "Mon, Aug 25" — the heading such a list is grouped under. */
export const adminDay = (v: Date | string | number) => DAY.format(asDate(v))

/** The calendar day in Central, for grouping. Not for display. */
export const adminDayKey = (v: Date | string | number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_TIME_ZONE }).format(asDate(v))
