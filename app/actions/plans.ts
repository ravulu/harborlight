'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { retirementPlans, type NewRetirementPlan } from '@/lib/db/schema'
import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { PlanInputs } from '@/lib/retirement'
import { inputsToPlan } from '@/lib/plan'

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Unauthorized')
  return session.user.id
}

export async function getPlans() {
  const userId = await getUserId()
  return db
    .select()
    .from(retirementPlans)
    .where(eq(retirementPlans.userId, userId))
    .orderBy(desc(retirementPlans.updatedAt))
}

export async function savePlan(name: string, personName: string, inputs: PlanInputs) {
  const userId = await getUserId()
  const values: NewRetirementPlan = {
    userId,
    name: name.trim() || 'Untitled plan',
    personName: personName.trim().slice(0, 120),
    ...inputsToPlan(inputs),
  }
  const [row] = await db.insert(retirementPlans).values(values).returning()
  revalidatePath('/dashboard')
  return row
}

export async function updatePlan(
  id: number,
  name: string,
  personName: string,
  inputs: PlanInputs,
) {
  const userId = await getUserId()
  await db
    .update(retirementPlans)
    .set({
      name: name.trim() || 'Untitled plan',
      personName: personName.trim().slice(0, 120),
      ...inputsToPlan(inputs),
      updatedAt: new Date(),
    })
    .where(and(eq(retirementPlans.id, id), eq(retirementPlans.userId, userId)))
  revalidatePath('/dashboard')
}

export async function deletePlan(id: number) {
  const userId = await getUserId()
  await db
    .delete(retirementPlans)
    .where(and(eq(retirementPlans.id, id), eq(retirementPlans.userId, userId)))
  revalidatePath('/dashboard')
}
