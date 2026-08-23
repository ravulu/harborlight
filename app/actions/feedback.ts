'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { feedback } from '@/lib/db/schema'
import { headers } from 'next/headers'

const MAX_MESSAGE = 4000
const MAX_EMAIL = 200

export interface FeedbackResult {
  ok: boolean
  error?: string
}

/**
 * Store a note from whoever is using the app.
 *
 * Signing in is not a condition: someone who cannot get past a screen has the
 * most to say and the least ability to prove who they are. The session is
 * read when there is one, rather than trusted from the form.
 */
export async function sendFeedback(
  message: string,
  email: string,
  path: string,
): Promise<FeedbackResult> {
  const text = message.trim()
  if (!text) return { ok: false, error: 'Write something first.' }
  if (text.length > MAX_MESSAGE)
    return { ok: false, error: 'That is longer than we can store — please trim it.' }

  const session = await auth.api.getSession({ headers: await headers() })
  await db.insert(feedback).values({
    // From the session, never from the client: a form field naming a user is
    // a claim, not a fact.
    userId: session?.user?.id ?? null,
    email: (email.trim() || session?.user?.email || '').slice(0, MAX_EMAIL),
    message: text,
    path: path.slice(0, 300),
  })
  return { ok: true }
}
