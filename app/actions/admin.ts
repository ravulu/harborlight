'use server'

import { db } from '@/lib/db'
import { retirementPlans, user, feedback } from '@/lib/db/schema'
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
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
  await requireAdmin(`/admin/plan/${id}`)
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
