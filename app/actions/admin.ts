'use server'

import { db } from '@/lib/db'
import { retirementPlans, user, feedback, events } from '@/lib/db/schema'
import { and, countDistinct, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import { isSectionPath, tabLabel } from '@/lib/planner-tabs'
import { requireAdmin } from '@/lib/admin'

const LIMIT = 200

export interface PlanHit {
  id: number
  name: string
  personName: string
  ownerEmail: string
  ownerName: string
  retirementAge: number
  currentAge: number
  monthlyRetirementSpending: number
  updatedAt: string
}

export interface AdminPlanView {
  plan: import('@/lib/db/schema').RetirementPlan
  owner: { email: string; name: string }
}

/**
 * One plan, whoever owns it.
 *
 * The planner deliberately serves a plan only to the account that saved it,
 * which is right for the product and useless for support — so this reads it
 * directly, and the page that shows it cannot edit or save.
 */
export async function getPlanForAdmin(id: number): Promise<AdminPlanView | null> {
  await requireAdmin()
  const [row] = await db
    .select({ plan: retirementPlans, email: user.email, name: user.name })
    .from(retirementPlans)
    .leftJoin(user, eq(retirementPlans.userId, user.id))
    .where(eq(retirementPlans.id, id))
    .limit(1)
  if (!row) return null
  return {
    plan: row.plan,
    owner: { email: row.email ?? '(account deleted)', name: row.name ?? '' },
  }
}

export interface FeedbackHit {
  id: number
  message: string
  email: string
  path: string
  createdAt: string
  ownerEmail: string | null
}

/** Every plan belonging to the account with this email. */
export async function lookupPlansByEmail(email: string): Promise<{
  found: boolean
  owner?: { email: string; name: string }
  plans: PlanHit[]
}> {
  await requireAdmin()
  const term = email.trim()
  if (!term) return { found: false, plans: [] }

  // Case-insensitive: an address typed with different capitals is the same
  // address, and nobody looking someone up remembers which they used.
  const [owner] = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(sql`lower(${user.email}) = lower(${term})`)
    .limit(1)

  if (!owner) return { found: false, plans: [] }

  const rows = await db
    .select()
    .from(retirementPlans)
    .where(eq(retirementPlans.userId, owner.id))
    .orderBy(desc(retirementPlans.updatedAt))
    .limit(LIMIT)

  return {
    found: true,
    owner: { email: owner.email, name: owner.name },
    plans: rows.map((p) => ({
      id: p.id,
      name: p.name,
      personName: p.personName,
      ownerEmail: owner.email,
      ownerName: owner.name,
      retirementAge: p.retirementAge,
      currentAge: p.currentAge,
      monthlyRetirementSpending: p.monthlyRetirementSpending,
      updatedAt: p.updatedAt.toISOString(),
    })),
  }
}

/**
 * Feedback written between two dates, newest first.
 *
 * Both bounds are optional and both are inclusive: someone asking for the 3rd
 * to the 5th means all of the 5th, not up to the moment it began. The dates
 * arrive as the calendar days the form showed, and are turned into instants
 * here — the day someone picks is the day in the server's own zone, which is
 * the one the timestamps were written in.
 */
export async function feedbackInRange(
  from: string,
  to: string,
): Promise<FeedbackHit[]> {
  await requireAdmin()

  const dayStart = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim())
    if (!m) return null
    const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(at.getTime()) ? null : at
  }

  const start = dayStart(from)
  const endDay = dayStart(to)
  // The instant after the last day ends, so `lt` keeps every moment within it.
  const end = endDay ? new Date(endDay.getTime() + 24 * 60 * 60 * 1000) : null

  const bounds = [
    start ? gte(feedback.createdAt, start) : undefined,
    end ? lt(feedback.createdAt, end) : undefined,
  ].filter(Boolean)

  const rows = await db
    .select({
      id: feedback.id,
      message: feedback.message,
      email: feedback.email,
      path: feedback.path,
      createdAt: feedback.createdAt,
      ownerEmail: user.email,
    })
    .from(feedback)
    .leftJoin(user, eq(feedback.userId, user.id))
    .where(bounds.length ? and(...bounds) : undefined)
    .orderBy(desc(feedback.createdAt))
    .limit(LIMIT)

  return rows.map((r) => ({
    id: r.id,
    message: r.message,
    email: r.email,
    path: r.path,
    createdAt: r.createdAt.toISOString(),
    ownerEmail: r.ownerEmail ?? null,
  }))
}


// --- Usage ------------------------------------------------------------------

export interface FunnelStep {
  name: string
  label: string
  /** Distinct visits that reached this step. */
  visits: number
  /** Share of the visits that landed at all. */
  share: number
}

export interface UsageSummary {
  from: string
  to: string
  visits: number
  steps: FunnelStep[]
  /** Visits that saw one page and nothing else. */
  bounced: number
  bounceRate: number
  /** Visits that never signed in, and how far they got. */
  anonymousVisits: number
  anonymousCompleted: number
  /** Where the visits came from, most common first. */
  referrers: { source: string; visits: number }[]
  /** The most-seen pages. */
  pages: { path: string; visits: number }[]
  /** Roughly where visits came from. Country only — no address is stored. */
  places: { country: string; region: string; city: string; visits: number }[]
  /**
   * Which result tabs got opened, most-opened first.
   *
   * Only deliberate switches: the first tab is shown without a click, so
   * counting it would report an interest nobody expressed. A tab missing from
   * this list was never switched to, which is the finding.
   */
  tabs: { label: string; visits: number }[]
  /** The two top-level tabs: the plan, and the register beside it. */
  sections: { label: string; visits: number }[]
  /**
   * Visits that put something on the register, not just opened the tab.
   *
   * Counted beside the section opens rather than in the funnel: entering a
   * house is not a step on the way to saving a plan, it is a different thing
   * somebody chose to do. Against the open count it answers the only question
   * worth asking of a new tab — do the people who find it use it.
   */
  registerStarted: number
  /**
   * The last few visits, each with what it did, in order.
   *
   * Grouped by session rather than by person, because a person is not
   * something this table knows. `session` is a sessionStorage id: it lasts one
   * browser run, cannot follow anyone across days or sites, and is the whole
   * reason none of this needs a cookie or a banner. A returning visitor is
   * simply a new visit here, which is the right unit for asking where people
   * give up anyway.
   *
   * Everything else on this page is a rate, and a rate cannot answer "is the
   * tracking working right now" — the question actually being asked when
   * somebody opens this after a change.
   */
  recentSessions: {
    session: string
    startedAt: Date
    endedAt: Date
    isAuthed: boolean
    place: string
    referrer: string
    /** How far along the funnel this visit got, by label. */
    reached: string
    events: { id: number; name: string; path: string; at: Date }[]
  }[]
}

/** Enough to see the last stretch of activity, not a log viewer. */
/**
 * How many visits the list carries.
 *
 * Twelve, until the range could be widened past ninety days — at which point
 * asking for a year still returned the same twelve, so the totals moved and
 * the list did not. Each visit brings its own events along, so this is a real
 * cost rather than a free number; fifty is a page worth reading without being
 * a query worth worrying about.
 *
 * Whatever it is, the reader is told when it bites: a list that is quietly
 * the most recent fifty of six hundred reads as six hundred.
 */
const RECENT_SESSIONS = 50

/** Read in order, so the drop between any two is the interesting number. */
const FUNNEL: { name: string; label: string }[] = [
  { name: 'page_view', label: 'Landed' },
  { name: 'plan_started', label: 'Typed a figure' },
  { name: 'plan_completed', label: 'Saw a projection' },
  { name: 'plan_saved', label: 'Saved a plan' },
]

/**
 * Where visits get to, and where they stop.
 *
 * Counted in distinct visits rather than rows: someone who opened the planner
 * six times is one person deciding, not six. A bounce is a visit with a single
 * event and nothing after it, which is why nothing has to be recorded when
 * somebody leaves — leaving is the absence of a next row.
 */
export async function getUsage(from: string, to: string): Promise<UsageSummary> {
  await requireAdmin()

  /**
   * Either end may be left out, which means no bound on that side.
   *
   * It used to take both as given and hand them to `new Date`, so the only
   * ranges it could answer were the ones its own buttons offered — nothing
   * older than ninety days, and no way to ask. An unparsed date became an
   * Invalid Date and every comparison against it was false, which returns an
   * empty page rather than an error.
   */
  const dayStart = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim())
    if (!m) return null
    const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(at.getTime()) ? null : at
  }

  const start = dayStart(from)
  const endDay = dayStart(to)
  // The instant after the last day ends, so `lt` keeps every moment within it.
  const end = endDay ? new Date(endDay.getTime() + 24 * 60 * 60 * 1000) : null

  const window = and(
    ...[
      start ? gte(events.createdAt, start) : undefined,
      end ? lt(events.createdAt, end) : undefined,
    ].filter(Boolean),
  )

  const [{ visits = 0 } = {}] = await db
    .select({ visits: countDistinct(events.session) })
    .from(events)
    .where(window)

  const byName = await db
    .select({ name: events.name, visits: countDistinct(events.session) })
    .from(events)
    .where(window)
    .groupBy(events.name)

  const reached = new Map(byName.map((r) => [r.name, r.visits]))

  // A visit with exactly one row saw a page and went no further.
  const [{ bounced = 0 } = {}] = await db
    .select({ bounced: sql<number>`count(*)::int` })
    .from(
      db
        .select({ session: events.session })
        .from(events)
        .where(window)
        .groupBy(events.session)
        .having(sql`count(*) = 1`)
        .as('single'),
    )

  const [{ anon = 0 } = {}] = await db
    .select({ anon: countDistinct(events.session) })
    .from(events)
    .where(and(window, eq(events.isAuthed, false)))

  const [{ anonDone = 0 } = {}] = await db
    .select({ anonDone: countDistinct(events.session) })
    .from(events)
    .where(
      and(window, eq(events.isAuthed, false), eq(events.name, 'plan_completed')),
    )

  const referrers = await db
    .select({ source: events.referrer, visits: countDistinct(events.session) })
    .from(events)
    .where(and(window, sql`${events.referrer} <> ''`))
    .groupBy(events.referrer)
    .orderBy(desc(countDistinct(events.session)))
    .limit(10)

  const pages = await db
    .select({ path: events.path, visits: countDistinct(events.session) })
    .from(events)
    .where(and(window, eq(events.name, 'page_view')))
    .groupBy(events.path)
    .orderBy(desc(countDistinct(events.session)))
    .limit(10)

  const places = await db
    .select({
      country: events.country,
      region: events.region,
      city: events.city,
      visits: countDistinct(events.session),
    })
    .from(events)
    .where(and(window, sql`${events.country} <> ''`))
    .groupBy(events.country, events.region, events.city)
    .orderBy(desc(countDistinct(events.session)))
    .limit(12)

  const tabRows = await db
    .select({ path: events.path, visits: countDistinct(events.session) })
    .from(events)
    .where(and(window, eq(events.name, 'tab_viewed')))
    .groupBy(events.path)

  // Counted apart: "did anybody open the register" and "did anybody read the
  // tax view" are different findings, and one list would rank them against
  // each other as though they competed.
  const tabs = tabRows
    .filter((r) => !isSectionPath(r.path))
    .map((r) => ({ label: tabLabel(r.path), visits: r.visits }))
    .sort((a, b) => b.visits - a.visits)

  const [{ registerStarted = 0 } = {}] = await db
    .select({ registerStarted: countDistinct(events.session) })
    .from(events)
    .where(and(window, eq(events.name, 'register_started')))

  const sections = tabRows
    .filter((r) => isSectionPath(r.path))
    .map((r) => ({ label: tabLabel(r.path), visits: r.visits }))
    .sort((a, b) => b.visits - a.visits)

  // The most recent visits first, then everything each of them did. Two
  // queries rather than one: a limit on events would cut a visit in half and
  // show a visit that landed but apparently never left the page.
  // Newest first, by last activity rather than by when a visit began: a visit
  // still going is more recent than one that finished an hour ago, whenever it
  // started. The list shows the same figure it is sorted by.
  const latest = await db
    .select({ session: events.session, last: sql<Date>`max(${events.createdAt})` })
    .from(events)
    .where(window)
    .groupBy(events.session)
    .orderBy(desc(sql`max(${events.createdAt})`))
    .limit(RECENT_SESSIONS)

  const ids = latest.map((r) => r.session)
  const rows = ids.length
    ? await db
        .select()
        .from(events)
        .where(inArray(events.session, ids))
        .orderBy(events.createdAt)
    : []

  const furthest = (names: Set<string>) =>
    [...FUNNEL].reverse().find((f) => names.has(f.name))?.label ?? '—'

  const recentSessions = ids.map((id) => {
    const mine = rows.filter((r) => r.session === id)
    const withPlace = mine.find((r) => r.city || r.region || r.country)
    return {
      session: id,
      startedAt: mine[0].createdAt,
      endedAt: mine[mine.length - 1].createdAt,
      isAuthed: mine.some((r) => r.isAuthed),
      place: withPlace
        ? [withPlace.city, withPlace.region, withPlace.country].filter(Boolean).join(', ')
        : '',
      referrer: mine.find((r) => r.referrer)?.referrer ?? '',
      reached: furthest(new Set(mine.map((r) => r.name))),
      events: mine.map((r) => ({ id: r.id, name: r.name, path: r.path, at: r.createdAt })),
    }
  })

  return {
    from,
    to,
    visits,
    steps: FUNNEL.map((f) => ({
      ...f,
      visits: reached.get(f.name) ?? 0,
      share: visits > 0 ? (reached.get(f.name) ?? 0) / visits : 0,
    })),
    bounced,
    bounceRate: visits > 0 ? bounced / visits : 0,
    anonymousVisits: anon,
    anonymousCompleted: anonDone,
    referrers,
    pages,
    places,
    tabs,
    sections,
    registerStarted,
    recentSessions,
  }
}

/**
 * Remove one visit and everything it did.
 *
 * A visit is a session id and the rows carrying it, so deleting the visit
 * means deleting those rows — there is nothing else to unpick. Own testing,
 * a bot that got through, a run that skews a small funnel: things worth
 * taking out rather than reasoning around every time the numbers are read.
 *
 * Admin only, and checked here rather than trusted from the caller: a server
 * action is an endpoint, and the page it is normally reached from is not a
 * guard on it.
 *
 * Returns how many rows went, so the page can say what it did rather than
 * quietly refresh.
 */
export async function deleteVisit(session: string): Promise<number> {
  await requireAdmin()
  const id = session.trim()
  // An empty id would match every row with an empty session and is never a
  // visit anybody clicked on.
  if (!id) return 0
  const gone = await db.delete(events).where(eq(events.session, id)).returning({
    id: events.id,
  })
  return gone.length
}